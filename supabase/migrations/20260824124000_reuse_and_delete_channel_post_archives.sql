create or replace function private.admin_get_channel_post_for_reuse_core(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_workspace uuid;
  v_result jsonb;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null
     or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  select jsonb_build_object(
    'id', post.id,
    'status', post.status,
    'scheduled_at', post.scheduled_at,
    'image_path', post.image_path,
    'caption', post.caption,
    'upsell_mode', post.upsell_mode,
    'category_id', prompt.category_id,
    'title', prompt.title,
    'parts', version.parts,
    'automation', jsonb_build_object(
      'id', rule.id,
      'name', rule.name,
      'keywords', rule.keywords,
      'match_mode', rule.match_mode,
      'public_success_reply', rule.public_success_reply,
      'start_required_reply', rule.start_required_reply,
      'membership_required_reply', rule.membership_required_reply,
      'status', rule.status,
      'priority', rule.priority
    )
  )
  into v_result
  from public.channel_posts post
  join public.prompts prompt on prompt.id = post.prompt_id
  join public.prompt_versions version on version.id = post.prompt_version_id
  join public.comment_automation_rules rule on rule.id = post.comment_rule_id
  where post.id = p_post_id
    and post.workspace_id = v_workspace;

  if v_result is null then raise exception 'POST_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_get_channel_post_for_reuse(p_post_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.admin_get_channel_post_for_reuse_core(p_post_id);
$$;

create or replace function private.admin_delete_channel_post_archive_core(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_workspace uuid;
  v_post public.channel_posts;
  v_deleted_claims integer := 0;
  v_prompt_cleaned boolean := false;
  v_rule_cleaned boolean := false;
  v_delete_image boolean := false;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  v_workspace := private.actor_workspace_id_core(v_actor);
  if v_workspace is null
     or not private.has_workspace_role(v_workspace, array['OWNER','ADMIN','CONTENT']::text[]) then
    raise exception 'CONTENT_ACCESS_REQUIRED';
  end if;

  select *
  into v_post
  from public.channel_posts
  where id = p_post_id
    and workspace_id = v_workspace
  for update;

  if not found then raise exception 'POST_NOT_FOUND'; end if;

  if exists (
    select 1 from public.content_365_items
    where workspace_id = v_workspace and source_post_id = p_post_id
  ) then raise exception 'POST_USED_IN_CONTENT_365'; end if;

  if exists (
    select 1 from public.content_365_runs
    where workspace_id = v_workspace
      and (source_post_id = p_post_id or channel_post_id = p_post_id)
  ) then raise exception 'POST_HAS_CONTENT_365_HISTORY'; end if;

  if exists (
    select 1
    from public.comment_claims
    where workspace_id = v_workspace
      and channel_post_id = p_post_id
      and not (status = 'DELIVERED' and expiry_status = 'COMPLETED')
  ) then raise exception 'POST_HAS_ACTIVE_DELIVERIES'; end if;

  delete from public.comment_claims
  where workspace_id = v_workspace
    and channel_post_id = p_post_id
    and status = 'DELIVERED'
    and expiry_status = 'COMPLETED';
  get diagnostics v_deleted_claims = row_count;

  delete from public.channel_posts
  where id = p_post_id
    and workspace_id = v_workspace;

  if v_post.comment_rule_id is not null
     and not exists (select 1 from public.channel_posts where comment_rule_id = v_post.comment_rule_id)
     and not exists (select 1 from public.comment_claims where rule_id = v_post.comment_rule_id) then
    delete from public.comment_automation_rules
    where id = v_post.comment_rule_id
      and workspace_id = v_workspace;
    v_rule_cleaned := found;
  end if;

  if not exists (select 1 from public.channel_posts where prompt_id = v_post.prompt_id) then
    update public.prompts
    set status = 'DRAFT', current_version_id = null
    where id = v_post.prompt_id
      and workspace_id = v_workspace;

    delete from public.prompt_versions
    where prompt_id = v_post.prompt_id
      and workspace_id = v_workspace;

    delete from public.prompts
    where id = v_post.prompt_id
      and workspace_id = v_workspace;
    v_prompt_cleaned := found;
  end if;

  if v_post.image_path is not null then
    v_delete_image := not exists (
      select 1 from public.channel_posts where image_path = v_post.image_path
    );
  end if;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, summary, workspace_id
  ) values (
    'ADMIN', v_actor, 'CHANNEL_POST_ARCHIVE_DELETED', 'CHANNEL_POST', p_post_id,
    jsonb_build_object(
      'status', v_post.status,
      'telegram_message_id', v_post.telegram_message_id,
      'deleted_completed_claims', v_deleted_claims,
      'prompt_cleaned', v_prompt_cleaned,
      'automation_cleaned', v_rule_cleaned,
      'image_path', v_post.image_path,
      'delete_image', v_delete_image
    ),
    v_workspace
  );

  return jsonb_build_object(
    'id', p_post_id,
    'status', v_post.status,
    'image_path', v_post.image_path,
    'delete_image', v_delete_image,
    'deleted_completed_claims', v_deleted_claims,
    'prompt_cleaned', v_prompt_cleaned,
    'automation_cleaned', v_rule_cleaned
  );
end;
$$;

create or replace function public.admin_delete_channel_post_archive(p_post_id uuid)
returns jsonb
language sql
set search_path = ''
as $$
  select private.admin_delete_channel_post_archive_core(p_post_id);
$$;

revoke all on function private.admin_get_channel_post_for_reuse_core(uuid) from public, anon;
grant execute on function private.admin_get_channel_post_for_reuse_core(uuid) to authenticated, service_role;
revoke all on function public.admin_get_channel_post_for_reuse(uuid) from public, anon;
grant execute on function public.admin_get_channel_post_for_reuse(uuid) to authenticated, service_role;

revoke all on function private.admin_delete_channel_post_archive_core(uuid) from public, anon;
grant execute on function private.admin_delete_channel_post_archive_core(uuid) to authenticated, service_role;
revoke all on function public.admin_delete_channel_post_archive(uuid) from public, anon;
grant execute on function public.admin_delete_channel_post_archive(uuid) to authenticated, service_role;

comment on function public.admin_get_channel_post_for_reuse(uuid) is
  'Returns an editable copy payload for any archived channel post without mutating the original post.';
comment on function public.admin_delete_channel_post_archive(uuid) is
  'Permanently deletes a safe channel post archive and orphaned prompt/automation data; blocks active or Content 365 references.';
