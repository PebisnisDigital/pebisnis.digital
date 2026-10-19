set lock_timeout = '5s';

alter table public.content_365_items
  drop constraint if exists content_365_items_workspace_id_day_number_key;

alter table public.content_365_items
  add constraint content_365_items_workspace_id_day_number_key
  unique (workspace_id, day_number)
  deferrable initially immediate;

drop index if exists public.content_365_items_workspace_source_post_idx;

alter table public.content_365_items
  add constraint content_365_items_workspace_id_source_post_id_key
  unique (workspace_id, source_post_id)
  deferrable initially immediate;

create or replace function private.admin_content_365_place_post_core(
  p_target_day integer,
  p_source_post_id uuid,
  p_status text default 'ACTIVE'
)
returns setof public.content_365_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_workspace uuid;
  v_total_days integer;
  v_old_day integer;
  v_empty_day integer;
  v_inserted boolean := false;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null
     or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  select total_days
  into v_total_days
  from public.content_365_settings
  where workspace_id = v_workspace
  for update;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if p_target_day not between 1 and v_total_days then raise exception 'CONTENT_365_DAY_OUT_OF_RANGE'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'INVALID_CONTENT_365_STATUS'; end if;

  if not exists (
    select 1
    from public.channel_posts
    where id = p_source_post_id
      and workspace_id = v_workspace
  ) then
    raise exception 'SOURCE_POST_NOT_FOUND';
  end if;

  perform 1
  from public.content_365_items
  where workspace_id = v_workspace
  order by day_number
  for update;

  set constraints all deferred;

  select day_number
  into v_old_day
  from public.content_365_items
  where workspace_id = v_workspace
    and source_post_id = p_source_post_id;

  if found then
    if v_old_day < p_target_day then
      update public.content_365_items
      set day_number = case
            when source_post_id = p_source_post_id then p_target_day
            else day_number - 1
          end,
          status = case
            when source_post_id = p_source_post_id then p_status
            else status
          end
      where workspace_id = v_workspace
        and day_number between v_old_day and p_target_day;
    elsif v_old_day > p_target_day then
      update public.content_365_items
      set day_number = case
            when source_post_id = p_source_post_id then p_target_day
            else day_number + 1
          end,
          status = case
            when source_post_id = p_source_post_id then p_status
            else status
          end
      where workspace_id = v_workspace
        and day_number between p_target_day and v_old_day;
    else
      update public.content_365_items
      set status = p_status
      where workspace_id = v_workspace
        and source_post_id = p_source_post_id;
    end if;
  else
    select candidate.day_number
    into v_empty_day
    from generate_series(p_target_day, v_total_days) as candidate(day_number)
    left join public.content_365_items item
      on item.workspace_id = v_workspace
     and item.day_number = candidate.day_number
    where item.id is null
    order by candidate.day_number
    limit 1;

    if v_empty_day is null then
      raise exception 'CONTENT_365_CALENDAR_FULL';
    end if;

    update public.content_365_items
    set day_number = day_number + 1
    where workspace_id = v_workspace
      and day_number >= p_target_day
      and day_number < v_empty_day;

    insert into public.content_365_items (
      workspace_id, day_number, source_post_id, status, created_by
    ) values (
      v_workspace, p_target_day, p_source_post_id, p_status, v_actor
    );

    v_inserted := true;
  end if;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, summary, workspace_id
  ) values (
    'ADMIN', v_actor, 'CONTENT_365_REORDERED', 'CONTENT_365_ITEM',
    p_source_post_id,
    jsonb_build_object(
      'source_post_id', p_source_post_id,
      'from_day', v_old_day,
      'target_day', p_target_day,
      'inserted', v_inserted
    ),
    v_workspace
  );

  return query
  select item.*
  from public.content_365_items item
  where item.workspace_id = v_workspace
  order by item.day_number;
end;
$function$;

revoke all on function private.admin_content_365_place_post_core(integer, uuid, text) from public;
revoke all on function private.admin_content_365_place_post_core(integer, uuid, text) from anon;
grant execute on function private.admin_content_365_place_post_core(integer, uuid, text) to authenticated;
grant execute on function private.admin_content_365_place_post_core(integer, uuid, text) to service_role;

create or replace function public.admin_content_365_place_post(
  p_target_day integer,
  p_source_post_id uuid,
  p_status text default 'ACTIVE'
)
returns setof public.content_365_items
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.admin_content_365_place_post_core(
    p_target_day,
    p_source_post_id,
    p_status
  );
$function$;

revoke all on function public.admin_content_365_place_post(integer, uuid, text) from public;
revoke all on function public.admin_content_365_place_post(integer, uuid, text) from anon;
grant execute on function public.admin_content_365_place_post(integer, uuid, text) to authenticated;
grant execute on function public.admin_content_365_place_post(integer, uuid, text) to service_role;

create or replace function public.admin_content_365_assign_post(
  p_day_number integer,
  p_source_post_id uuid,
  p_status text default 'ACTIVE'
)
returns public.content_365_items
language plpgsql
security definer
set search_path = ''
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

  select total_days into v_total_days
  from public.content_365_settings
  where workspace_id = v_workspace;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if p_day_number not between 1 and v_total_days then raise exception 'CONTENT_365_DAY_OUT_OF_RANGE'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'INVALID_CONTENT_365_STATUS'; end if;
  if not exists (
    select 1 from public.channel_posts
    where id = p_source_post_id and workspace_id = v_workspace
  ) then raise exception 'SOURCE_POST_NOT_FOUND'; end if;

  select *
  into v_item
  from public.content_365_items
  where workspace_id = v_workspace and day_number = p_day_number
  for update;

  if found then
    update public.content_365_items
    set source_post_id = p_source_post_id,
        status = p_status
    where id = v_item.id
    returning * into v_item;
  else
    insert into public.content_365_items (
      workspace_id, day_number, source_post_id, status, created_by
    ) values (
      v_workspace, p_day_number, p_source_post_id, p_status, v_actor
    ) returning * into v_item;
  end if;

  return v_item;
end;
$function$;
