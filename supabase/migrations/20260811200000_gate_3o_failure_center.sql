-- Gate 3O: Owner-only failure center and deliberate retry for DEAD jobs.
-- OUTCOME_UNKNOWN jobs are visible but can never be retried from this gate.

create table if not exists private.job_manual_retry_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  job_type text not null,
  previous_status text not null,
  previous_attempt_count integer not null,
  previous_error_code text,
  previous_error_message text,
  reason text not null,
  actor_id uuid not null,
  retried_at timestamptz not null default clock_timestamp()
);

create index if not exists job_manual_retry_history_job_idx
  on private.job_manual_retry_history(job_id, retried_at desc);

revoke all on table private.job_manual_retry_history from public, anon, authenticated;

create or replace function private.admin_failure_center_report_core()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_jobs jsonb;
  v_history jsonb;
begin
  if (select auth.uid()) is null or not private.is_active_admin() then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.updated_at desc), '[]'::jsonb)
  into v_jobs
  from (
    select
      job.id,
      job.job_type,
      job.entity_type,
      job.entity_id,
      job.status::text as status,
      job.attempt_count,
      job.max_attempts,
      job.last_error_code,
      job.last_error_message,
      job.created_at,
      job.updated_at,
      count(history.id)::integer as manual_retry_count,
      max(history.retried_at) as last_manual_retry_at
    from public.scheduled_jobs job
    left join private.job_manual_retry_history history on history.job_id = job.id
    where job.status::text in ('DEAD', 'OUTCOME_UNKNOWN')
    group by job.id
    order by job.updated_at desc
    limit 100
  ) item;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.retried_at desc), '[]'::jsonb)
  into v_history
  from (
    select
      history.id,
      history.job_id,
      history.job_type,
      history.previous_status,
      history.previous_attempt_count,
      history.previous_error_code,
      history.previous_error_message,
      history.reason,
      history.actor_id,
      coalesce(profile.display_name, auth_user.email::text, 'Owner') as actor_name,
      history.retried_at
    from private.job_manual_retry_history history
    left join public.admin_profiles profile on profile.auth_user_id = history.actor_id
    left join auth.users auth_user on auth_user.id = history.actor_id
    order by history.retried_at desc
    limit 50
  ) item;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'dead', (select count(*) from public.scheduled_jobs where status::text = 'DEAD'),
      'outcome_unknown', (select count(*) from public.scheduled_jobs where status::text = 'OUTCOME_UNKNOWN'),
      'retryable', (select count(*) from public.scheduled_jobs where status::text = 'DEAD'),
      'manual_retries', (select count(*) from private.job_manual_retry_history)
    ),
    'jobs', v_jobs,
    'history', v_history,
    'generated_at', clock_timestamp()
  );
end
$function$;

create or replace function private.admin_retry_dead_job_core(p_job_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_job public.scheduled_jobs%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;
  if p_job_id is null then raise exception 'JOB_ID_REQUIRED'; end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'RETRY_REASON_REQUIRED';
  end if;

  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.status::text = 'OUTCOME_UNKNOWN' then
    raise exception 'OUTCOME_UNKNOWN_RETRY_BLOCKED';
  end if;
  if v_job.status::text <> 'DEAD' then
    raise exception 'JOB_NOT_RETRYABLE';
  end if;

  insert into private.job_manual_retry_history(
    job_id, job_type, previous_status, previous_attempt_count,
    previous_error_code, previous_error_message, reason, actor_id
  ) values (
    v_job.id, v_job.job_type, v_job.status::text, v_job.attempt_count,
    v_job.last_error_code, v_job.last_error_message, v_reason, v_actor
  );

  update public.scheduled_jobs
  set status = 'QUEUED',
      run_at = clock_timestamp(),
      attempt_count = 0,
      lease_owner = null,
      lease_expires_at = null,
      started_at = null,
      completed_at = null,
      updated_at = clock_timestamp()
  where id = v_job.id;

  insert into public.audit_logs(
    actor_type, actor_id, action, entity_type, entity_id, summary, reason
  ) values (
    'ADMIN', v_actor, 'JOB_MANUAL_RETRY', 'SCHEDULED_JOB', v_job.id,
    jsonb_build_object(
      'job_type', v_job.job_type,
      'previous_status', v_job.status::text,
      'previous_attempt_count', v_job.attempt_count,
      'previous_error_code', v_job.last_error_code
    ),
    v_reason
  );

  return private.admin_failure_center_report_core();
end
$function$;

create or replace function public.admin_failure_center_report()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.admin_failure_center_report_core();
$function$;

create or replace function public.admin_retry_dead_job(p_job_id uuid, p_reason text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.admin_retry_dead_job_core(p_job_id, p_reason);
$function$;

revoke all on function public.admin_failure_center_report() from public, anon;
grant execute on function public.admin_failure_center_report() to authenticated;
revoke all on function public.admin_retry_dead_job(uuid, text) from public, anon;
grant execute on function public.admin_retry_dead_job(uuid, text) to authenticated;

revoke all on function private.admin_failure_center_report_core() from public, anon;
grant execute on function private.admin_failure_center_report_core() to authenticated;
revoke all on function private.admin_retry_dead_job_core(uuid, text) from public, anon;
grant execute on function private.admin_retry_dead_job_core(uuid, text) to authenticated;
