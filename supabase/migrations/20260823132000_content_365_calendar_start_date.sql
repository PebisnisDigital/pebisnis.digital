alter table public.content_365_settings
  add column if not exists start_date date;

create or replace function public.admin_content_365_update_settings(
  p_enabled boolean,
  p_send_time time without time zone,
  p_timezone text default 'Asia/Jakarta'::text,
  p_loop_enabled boolean default true
)
returns public.content_365_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_row public.content_365_settings;
  v_start_at timestamptz;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN']::text[]) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;
  if p_send_time is null then raise exception 'SEND_TIME_REQUIRED'; end if;
  if nullif(trim(p_timezone),'') is null then raise exception 'TIMEZONE_REQUIRED'; end if;
  perform clock_timestamp() at time zone p_timezone;

  select *
  into v_row
  from public.content_365_settings
  where workspace_id = v_workspace;

  if v_row.start_date is not null then
    v_start_at := (v_row.start_date + p_send_time) at time zone trim(p_timezone);
  end if;

  insert into public.content_365_settings (
    workspace_id, enabled, timezone, send_time, loop_enabled, next_run_at, created_by
  ) values (
    v_workspace, p_enabled, trim(p_timezone), p_send_time, p_loop_enabled,
    case when p_enabled then private.next_content_365_run(trim(p_timezone), p_send_time, clock_timestamp()) else null end,
    v_actor
  )
  on conflict (workspace_id) do update
  set enabled = excluded.enabled,
      timezone = excluded.timezone,
      send_time = excluded.send_time,
      loop_enabled = excluded.loop_enabled,
      next_run_at = case
        when public.content_365_settings.pending_post_id is not null then public.content_365_settings.next_run_at
        when not excluded.enabled then null
        when v_start_at is not null and v_start_at > clock_timestamp() then v_start_at
        else private.next_content_365_run(excluded.timezone, excluded.send_time, clock_timestamp())
      end,
      last_error = null
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.admin_content_365_schedule_start(
  p_start_date date
)
returns public.content_365_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_row public.content_365_settings;
  v_today date;
  v_start_at timestamptz;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN']::text[]) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;
  if p_start_date is null then raise exception 'CONTENT_365_START_DATE_REQUIRED'; end if;

  select *
  into v_row
  from public.content_365_settings
  where workspace_id = v_workspace
  for update;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if v_row.pending_post_id is not null then raise exception 'CONTENT_365_POST_IN_PROGRESS'; end if;

  v_today := (clock_timestamp() at time zone v_row.timezone)::date;
  if p_start_date < v_today then raise exception 'CONTENT_365_START_DATE_IN_PAST'; end if;

  v_start_at := (p_start_date + v_row.send_time) at time zone v_row.timezone;

  update public.content_365_settings
  set current_day = 1,
      start_date = p_start_date,
      next_run_at = case
        when enabled then greatest(v_start_at, clock_timestamp())
        else null
      end,
      last_error = null
  where workspace_id = v_workspace
  returning * into v_row;

  return v_row;
end;
$function$;

revoke execute on function public.admin_content_365_schedule_start(date) from public;
revoke execute on function public.admin_content_365_schedule_start(date) from anon;
grant execute on function public.admin_content_365_schedule_start(date) to authenticated;
grant execute on function public.admin_content_365_schedule_start(date) to service_role;
