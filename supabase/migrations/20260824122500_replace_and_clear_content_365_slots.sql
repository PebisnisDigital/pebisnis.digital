set lock_timeout = '5s';

create or replace function private.admin_content_365_replace_slot_core(
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
  v_source_item_id uuid;
  v_source_old_day integer;
  v_target_item_id uuid;
  v_replaced_source_id uuid;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;

  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null
     or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  select total_days into v_total_days
  from public.content_365_settings
  where workspace_id = v_workspace
  for update;

  if not found then raise exception 'CONTENT_365_SETTINGS_NOT_FOUND'; end if;
  if p_target_day not between 1 and v_total_days then raise exception 'CONTENT_365_DAY_OUT_OF_RANGE'; end if;
  if p_status not in ('DRAFT','ACTIVE','PAUSED') then raise exception 'INVALID_CONTENT_365_STATUS'; end if;
  if not exists (
    select 1 from public.channel_posts
    where id = p_source_post_id and workspace_id = v_workspace
  ) then raise exception 'SOURCE_POST_NOT_FOUND'; end if;

  perform 1
  from public.content_365_items
  where workspace_id = v_workspace
  order by day_number
  for update;

  set constraints all deferred;

  select id, day_number
  into v_source_item_id, v_source_old_day
  from public.content_365_items
  where workspace_id = v_workspace
    and source_post_id = p_source_post_id;

  select id, source_post_id
  into v_target_item_id, v_replaced_source_id
  from public.content_365_items
  where workspace_id = v_workspace
    and day_number = p_target_day;

  if v_source_item_id is not null and v_source_old_day = p_target_day then
    update public.content_365_items
    set status = p_status
    where id = v_source_item_id;
  elsif v_source_item_id is not null then
    if v_target_item_id is not null then
      delete from public.content_365_items where id = v_target_item_id;
    end if;

    update public.content_365_items
    set day_number = p_target_day,
        status = p_status
    where id = v_source_item_id;
  elsif v_target_item_id is not null then
    update public.content_365_items
    set source_post_id = p_source_post_id,
        status = p_status,
        created_by = v_actor
    where id = v_target_item_id;
  else
    insert into public.content_365_items (
      workspace_id, day_number, source_post_id, status, created_by
    ) values (
      v_workspace, p_target_day, p_source_post_id, p_status, v_actor
    );
  end if;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, summary, workspace_id
  ) values (
    'ADMIN', v_actor, 'CONTENT_365_SLOT_REPLACED', 'CONTENT_365_ITEM',
    p_source_post_id,
    jsonb_build_object(
      'source_post_id', p_source_post_id,
      'from_day', v_source_old_day,
      'target_day', p_target_day,
      'replaced_source_post_id',
        case when v_replaced_source_id = p_source_post_id then null else v_replaced_source_id end
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

revoke all on function private.admin_content_365_replace_slot_core(integer, uuid, text) from public;
revoke all on function private.admin_content_365_replace_slot_core(integer, uuid, text) from anon;
grant execute on function private.admin_content_365_replace_slot_core(integer, uuid, text) to authenticated;
grant execute on function private.admin_content_365_replace_slot_core(integer, uuid, text) to service_role;

create or replace function public.admin_content_365_replace_slot(
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
  from private.admin_content_365_replace_slot_core(
    p_target_day, p_source_post_id, p_status
  );
$function$;

revoke all on function public.admin_content_365_replace_slot(integer, uuid, text) from public;
revoke all on function public.admin_content_365_replace_slot(integer, uuid, text) from anon;
grant execute on function public.admin_content_365_replace_slot(integer, uuid, text) to authenticated;
grant execute on function public.admin_content_365_replace_slot(integer, uuid, text) to service_role;

create or replace function private.admin_content_365_clear_slot_core(
  p_source_post_id uuid
)
returns setof public.content_365_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_workspace uuid;
  v_removed_day integer;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;

  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null
     or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  delete from public.content_365_items
  where workspace_id = v_workspace
    and source_post_id = p_source_post_id
  returning day_number into v_removed_day;

  if v_removed_day is not null then
    insert into public.audit_logs (
      actor_type, actor_id, action, entity_type, entity_id, summary, workspace_id
    ) values (
      'ADMIN', v_actor, 'CONTENT_365_SLOT_CLEARED', 'CONTENT_365_ITEM',
      p_source_post_id,
      jsonb_build_object(
        'source_post_id', p_source_post_id,
        'removed_day', v_removed_day
      ),
      v_workspace
    );
  end if;

  return query
  select item.*
  from public.content_365_items item
  where item.workspace_id = v_workspace
  order by item.day_number;
end;
$function$;

revoke all on function private.admin_content_365_clear_slot_core(uuid) from public;
revoke all on function private.admin_content_365_clear_slot_core(uuid) from anon;
grant execute on function private.admin_content_365_clear_slot_core(uuid) to authenticated;
grant execute on function private.admin_content_365_clear_slot_core(uuid) to service_role;

create or replace function public.admin_content_365_clear_slot(
  p_source_post_id uuid
)
returns setof public.content_365_items
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.admin_content_365_clear_slot_core(p_source_post_id);
$function$;

revoke all on function public.admin_content_365_clear_slot(uuid) from public;
revoke all on function public.admin_content_365_clear_slot(uuid) from anon;
grant execute on function public.admin_content_365_clear_slot(uuid) to authenticated;
grant execute on function public.admin_content_365_clear_slot(uuid) to service_role;
