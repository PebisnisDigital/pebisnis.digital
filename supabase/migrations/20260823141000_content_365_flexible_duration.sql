alter table public.content_365_settings
  drop constraint if exists content_365_settings_current_day_check;

alter table public.content_365_items
  drop constraint if exists content_365_items_day_number_check;

alter table public.content_365_runs
  drop constraint if exists content_365_runs_day_number_check;

alter table public.content_365_settings
  alter column current_day type integer using current_day::integer,
  add column if not exists total_days integer not null default 365;

alter table public.content_365_items
  alter column day_number type integer using day_number::integer;

alter table public.content_365_runs
  alter column day_number type integer using day_number::integer;

alter table public.content_365_settings
  add constraint content_365_settings_total_days_check
    check (total_days between 1 and 10000),
  add constraint content_365_settings_current_day_check
    check (current_day between 1 and total_days);

alter table public.content_365_items
  add constraint content_365_items_day_number_check
    check (day_number between 1 and 10000);

alter table public.content_365_runs
  add constraint content_365_runs_day_number_check
    check (day_number between 1 and 10000);

drop function if exists public.admin_content_365_update_settings(boolean, time without time zone, text, boolean);

create function public.admin_content_365_update_settings(
  p_enabled boolean,
  p_send_time time without time zone,
  p_timezone text default 'Asia/Jakarta'::text,
  p_loop_enabled boolean default true,
  p_total_days integer default 365
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
  if p_total_days is null or p_total_days not between 1 and 10000 then
    raise exception 'INVALID_CONTENT_365_TOTAL_DAYS';
  end if;
  perform clock_timestamp() at time zone p_timezone;

  select *
  into v_row
  from public.content_365_settings
  where workspace_id = v_workspace;

  if v_row.start_date is not null then
    v_start_at := (v_row.start_date + p_send_time) at time zone trim(p_timezone);
  end if;

  insert into public.content_365_settings (
    workspace_id, enabled, timezone, send_time, current_day, total_days,
    loop_enabled, next_run_at, created_by
  ) values (
    v_workspace, p_enabled, trim(p_timezone), p_send_time, 1, p_total_days,
    p_loop_enabled,
    case when p_enabled then private.next_content_365_run(trim(p_timezone), p_send_time, clock_timestamp()) else null end,
    v_actor
  )
  on conflict (workspace_id) do update
  set enabled = excluded.enabled,
      timezone = excluded.timezone,
      send_time = excluded.send_time,
      total_days = excluded.total_days,
      current_day = case
        when public.content_365_settings.current_day > excluded.total_days then 1
        else public.content_365_settings.current_day
      end,
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

revoke execute on function public.admin_content_365_update_settings(boolean, time without time zone, text, boolean, integer) from public;
revoke execute on function public.admin_content_365_update_settings(boolean, time without time zone, text, boolean, integer) from anon;
grant execute on function public.admin_content_365_update_settings(boolean, time without time zone, text, boolean, integer) to authenticated;
grant execute on function public.admin_content_365_update_settings(boolean, time without time zone, text, boolean, integer) to service_role;

drop function if exists public.admin_content_365_assign_post(smallint, uuid, text);

create function public.admin_content_365_assign_post(
  p_day_number integer,
  p_source_post_id uuid,
  p_status text default 'ACTIVE'::text
)
returns public.content_365_items
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_total_days integer;
  v_item public.content_365_items;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  select total_days
  into v_total_days
  from public.content_365_settings
  where workspace_id = v_workspace;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if p_day_number not between 1 and v_total_days then raise exception 'CONTENT_365_DAY_OUT_OF_RANGE'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'INVALID_CONTENT_365_STATUS'; end if;
  if not exists (
    select 1 from public.channel_posts
    where id = p_source_post_id and workspace_id = v_workspace
  ) then raise exception 'SOURCE_POST_NOT_FOUND'; end if;

  insert into public.content_365_items (workspace_id, day_number, source_post_id, status, created_by)
  values (v_workspace, p_day_number, p_source_post_id, p_status, v_actor)
  on conflict (workspace_id, day_number) do update
  set source_post_id = excluded.source_post_id,
      status = excluded.status
  returning * into v_item;

  return v_item;
end;
$function$;

revoke execute on function public.admin_content_365_assign_post(integer, uuid, text) from public;
revoke execute on function public.admin_content_365_assign_post(integer, uuid, text) from anon;
grant execute on function public.admin_content_365_assign_post(integer, uuid, text) to authenticated;
grant execute on function public.admin_content_365_assign_post(integer, uuid, text) to service_role;

drop function if exists public.admin_content_365_reset(smallint);

create function public.admin_content_365_reset(
  p_day_number integer default 1
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
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN']::text[]) then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;

  select *
  into v_row
  from public.content_365_settings
  where workspace_id = v_workspace
  for update;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if p_day_number not between 1 and v_row.total_days then raise exception 'CONTENT_365_DAY_OUT_OF_RANGE'; end if;
  if v_row.pending_post_id is not null then raise exception 'CONTENT_365_POST_IN_PROGRESS'; end if;

  update public.content_365_settings
  set current_day = p_day_number,
      next_run_at = case when enabled then private.next_content_365_run(timezone, send_time, clock_timestamp()) else null end,
      last_error = null
  where workspace_id = v_workspace
  returning * into v_row;

  return v_row;
end;
$function$;

revoke execute on function public.admin_content_365_reset(integer) from public;
revoke execute on function public.admin_content_365_reset(integer) from anon;
grant execute on function public.admin_content_365_reset(integer) to authenticated;
grant execute on function public.admin_content_365_reset(integer) to service_role;

create or replace function private.advance_content_365_after_sent(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_run public.content_365_runs;
  v_settings public.content_365_settings;
  v_next_day integer;
begin
  select * into v_run
  from public.content_365_runs
  where channel_post_id = p_post_id
  for update;

  if not found then return false; end if;

  update public.content_365_runs
  set status = 'SENT', sent_at = coalesce(sent_at, clock_timestamp()), error_code = null
  where id = v_run.id;

  select * into v_settings
  from public.content_365_settings
  where workspace_id = v_run.workspace_id
  for update;

  if not found or v_settings.pending_post_id is distinct from p_post_id then
    return true;
  end if;

  select day_number into v_next_day
  from public.content_365_items
  where workspace_id = v_run.workspace_id
    and status = 'ACTIVE'
    and day_number > v_run.day_number
    and day_number <= v_settings.total_days
  order by day_number
  limit 1;

  if v_next_day is null and v_settings.loop_enabled then
    select day_number into v_next_day
    from public.content_365_items
    where workspace_id = v_run.workspace_id
      and status = 'ACTIVE'
      and day_number <= v_settings.total_days
    order by day_number
    limit 1;
  end if;

  if v_next_day is null then
    update public.content_365_settings
    set enabled = false,
        pending_post_id = null,
        last_sent_at = clock_timestamp(),
        last_post_id = p_post_id,
        next_run_at = null,
        last_error = case when v_settings.loop_enabled then 'NO_ACTIVE_CONTENT' else null end
    where workspace_id = v_run.workspace_id;
  else
    update public.content_365_settings
    set current_day = v_next_day,
        pending_post_id = null,
        last_sent_at = clock_timestamp(),
        last_post_id = p_post_id,
        next_run_at = private.next_content_365_run(timezone, send_time, clock_timestamp()),
        last_error = null
    where workspace_id = v_run.workspace_id;
  end if;

  return true;
end;
$function$;

create or replace function public.internal_schedule_content_365()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_settings public.content_365_settings;
  v_item public.content_365_items;
  v_source public.channel_posts;
  v_post public.channel_posts;
  v_run_id uuid;
  v_pending_status text;
  v_pending_job_status text;
  v_count integer := 0;
begin
  for v_settings in
    select *
    from public.content_365_settings
    where enabled = true
    order by workspace_id
    for update skip locked
  loop
    if v_settings.pending_post_id is not null then
      select status into v_pending_status
      from public.channel_posts
      where id = v_settings.pending_post_id;

      if v_pending_status = 'SENT' then
        perform private.advance_content_365_after_sent(v_settings.pending_post_id);
        continue;
      end if;

      select status::text into v_pending_job_status
      from public.scheduled_jobs
      where entity_type = 'CHANNEL_POST'
        and entity_id = v_settings.pending_post_id
        and job_type = 'CHANNEL_POST_PUBLISH'
      order by created_at desc
      limit 1;

      if v_pending_status = 'CANCELLED' or v_pending_job_status = 'DEAD' then
        update public.content_365_runs
        set status = case when v_pending_status = 'CANCELLED' then 'CANCELLED' else 'FAILED' end,
            error_code = coalesce(v_pending_job_status, v_pending_status, 'PENDING_POST_FAILED')
        where channel_post_id = v_settings.pending_post_id and status = 'QUEUED';

        update public.content_365_settings
        set pending_post_id = null,
            next_run_at = private.next_content_365_run(timezone, send_time, clock_timestamp()),
            last_error = coalesce(v_pending_job_status, v_pending_status, 'PENDING_POST_FAILED')
        where workspace_id = v_settings.workspace_id;
      else
        continue;
      end if;
    end if;

    select * into v_settings
    from public.content_365_settings
    where workspace_id = v_settings.workspace_id
    for update;

    if v_settings.next_run_at is null then
      update public.content_365_settings
      set next_run_at = private.next_content_365_run(timezone, send_time, clock_timestamp()),
          last_error = null
      where workspace_id = v_settings.workspace_id;
      continue;
    end if;

    if v_settings.next_run_at > clock_timestamp() then continue; end if;

    select * into v_item
    from public.content_365_items
    where workspace_id = v_settings.workspace_id
      and status = 'ACTIVE'
      and day_number >= v_settings.current_day
      and day_number <= v_settings.total_days
    order by day_number
    limit 1;

    if not found and v_settings.loop_enabled then
      select * into v_item
      from public.content_365_items
      where workspace_id = v_settings.workspace_id
        and status = 'ACTIVE'
        and day_number <= v_settings.total_days
      order by day_number
      limit 1;
    end if;

    if not found then
      update public.content_365_settings
      set next_run_at = private.next_content_365_run(timezone, send_time, clock_timestamp()),
          last_error = 'NO_ACTIVE_CONTENT'
      where workspace_id = v_settings.workspace_id;
      continue;
    end if;

    select * into v_source
    from public.channel_posts
    where id = v_item.source_post_id
      and workspace_id = v_settings.workspace_id;

    if not found then
      update public.content_365_settings
      set next_run_at = clock_timestamp() + interval '1 hour',
          last_error = 'SOURCE_POST_NOT_FOUND'
      where workspace_id = v_settings.workspace_id;
      continue;
    end if;

    insert into public.channel_posts (
      prompt_id, prompt_version_id, image_path, caption, scheduled_at, status,
      created_by, upsell_mode, comment_rule_id, workspace_id
    ) values (
      v_source.prompt_id, v_source.prompt_version_id, v_source.image_path, v_source.caption,
      v_settings.next_run_at, 'SCHEDULED', v_source.created_by,
      v_source.upsell_mode, v_source.comment_rule_id, v_settings.workspace_id
    ) returning * into v_post;

    insert into public.content_365_runs (
      workspace_id, item_id, day_number, source_post_id, channel_post_id, scheduled_for, status
    ) values (
      v_settings.workspace_id, v_item.id, v_item.day_number, v_item.source_post_id,
      v_post.id, v_settings.next_run_at, 'QUEUED'
    ) returning id into v_run_id;

    insert into public.scheduled_jobs (
      workspace_id, job_type, entity_type, entity_id, payload,
      idempotency_key, status, priority, run_at, max_attempts
    ) values (
      v_settings.workspace_id, 'CHANNEL_POST_PUBLISH', 'CHANNEL_POST', v_post.id,
      jsonb_build_object('channel_post_id', v_post.id, 'content_365_run_id', v_run_id, 'day_number', v_item.day_number),
      'content365:' || v_run_id::text, 'QUEUED', 50,
      greatest(v_settings.next_run_at, clock_timestamp()), 3
    );

    update public.content_365_settings
    set current_day = v_item.day_number,
        pending_post_id = v_post.id,
        last_error = null
    where workspace_id = v_settings.workspace_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
