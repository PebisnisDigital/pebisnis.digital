alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in ('PENDING_PAYMENT','PENDING_VERIFICATION','PAID','CANCELLED','EXPIRED'));

alter table public.purchase_orders
  add column if not exists proof_revision integer not null default 0 check (proof_revision >= 0),
  add column if not exists latest_payment_proof_id uuid;

drop index if exists public.purchase_orders_one_pending_per_user_idx;
create unique index purchase_orders_one_active_payment_per_user_idx
  on public.purchase_orders(user_id)
  where status in ('PENDING_PAYMENT','PENDING_VERIFICATION');

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete restrict,
  revision integer not null check (revision > 0),
  telegram_message_id bigint not null,
  telegram_file_id text not null,
  telegram_file_unique_id text,
  storage_path text not null unique,
  media_type text not null check (media_type in ('PHOTO','DOCUMENT')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size bigint not null check (file_size between 1 and 10485760),
  original_name text,
  status text not null default 'PENDING_REVIEW'
    check (status in ('PENDING_REVIEW','APPROVED','REJECTED','SUPERSEDED')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_profiles(auth_user_id) on delete set null,
  review_notice_status text not null default 'NOT_READY'
    check (review_notice_status in ('NOT_READY','QUEUED','SENDING','SENT','FAILED','BLOCKED','OUTCOME_UNKNOWN')),
  review_notice_message_id bigint,
  review_notice_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, revision),
  unique (order_id, telegram_message_id)
);

alter table public.purchase_orders
  add constraint purchase_orders_latest_payment_proof_id_fkey
  foreign key (latest_payment_proof_id) references public.payment_proofs(id) on delete set null;

create unique index payment_proofs_one_pending_review_per_order_idx
  on public.payment_proofs(order_id) where status = 'PENDING_REVIEW';
create index payment_proofs_status_submitted_idx
  on public.payment_proofs(status, submitted_at desc);
create index payment_proofs_reviewed_by_idx
  on public.payment_proofs(reviewed_by);

alter table public.payment_proofs enable row level security;
drop policy if exists payment_proofs_admin_select on public.payment_proofs;
create policy payment_proofs_admin_select on public.payment_proofs
  for select to authenticated using ((select private.is_active_admin()));
grant select on public.payment_proofs to authenticated;
revoke insert, update, delete on public.payment_proofs from anon, authenticated;

drop trigger if exists payment_proofs_set_updated_at on public.payment_proofs;
create trigger payment_proofs_set_updated_at before update on public.payment_proofs
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_proofs_storage_admin_read on storage.objects;
create policy payment_proofs_storage_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and (select private.is_active_admin()));

create or replace function public.submit_payment_proof(
  p_user_id uuid,
  p_order_id uuid,
  p_telegram_message_id bigint,
  p_telegram_file_id text,
  p_telegram_file_unique_id text,
  p_storage_path text,
  p_media_type text,
  p_mime_type text,
  p_file_size bigint,
  p_original_name text
) returns public.payment_proofs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.purchase_orders;
  v_proof public.payment_proofs;
begin
  if p_user_id is null or p_order_id is null then raise exception 'PAYMENT_PROOF_ORDER_REQUIRED'; end if;
  if p_media_type not in ('PHOTO','DOCUMENT') then raise exception 'INVALID_PAYMENT_PROOF_MEDIA'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'INVALID_PAYMENT_PROOF_MIME'; end if;
  if p_file_size not between 1 and 10485760 then raise exception 'INVALID_PAYMENT_PROOF_SIZE'; end if;
  if p_storage_path !~ ('^' || p_order_id::text || '/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$') then
    raise exception 'INVALID_PAYMENT_PROOF_PATH';
  end if;

  select * into v_proof from public.payment_proofs
  where order_id = p_order_id and telegram_message_id = p_telegram_message_id;
  if found then return v_proof; end if;

  select * into v_order from public.purchase_orders
  where id = p_order_id and user_id = p_user_id
    and status in ('PENDING_PAYMENT','PENDING_VERIFICATION')
  for update;
  if not found then raise exception 'ACTIVE_PAYMENT_ORDER_NOT_FOUND'; end if;

  update public.payment_proofs
  set status = 'SUPERSEDED'
  where order_id = v_order.id and status = 'PENDING_REVIEW';

  insert into public.payment_proofs(
    order_id, revision, telegram_message_id, telegram_file_id,
    telegram_file_unique_id, storage_path, media_type, mime_type,
    file_size, original_name
  ) values (
    v_order.id, v_order.proof_revision + 1, p_telegram_message_id,
    p_telegram_file_id, nullif(trim(coalesce(p_telegram_file_unique_id,'')), ''),
    p_storage_path, p_media_type, p_mime_type, p_file_size,
    nullif(trim(coalesce(p_original_name,'')), '')
  ) returning * into v_proof;

  update public.purchase_orders
  set status = 'PENDING_VERIFICATION', proof_revision = v_proof.revision,
    latest_payment_proof_id = v_proof.id
  where id = v_order.id;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('SYSTEM', null, 'PAYMENT_PROOF_SUBMITTED', 'PURCHASE_ORDER', v_order.id,
    jsonb_build_object('proof_id', v_proof.id, 'revision', v_proof.revision));
  return v_proof;
end;
$function$;

revoke all on function public.submit_payment_proof(uuid,uuid,bigint,text,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.submit_payment_proof(uuid,uuid,bigint,text,text,text,text,text,bigint,text) to service_role;

create or replace function public.admin_review_payment_proof(
  p_order_id uuid,
  p_proof_id uuid,
  p_decision text,
  p_rejection_reason text default null
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.purchase_orders;
  v_proof public.payment_proofs;
  v_reason text := trim(coalesce(p_rejection_reason, ''));
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'INVALID_PAYMENT_REVIEW_DECISION'; end if;
  if p_decision = 'REJECT' and char_length(v_reason) not between 3 and 500 then
    raise exception 'PAYMENT_REJECTION_REASON_REQUIRED';
  end if;

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or v_order.status <> 'PENDING_VERIFICATION' or v_order.latest_payment_proof_id <> p_proof_id then
    raise exception 'PAYMENT_PROOF_NOT_PENDING_REVIEW';
  end if;
  select * into v_proof from public.payment_proofs
  where id = p_proof_id and order_id = p_order_id and status = 'PENDING_REVIEW'
  for update;
  if not found then raise exception 'PAYMENT_PROOF_NOT_PENDING_REVIEW'; end if;

  if p_decision = 'APPROVE' then
    update public.payment_proofs set
      status = 'APPROVED', reviewed_at = clock_timestamp(), reviewed_by = v_actor,
      rejection_reason = null, review_notice_status = 'NOT_READY'
    where id = v_proof.id;
    update public.purchase_orders set
      status = 'PAID', paid_at = clock_timestamp(),
      payment_reference = 'BUKTI-' || v_proof.revision::text
    where id = v_order.id returning * into v_order;
  else
    update public.payment_proofs set
      status = 'REJECTED', reviewed_at = clock_timestamp(), reviewed_by = v_actor,
      rejection_reason = v_reason, review_notice_status = 'QUEUED',
      review_notice_failure_code = null
    where id = v_proof.id;
    update public.purchase_orders set status = 'PENDING_PAYMENT'
    where id = v_order.id returning * into v_order;

    insert into public.scheduled_jobs(
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'PAYMENT_PROOF_REJECT_NOTIFY', 'PAYMENT_PROOF', v_proof.id,
      jsonb_build_object('proof_id', v_proof.id),
      'payment-proof-reject:' || v_proof.id::text,
      'QUEUED', 100, clock_timestamp(), 4, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  end if;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'PAYMENT_PROOF_' || p_decision, 'PURCHASE_ORDER', v_order.id,
    jsonb_build_object('proof_id', v_proof.id, 'reason', nullif(v_reason, '')));
  return v_order;
end;
$function$;

revoke all on function public.admin_review_payment_proof(uuid,uuid,text,text) from public, anon;
grant execute on function public.admin_review_payment_proof(uuid,uuid,text,text) to authenticated;

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
      on conflict (automation_id, source_id) do update set
        status = 'SCHEDULED', current_step = 0, next_run_at = excluded.next_run_at,
        completed_at = null, failure_code = null, updated_at = clock_timestamp()
      returning id into v_enrollment_id;

      insert into public.scheduled_jobs(
        job_type,entity_type,entity_id,payload,idempotency_key,status,priority,run_at,max_attempts,correlation_id
      )
      select 'FOLLOW_UP_STEP_SEND','FOLLOW_UP_ENROLLMENT',e.id,
        jsonb_build_object('enrollment_id',e.id,'step',1,'cycle',new.proof_revision),
        'follow-up:' || e.id::text || ':cycle:' || new.proof_revision::text || ':step:1',
        'QUEUED',95,e.next_run_at,4,gen_random_uuid()
      from public.follow_up_enrollments e where e.id = v_enrollment_id
      on conflict (idempotency_key) do update set
        status = 'QUEUED', run_at = excluded.run_at, completed_at = null,
        last_error_code = null, last_error_message = null;
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
