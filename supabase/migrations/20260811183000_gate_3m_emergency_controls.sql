-- Gate 3M: owner-only emergency controls and non-destructive job deferral.

insert into public.system_settings (key, category, value, description, status, updated_by)
select
  'system.emergency_controls',
  'SYSTEM',
  jsonb_build_object(
    'channel_posting_enabled', true,
    'free_claim_enabled', true,
    'checkout_enabled', true,
    'follow_up_enabled', true,
    'broadcast_enabled', true,
    'updated_at', clock_timestamp(),
    'updated_by', auth_user_id,
    'reason', 'Pengaturan awal'
  ),
  'Rem darurat per alur. Menjeda side effect tanpa menghapus antrean atau data.',
  'ACTIVE',
  auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (key) do nothing;

create or replace function public.admin_get_emergency_controls()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_value jsonb;
begin
  if (select auth.uid()) is null or not private.is_active_admin() then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;
  select value into v_value from public.system_settings where key = 'system.emergency_controls';
  return jsonb_build_object(
    'channel_posting_enabled', coalesce((v_value->>'channel_posting_enabled')::boolean, true),
    'free_claim_enabled', coalesce((v_value->>'free_claim_enabled')::boolean, true),
    'checkout_enabled', coalesce((v_value->>'checkout_enabled')::boolean, true),
    'follow_up_enabled', coalesce((v_value->>'follow_up_enabled')::boolean, true),
    'broadcast_enabled', coalesce((v_value->>'broadcast_enabled')::boolean, true),
    'updated_at', v_value->>'updated_at',
    'updated_by', v_value->>'updated_by',
    'reason', coalesce(v_value->>'reason', '')
  );
end;
$function$;

create or replace function public.admin_update_emergency_controls(
  p_channel_posting_enabled boolean,
  p_free_claim_enabled boolean,
  p_checkout_enabled boolean,
  p_follow_up_enabled boolean,
  p_broadcast_enabled boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := trim(coalesce(p_reason, ''));
  v_value jsonb;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  if p_channel_posting_enabled is null or p_free_claim_enabled is null
    or p_checkout_enabled is null or p_follow_up_enabled is null or p_broadcast_enabled is null then
    raise exception 'EMERGENCY_CONTROL_VALUE_REQUIRED';
  end if;
  if not (p_channel_posting_enabled and p_free_claim_enabled and p_checkout_enabled and p_follow_up_enabled and p_broadcast_enabled)
    and char_length(v_reason) not between 3 and 500 then
    raise exception 'EMERGENCY_CONTROL_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then raise exception 'EMERGENCY_CONTROL_REASON_TOO_LONG'; end if;

  if v_reason = '' then v_reason := 'Seluruh alur dipulihkan oleh Owner'; end if;
  v_value := jsonb_build_object(
    'channel_posting_enabled', p_channel_posting_enabled,
    'free_claim_enabled', p_free_claim_enabled,
    'checkout_enabled', p_checkout_enabled,
    'follow_up_enabled', p_follow_up_enabled,
    'broadcast_enabled', p_broadcast_enabled,
    'updated_at', clock_timestamp(),
    'updated_by', v_actor,
    'reason', v_reason
  );
  insert into public.system_settings (key, category, value, description, status, updated_by)
  values ('system.emergency_controls', 'SYSTEM', v_value,
    'Rem darurat per alur. Menjeda side effect tanpa menghapus antrean atau data.', 'ACTIVE', v_actor)
  on conflict (key) do update set value = excluded.value, status = 'ACTIVE', updated_by = v_actor, updated_at = clock_timestamp();

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, summary, reason)
  values ('ADMIN', v_actor, 'EMERGENCY_CONTROLS_UPDATED', 'SYSTEM_SETTING',
    v_value - array['updated_by', 'reason']::text[], v_reason);
  return v_value;
end;
$function$;

create or replace function public.defer_scheduled_job_for_emergency_control(
  p_job_id uuid,
  p_worker_id text,
  p_control text,
  p_delay_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if p_control not in ('CHANNEL_POSTING','BROADCAST','FOLLOW_UP') then raise exception 'INVALID_EMERGENCY_CONTROL'; end if;
  if p_delay_seconds not between 30 and 3600 then raise exception 'INVALID_DEFER_DELAY'; end if;
  update public.scheduled_jobs
  set status = 'RETRY', run_at = clock_timestamp() + make_interval(secs => p_delay_seconds),
      lease_owner = null, lease_expires_at = null, attempt_count = greatest(attempt_count - 1, 0),
      last_error_code = 'PAUSED_BY_EMERGENCY_CONTROL',
      last_error_message = 'Deferred by ' || p_control || ' emergency control.', updated_at = clock_timestamp()
  where id = p_job_id and status = 'PROCESSING' and lease_owner = p_worker_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

revoke all on function public.admin_get_emergency_controls() from public, anon;
grant execute on function public.admin_get_emergency_controls() to authenticated;
revoke all on function public.admin_update_emergency_controls(boolean,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.admin_update_emergency_controls(boolean,boolean,boolean,boolean,boolean,text) to authenticated;
revoke all on function public.defer_scheduled_job_for_emergency_control(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.defer_scheduled_job_for_emergency_control(uuid,text,text,integer) to service_role;
