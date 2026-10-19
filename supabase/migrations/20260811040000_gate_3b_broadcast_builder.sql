create table if not exists public.broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 100),
  audience_segment text not null check (audience_segment in ('ALL','ACTIVE','PENDING','CLAIMED','NEVER_CLAIMED')),
  message_parts jsonb not null check (private.is_nonempty_text_array(message_parts) and jsonb_array_length(message_parts) between 1 and 10),
  button_text text not null default '' check (char_length(button_text) <= 64),
  button_url text not null default '' check (button_url = '' or button_url ~ '^https://'),
  opt_out_button_text text not null default 'STOP BROADCAST' check (char_length(trim(opt_out_button_text)) between 2 and 64),
  send_interval_seconds integer not null default 10 check (send_interval_seconds between 10 and 60),
  scheduled_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','SENDING','COMPLETED','FAILED','PAUSED','CANCELLED')),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_recipients integer not null default 0 check (sent_recipients >= 0),
  failed_recipients integer not null default 0 check (failed_recipients >= 0),
  skipped_recipients integer not null default 0 check (skipped_recipients >= 0),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.admin_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  subscribed boolean not null default true,
  opted_out_at timestamptz,
  source text not null default 'DEFAULT' check (source in ('DEFAULT','TELEGRAM_BUTTON','ADMIN')),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.broadcast_campaigns(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  private_chat_id bigint not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','SKIPPED_OPTED_OUT','BLOCKED','FAILED','OUTCOME_UNKNOWN')),
  next_part_index integer not null default 0 check (next_part_index >= 0),
  telegram_message_ids bigint[] not null default '{}',
  failure_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists broadcast_campaigns_status_schedule_idx
  on public.broadcast_campaigns(status, scheduled_at desc);
create index if not exists broadcast_recipients_campaign_status_idx
  on public.broadcast_recipients(campaign_id, status);
create index if not exists broadcast_recipients_user_idx
  on public.broadcast_recipients(user_id, created_at desc);

alter table public.broadcast_campaigns enable row level security;
alter table public.broadcast_preferences enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists broadcast_campaigns_admin_select on public.broadcast_campaigns;
create policy broadcast_campaigns_admin_select on public.broadcast_campaigns
  for select to authenticated using ((select private.is_active_admin()));
drop policy if exists broadcast_preferences_admin_select on public.broadcast_preferences;
create policy broadcast_preferences_admin_select on public.broadcast_preferences
  for select to authenticated using ((select private.is_active_admin()));
drop policy if exists broadcast_recipients_admin_select on public.broadcast_recipients;
create policy broadcast_recipients_admin_select on public.broadcast_recipients
  for select to authenticated using ((select private.is_active_admin()));

create or replace function public.admin_create_broadcast_campaign(
  p_name text,
  p_audience_segment text,
  p_message_parts jsonb,
  p_button_text text,
  p_button_url text,
  p_opt_out_button_text text,
  p_send_interval_seconds integer,
  p_scheduled_at timestamptz
) returns public.broadcast_campaigns
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_campaign public.broadcast_campaigns;
  v_recipient record;
  v_recipient_id uuid;
  v_position integer := 0;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_name)) not between 3 and 100 then raise exception 'INVALID_CAMPAIGN_NAME'; end if;
  if p_audience_segment not in ('ALL','ACTIVE','PENDING','CLAIMED','NEVER_CLAIMED') then raise exception 'INVALID_AUDIENCE_SEGMENT'; end if;
  if not private.is_nonempty_text_array(p_message_parts) then raise exception 'INVALID_MESSAGE_PARTS'; end if;
  if char_length(trim(coalesce(p_button_text, ''))) > 64 then raise exception 'INVALID_BUTTON_TEXT'; end if;
  if trim(coalesce(p_button_url, '')) <> '' and trim(p_button_url) !~ '^https://' then raise exception 'INVALID_BUTTON_URL'; end if;
  if char_length(trim(coalesce(p_opt_out_button_text, ''))) not between 2 and 64 then raise exception 'INVALID_OPT_OUT_TEXT'; end if;
  if p_send_interval_seconds not between 10 and 60 then raise exception 'INVALID_SEND_INTERVAL'; end if;
  if p_scheduled_at is null or p_scheduled_at < clock_timestamp() - interval '30 seconds' then raise exception 'INVALID_SCHEDULE'; end if;

  insert into public.broadcast_campaigns (
    name, audience_segment, message_parts, button_text, button_url,
    opt_out_button_text, send_interval_seconds, scheduled_at, created_by
  ) values (
    trim(p_name), p_audience_segment, p_message_parts,
    trim(coalesce(p_button_text, '')), trim(coalesce(p_button_url, '')),
    trim(p_opt_out_button_text), p_send_interval_seconds, p_scheduled_at, v_actor
  ) returning * into v_campaign;

  for v_recipient in
    select u.id, u.private_chat_id
    from public.users u
    left join public.broadcast_preferences preference on preference.user_id = u.id
    where u.status = 'ACTIVE'
      and u.private_chat_id is not null
      and u.contact_status = 'CONTACTABLE'
      and coalesce(preference.subscribed, true)
      and (
        p_audience_segment = 'ALL'
        or (p_audience_segment = 'ACTIVE' and u.onboarding_status = 'ACTIVE')
        or (p_audience_segment = 'PENDING' and u.onboarding_status <> 'ACTIVE')
        or (p_audience_segment = 'CLAIMED' and exists (select 1 from public.comment_claims c where c.user_id = u.id))
        or (p_audience_segment = 'NEVER_CLAIMED' and not exists (select 1 from public.comment_claims c where c.user_id = u.id))
      )
    order by u.first_seen_at, u.id
  loop
    v_position := v_position + 1;
    insert into public.broadcast_recipients (campaign_id, user_id, private_chat_id)
    values (v_campaign.id, v_recipient.id, v_recipient.private_chat_id)
    returning id into v_recipient_id;

    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'BROADCAST_RECIPIENT_SEND', 'BROADCAST_RECIPIENT', v_recipient_id,
      jsonb_build_object('recipient_id', v_recipient_id),
      'broadcast-recipient:' || v_recipient_id::text || ':send:v1',
      'QUEUED', 90,
      p_scheduled_at + make_interval(secs => (v_position - 1) * p_send_interval_seconds),
      4, gen_random_uuid()
    );
  end loop;

  update public.broadcast_campaigns
  set total_recipients = v_position,
      status = case when v_position = 0 then 'COMPLETED' else 'SCHEDULED' end,
      completed_at = case when v_position = 0 then clock_timestamp() else null end,
      updated_at = clock_timestamp()
  where id = v_campaign.id
  returning * into v_campaign;

  if v_position > 0 and p_scheduled_at <= clock_timestamp() + interval '5 seconds' then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'prompt_viral_staging_project_url' limit 1) || '/functions/v1/job-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'prompt_viral_staging_job_worker_secret' limit 1)
      ),
      body := jsonb_build_object('source', 'admin_broadcast_now', 'campaign_id', v_campaign.id),
      timeout_milliseconds := 10000
    );
  end if;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'BROADCAST_CAMPAIGN_CREATED', 'BROADCAST_CAMPAIGN', v_campaign.id,
    jsonb_build_object('segment', p_audience_segment, 'recipients', v_position, 'scheduled_at', p_scheduled_at));
  return v_campaign;
end;
$function$;

revoke all on function public.admin_create_broadcast_campaign(text,text,jsonb,text,text,text,integer,timestamptz) from public, anon;
grant execute on function public.admin_create_broadcast_campaign(text,text,jsonb,text,text,text,integer,timestamptz) to authenticated;

create or replace function private.refresh_broadcast_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total integer;
  v_sent integer;
  v_failed integer;
  v_skipped integer;
  v_pending integer;
begin
  select count(*),
    count(*) filter (where status = 'SENT'),
    count(*) filter (where status in ('BLOCKED','FAILED','OUTCOME_UNKNOWN')),
    count(*) filter (where status = 'SKIPPED_OPTED_OUT'),
    count(*) filter (where status in ('QUEUED','SENDING'))
  into v_total, v_sent, v_failed, v_skipped, v_pending
  from public.broadcast_recipients where campaign_id = p_campaign_id;

  update public.broadcast_campaigns
  set total_recipients = v_total,
      sent_recipients = v_sent,
      failed_recipients = v_failed,
      skipped_recipients = v_skipped,
      status = case when v_pending = 0 then 'COMPLETED' else 'SENDING' end,
      completed_at = case when v_pending = 0 then coalesce(completed_at, clock_timestamp()) else null end,
      updated_at = clock_timestamp()
  where id = p_campaign_id and status not in ('PAUSED','CANCELLED');
end;
$function$;

revoke all on function private.refresh_broadcast_campaign(uuid) from public, anon, authenticated;

-- Preserve the generic scheduler while ensuring one campaign cannot lease two
-- recipients concurrently. This keeps the configured pacing intact even when
-- two worker invocations overlap or the queue is catching up.
create or replace function public.lease_scheduled_jobs(
  p_worker_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 60
) returns setof public.scheduled_jobs
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_worker_id is null or length(trim(p_worker_id)) < 8 then raise exception 'worker_id must contain at least 8 characters'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'limit must be between 1 and 100'; end if;
  if p_lease_seconds < 15 or p_lease_seconds > 900 then raise exception 'lease_seconds must be between 15 and 900'; end if;

  return query
  with eligible as (
    select
      j.id,
      j.priority,
      j.run_at,
      j.created_at,
      case
        when j.job_type = 'BROADCAST_RECIPIENT_SEND' then
          row_number() over (
            partition by recipient.campaign_id
            order by j.run_at, j.created_at, j.id
          )
        else 1
      end as campaign_rank
    from public.scheduled_jobs j
    left join public.broadcast_recipients recipient
      on j.job_type = 'BROADCAST_RECIPIENT_SEND'
      and recipient.id = j.entity_id
    where (
      (j.status in ('QUEUED', 'RETRY') and j.run_at <= clock_timestamp())
      or (j.status = 'PROCESSING' and j.lease_expires_at < clock_timestamp())
    )
    and (
      j.job_type <> 'BROADCAST_RECIPIENT_SEND'
      or not exists (
        select 1
        from public.scheduled_jobs active_job
        join public.broadcast_recipients active_recipient
          on active_recipient.id = active_job.entity_id
        where active_job.job_type = 'BROADCAST_RECIPIENT_SEND'
          and active_job.status = 'PROCESSING'
          and active_job.lease_expires_at >= clock_timestamp()
          and active_recipient.campaign_id = recipient.campaign_id
      )
    )
  ), candidates as (
    select j.id
    from public.scheduled_jobs j
    join eligible e on e.id = j.id
    where e.campaign_rank = 1
    order by e.priority, e.run_at, e.created_at
    for update of j skip locked
    limit p_limit
  )
  update public.scheduled_jobs j
  set status = 'PROCESSING',
      lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(j.started_at, clock_timestamp()),
      attempt_count = j.attempt_count + 1
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$function$;

revoke all on function public.lease_scheduled_jobs(text,integer,integer) from public, anon, authenticated;
grant execute on function public.lease_scheduled_jobs(text,integer,integer) to service_role;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'prompt-viral-staging-job-worker' limit 1),
  schedule := '10 seconds'
);
