create table if not exists public.follow_up_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 100),
  trigger_event text not null default 'CLAIM_DELIVERED' check (trigger_event in ('CLAIM_DELIVERED')),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED')),
  created_by uuid not null default auth.uid() references public.admin_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follow_up_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.follow_up_automations(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  delay_minutes integer not null check (delay_minutes between 1 and 10080),
  message_text text not null check (char_length(trim(message_text)) between 3 and 4096),
  button_text text not null default '' check (char_length(button_text) <= 64),
  button_url text not null default '' check (button_url = '' or button_url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (automation_id, position),
  check ((button_text = '' and button_url = '') or (button_text <> '' and button_url <> ''))
);

create table if not exists public.follow_up_enrollments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.follow_up_automations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  source_type text not null default 'COMMENT_CLAIM' check (source_type in ('COMMENT_CLAIM')),
  source_id uuid not null references public.comment_claims(id) on delete restrict,
  private_chat_id bigint not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','SENDING','COMPLETED','CANCELLED','BLOCKED','FAILED','OUTCOME_UNKNOWN')),
  current_step smallint not null default 1 check (current_step between 1 and 6),
  telegram_message_ids bigint[] not null default '{}',
  next_run_at timestamptz not null,
  failure_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, source_id)
);

create index if not exists follow_up_automations_status_trigger_idx
  on public.follow_up_automations(status, trigger_event);
create index if not exists follow_up_enrollments_status_next_idx
  on public.follow_up_enrollments(status, next_run_at);
create index if not exists follow_up_enrollments_user_created_idx
  on public.follow_up_enrollments(user_id, created_at desc);

alter table public.follow_up_automations enable row level security;
alter table public.follow_up_steps enable row level security;
alter table public.follow_up_enrollments enable row level security;

drop policy if exists follow_up_automations_admin_select on public.follow_up_automations;
create policy follow_up_automations_admin_select on public.follow_up_automations
  for select to authenticated using ((select private.is_active_admin()));
drop policy if exists follow_up_steps_admin_select on public.follow_up_steps;
create policy follow_up_steps_admin_select on public.follow_up_steps
  for select to authenticated using ((select private.is_active_admin()));
drop policy if exists follow_up_enrollments_admin_select on public.follow_up_enrollments;
create policy follow_up_enrollments_admin_select on public.follow_up_enrollments
  for select to authenticated using ((select private.is_active_admin()));

grant select on public.follow_up_automations, public.follow_up_steps, public.follow_up_enrollments to authenticated;
revoke insert, update, delete on public.follow_up_automations, public.follow_up_steps, public.follow_up_enrollments from anon, authenticated;

drop trigger if exists follow_up_automations_set_updated_at on public.follow_up_automations;
create trigger follow_up_automations_set_updated_at before update on public.follow_up_automations
for each row execute function public.set_updated_at();

drop trigger if exists follow_up_enrollments_set_updated_at on public.follow_up_enrollments;
create trigger follow_up_enrollments_set_updated_at before update on public.follow_up_enrollments
for each row execute function public.set_updated_at();

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
    values (trim(p_name), 'CLAIM_DELIVERED', p_status, v_actor)
    returning * into v_automation;
  else
    update public.follow_up_automations
    set name = trim(p_name), status = p_status
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
    jsonb_build_object('status', p_status, 'steps', v_position));
  return v_automation;
end;
$function$;

revoke all on function public.admin_save_follow_up_automation(uuid,text,text,jsonb) from public, anon;
grant execute on function public.admin_save_follow_up_automation(uuid,text,text,jsonb) to authenticated;

create or replace function private.enqueue_claim_follow_ups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_automation record;
  v_enrollment_id uuid;
  v_chat_id bigint;
begin
  if new.status <> 'DELIVERED' or old.status = 'DELIVERED' or new.user_id is null then return new; end if;
  select private_chat_id into v_chat_id from public.users where id = new.user_id and contact_status = 'CONTACTABLE';
  if v_chat_id is null then return new; end if;

  for v_automation in
    select a.id, s.delay_minutes
    from public.follow_up_automations a
    join public.follow_up_steps s on s.automation_id = a.id and s.position = 1
    where a.status = 'ACTIVE' and a.trigger_event = 'CLAIM_DELIVERED'
  loop
    insert into public.follow_up_enrollments(automation_id,user_id,source_id,private_chat_id,next_run_at)
    values (v_automation.id,new.user_id,new.id,v_chat_id,clock_timestamp() + make_interval(mins => v_automation.delay_minutes))
    on conflict (automation_id, source_id) do nothing
    returning id into v_enrollment_id;
    if v_enrollment_id is not null then
      insert into public.scheduled_jobs(job_type,entity_type,entity_id,payload,idempotency_key,status,priority,run_at,max_attempts,correlation_id)
      select 'FOLLOW_UP_STEP_SEND','FOLLOW_UP_ENROLLMENT',e.id,jsonb_build_object('enrollment_id',e.id,'step',1),
        'follow-up:' || e.id::text || ':step:1','QUEUED',95,e.next_run_at,4,gen_random_uuid()
      from public.follow_up_enrollments e where e.id = v_enrollment_id;
    end if;
    v_enrollment_id := null;
  end loop;
  return new;
end;
$function$;

drop trigger if exists comment_claims_enqueue_follow_up on public.comment_claims;
create trigger comment_claims_enqueue_follow_up
after update of status on public.comment_claims
for each row execute function private.enqueue_claim_follow_ups();

revoke all on function private.enqueue_claim_follow_ups() from public, anon, authenticated;
