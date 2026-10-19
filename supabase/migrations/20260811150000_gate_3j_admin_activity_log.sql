-- Gate 3J: secure, role-aware Admin activity history.

create index if not exists audit_logs_action_created_at_idx
  on public.audit_logs (action, created_at desc);

-- Audit records are append-only through trusted database functions and workers.
-- Browser roles receive no direct table access; the RPC below exposes only the
-- activity allowed for the current Admin role.
revoke all on table public.audit_logs from anon, authenticated;

create or replace function public.admin_activity_report(
  p_scope text default 'ALL',
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_role public.admin_role;
  v_scope text := upper(trim(coalesce(p_scope, 'ALL')));
  v_limit integer := least(greatest(coalesce(p_limit, 100), 25), 250);
  v_result jsonb;
begin
  select profile.role into v_role
  from public.admin_profiles profile
  where profile.auth_user_id = v_actor
    and profile.status = 'ACTIVE';

  if v_actor is null or v_role is null then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  if v_role = 'OPERATOR' then
    v_scope := 'PAYMENT';
  elsif v_role <> 'SUPER_ADMIN' then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  if v_scope not in ('ALL', 'PAYMENT', 'SETTINGS', 'MESSAGE', 'SYSTEM') then
    raise exception 'INVALID_ACTIVITY_SCOPE';
  end if;

  with classified as (
    select
      log.id,
      log.actor_type,
      log.actor_id,
      log.action,
      log.entity_type,
      log.entity_id,
      log.summary - array['bot_token', 'account_number', 'access_button_url', 'access_text']::text[] as summary,
      log.reason,
      log.created_at,
      case
        when log.action like 'PAYMENT_%'
          or log.action like 'ORDER_%'
          or log.action like 'PENDING_ORDER_%'
          or log.action like 'ACCESS_%' then 'PAYMENT'
        when log.action like '%SETTINGS_%'
          or log.action like 'ADMIN_PROFILE_%' then 'SETTINGS'
        when log.action like 'BROADCAST_%'
          or log.action like 'CHANNEL_POST_%'
          or log.action like 'COMMENT_%'
          or log.action like 'FOLLOW_UP_%'
          or log.action like 'PROMPT_%' then 'MESSAGE'
        else 'SYSTEM'
      end as category,
      coalesce(profile.display_name, auth_user.email::text,
        case when log.actor_type = 'SYSTEM' then 'Sistem Otomatis' else initcap(lower(log.actor_type)) end
      ) as actor_name,
      profile.role::text as actor_role
    from public.audit_logs log
    left join public.admin_profiles profile on profile.auth_user_id = log.actor_id
    left join auth.users auth_user on auth_user.id = log.actor_id
  ), visible as (
    select * from classified
    where (v_scope = 'ALL' or category = v_scope)
      and (v_role = 'SUPER_ADMIN' or category = 'PAYMENT')
  )
  select jsonb_build_object(
    'scope', v_scope,
    'role', v_role,
    'summary', jsonb_build_object(
      'total', count(*),
      'last_24h', count(*) filter (where created_at >= clock_timestamp() - interval '24 hours'),
      'admin_actions', count(*) filter (where actor_type = 'ADMIN'),
      'actors', count(distinct actor_id) filter (where actor_id is not null)
    ),
    'events', coalesce((
      select jsonb_agg(to_jsonb(recent_event) order by recent_event.created_at desc)
      from (
        select id, actor_type, actor_id, actor_name, actor_role, action, category,
          entity_type, entity_id, summary, reason, created_at
        from visible
        order by created_at desc
        limit v_limit
      ) recent_event
    ), '[]'::jsonb),
    'generated_at', clock_timestamp()
  ) into v_result
  from visible;

  return v_result;
end;
$function$;

revoke all on function public.admin_activity_report(text, integer) from public, anon;
grant execute on function public.admin_activity_report(text, integer) to authenticated;
