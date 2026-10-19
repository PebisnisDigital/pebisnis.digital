create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null references public.users(id) on delete restrict,
  product_label text not null default 'PROMPT VIRAL — Kumpulan Prompt' check (char_length(trim(product_label)) between 3 and 160),
  amount_idr bigint not null default 0 check (amount_idr >= 0),
  private_chat_id bigint not null,
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT','PAID','CANCELLED','EXPIRED')),
  source text not null default 'ADMIN' check (source in ('ADMIN','BOT','CHECKOUT')),
  payment_reference text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.admin_profiles(auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_orders_one_pending_per_user_idx
  on public.purchase_orders(user_id) where status = 'PENDING_PAYMENT';
create index if not exists purchase_orders_status_created_idx
  on public.purchase_orders(status, created_at desc);
create index if not exists purchase_orders_created_by_idx
  on public.purchase_orders(created_by);

alter table public.purchase_orders enable row level security;
drop policy if exists purchase_orders_admin_select on public.purchase_orders;
create policy purchase_orders_admin_select on public.purchase_orders
  for select to authenticated using ((select private.is_active_admin()));
grant select on public.purchase_orders to authenticated;
revoke insert, update, delete on public.purchase_orders from anon, authenticated;

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists comment_claims_enqueue_follow_up on public.comment_claims;
drop function if exists private.enqueue_claim_follow_ups();

alter table public.follow_up_automations
  drop constraint if exists follow_up_automations_trigger_event_check;
alter table public.follow_up_automations
  alter column trigger_event set default 'ORDER_PENDING_PAYMENT';
update public.follow_up_automations set trigger_event = 'ORDER_PENDING_PAYMENT';
alter table public.follow_up_automations
  add constraint follow_up_automations_trigger_event_check check (trigger_event = 'ORDER_PENDING_PAYMENT');

alter table public.follow_up_enrollments
  drop constraint if exists follow_up_enrollments_source_id_fkey;
alter table public.follow_up_enrollments
  drop constraint if exists follow_up_enrollments_source_type_check;
alter table public.follow_up_enrollments
  alter column source_type set default 'PURCHASE_ORDER';
update public.follow_up_enrollments set source_type = 'PURCHASE_ORDER';
alter table public.follow_up_enrollments
  add constraint follow_up_enrollments_source_type_check check (source_type = 'PURCHASE_ORDER');
alter table public.follow_up_enrollments
  add constraint follow_up_enrollments_source_id_fkey foreign key (source_id) references public.purchase_orders(id) on delete restrict;

create or replace function public.admin_save_follow_up_automation(
  p_automation_id uuid,
  p_name text,
  p_status text,
  p_steps jsonb
) returns public.follow_up_automations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_automation public.follow_up_automations;
  v_step jsonb;
  v_position integer := 0;
  v_delay integer;
  v_message text;
  v_button_text text;
  v_button_url text;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_name)) not between 3 and 100 then raise exception 'INVALID_AUTOMATION_NAME'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'INVALID_AUTOMATION_STATUS'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) not between 1 and 5 then raise exception 'INVALID_FOLLOW_UP_STEPS'; end if;

  if p_automation_id is null then
    insert into public.follow_up_automations(name, trigger_event, status, created_by)
    values (trim(p_name), 'ORDER_PENDING_PAYMENT', p_status, v_actor)
    returning * into v_automation;
  else
    update public.follow_up_automations
    set name = trim(p_name), status = p_status, trigger_event = 'ORDER_PENDING_PAYMENT'
    where id = p_automation_id
    returning * into v_automation;
    if not found then raise exception 'FOLLOW_UP_AUTOMATION_NOT_FOUND'; end if;
    delete from public.follow_up_steps where automation_id = v_automation.id;
  end if;

  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_position := v_position + 1;
    v_delay := (v_step ->> 'delay_minutes')::integer;
    v_message := trim(coalesce(v_step ->> 'message_text', ''));
    v_button_text := trim(coalesce(v_step ->> 'button_text', ''));
    v_button_url := trim(coalesce(v_step ->> 'button_url', ''));
    if v_delay not between 1 and 10080 then raise exception 'INVALID_FOLLOW_UP_DELAY'; end if;
    if char_length(v_message) not between 3 and 4096 then raise exception 'INVALID_FOLLOW_UP_MESSAGE'; end if;
    if char_length(v_button_text) > 64 then raise exception 'INVALID_FOLLOW_UP_BUTTON'; end if;
    if (v_button_text = '') <> (v_button_url = '') then raise exception 'INCOMPLETE_FOLLOW_UP_BUTTON'; end if;
    if v_button_url <> '' and v_button_url !~ '^https://' then raise exception 'INVALID_FOLLOW_UP_URL'; end if;
    insert into public.follow_up_steps(automation_id, position, delay_minutes, message_text, button_text, button_url)
    values (v_automation.id, v_position, v_delay, v_message, v_button_text, v_button_url);
  end loop;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'FOLLOW_UP_AUTOMATION_SAVED', 'FOLLOW_UP_AUTOMATION', v_automation.id,
    jsonb_build_object('status', p_status, 'steps', v_position, 'trigger', 'ORDER_PENDING_PAYMENT'));
  return v_automation;
end;
$function$;

revoke all on function public.admin_save_follow_up_automation(uuid,text,text,jsonb) from public, anon;
grant execute on function public.admin_save_follow_up_automation(uuid,text,text,jsonb) to authenticated;

create or replace function private.sync_order_follow_ups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_automation record;
  v_enrollment_id uuid;
begin
  if new.status = 'PENDING_PAYMENT' and (tg_op = 'INSERT' or old.status is distinct from 'PENDING_PAYMENT') then
    for v_automation in
      select a.id, s.delay_minutes
      from public.follow_up_automations a
      join public.follow_up_steps s on s.automation_id = a.id and s.position = 1
      where a.status = 'ACTIVE' and a.trigger_event = 'ORDER_PENDING_PAYMENT'
    loop
      insert into public.follow_up_enrollments(
        automation_id,user_id,source_type,source_id,private_chat_id,next_run_at
      ) values (
        v_automation.id,new.user_id,'PURCHASE_ORDER',new.id,new.private_chat_id,
        clock_timestamp() + make_interval(mins => v_automation.delay_minutes)
      )
      on conflict (automation_id, source_id) do nothing
      returning id into v_enrollment_id;

      if v_enrollment_id is not null then
        insert into public.scheduled_jobs(
          job_type,entity_type,entity_id,payload,idempotency_key,status,priority,run_at,max_attempts,correlation_id
        )
        select 'FOLLOW_UP_STEP_SEND','FOLLOW_UP_ENROLLMENT',e.id,
          jsonb_build_object('enrollment_id',e.id,'step',1),
          'follow-up:' || e.id::text || ':step:1','QUEUED',95,e.next_run_at,4,gen_random_uuid()
        from public.follow_up_enrollments e where e.id = v_enrollment_id;
      end if;
      v_enrollment_id := null;
    end loop;
  elsif new.status <> 'PENDING_PAYMENT' and old.status = 'PENDING_PAYMENT' then
    update public.follow_up_enrollments
    set status = 'CANCELLED', failure_code = 'ORDER_' || new.status, completed_at = clock_timestamp()
    where source_type = 'PURCHASE_ORDER' and source_id = new.id
      and status in ('SCHEDULED','SENDING','FAILED');

    update public.scheduled_jobs j
    set status = 'CANCELLED', completed_at = clock_timestamp(),
      last_error_code = 'ORDER_' || new.status,
      last_error_message = 'Follow-up stopped because order left pending payment.'
    where j.job_type = 'FOLLOW_UP_STEP_SEND'
      and j.entity_id in (
        select e.id from public.follow_up_enrollments e
        where e.source_type = 'PURCHASE_ORDER' and e.source_id = new.id
      )
      and j.status in ('QUEUED','RETRY');
  end if;
  return new;
end;
$function$;

revoke all on function private.sync_order_follow_ups() from public, anon, authenticated;
drop trigger if exists purchase_orders_sync_follow_ups on public.purchase_orders;
create trigger purchase_orders_sync_follow_ups
after insert or update of status on public.purchase_orders
for each row execute function private.sync_order_follow_ups();

create or replace function public.admin_create_pending_order(
  p_user_id uuid,
  p_product_label text,
  p_amount_idr bigint
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_chat_id bigint;
  v_order public.purchase_orders;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_product_label)) not between 3 and 160 then raise exception 'INVALID_PRODUCT_LABEL'; end if;
  if p_amount_idr < 0 then raise exception 'INVALID_ORDER_AMOUNT'; end if;
  select private_chat_id into v_chat_id from public.users
  where id = p_user_id and contact_status = 'CONTACTABLE';
  if v_chat_id is null then raise exception 'USER_NOT_CONTACTABLE'; end if;
  if exists (select 1 from public.purchase_orders where user_id = p_user_id and status = 'PENDING_PAYMENT') then
    raise exception 'USER_ALREADY_HAS_PENDING_ORDER';
  end if;
  insert into public.purchase_orders(user_id,product_label,amount_idr,private_chat_id,status,source,created_by)
  values (p_user_id,trim(p_product_label),p_amount_idr,v_chat_id,'PENDING_PAYMENT','ADMIN',v_actor)
  returning * into v_order;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'PENDING_ORDER_CREATED','PURCHASE_ORDER',v_order.id,
    jsonb_build_object('order_number',v_order.order_number,'amount_idr',v_order.amount_idr));
  return v_order;
end;
$function$;

revoke all on function public.admin_create_pending_order(uuid,text,bigint) from public, anon;
grant execute on function public.admin_create_pending_order(uuid,text,bigint) to authenticated;

create or replace function public.admin_mark_order_paid(
  p_order_id uuid,
  p_payment_reference text default null
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.purchase_orders;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  update public.purchase_orders
  set status = 'PAID', paid_at = clock_timestamp(), payment_reference = nullif(trim(coalesce(p_payment_reference,'')), '')
  where id = p_order_id and status = 'PENDING_PAYMENT'
  returning * into v_order;
  if not found then raise exception 'PENDING_ORDER_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'ORDER_MARKED_PAID','PURCHASE_ORDER',v_order.id,
    jsonb_build_object('order_number',v_order.order_number,'payment_reference',v_order.payment_reference));
  return v_order;
end;
$function$;

revoke all on function public.admin_mark_order_paid(uuid,text) from public, anon;
grant execute on function public.admin_mark_order_paid(uuid,text) to authenticated;
