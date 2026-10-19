create or replace function private.admin_update_channel_post_core(
  p_post_id uuid,
  p_category_id uuid,
  p_title text,
  p_prompt_parts jsonb,
  p_image_path text,
  p_caption text,
  p_upsell_mode text,
  p_scheduled_at timestamptz,
  p_automation_name text,
  p_keywords text[],
  p_match_mode text,
  p_public_success_reply text,
  p_start_required_reply text,
  p_membership_required_reply text,
  p_automation_status text
)
returns public.channel_posts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_workspace uuid;
  v_post public.channel_posts;
  v_saved public.channel_posts;
  v_schedule timestamptz := p_scheduled_at;
  v_new_version_id uuid;
  v_next_version_no integer;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  v_workspace := private.actor_workspace_id_core(v_actor);

  select * into v_post
  from public.channel_posts
  where id = p_post_id and workspace_id = v_workspace
  for update;

  if not found or v_post.status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'POST_NOT_EDITABLE';
  end if;
  if exists (
    select 1 from public.scheduled_jobs
    where job_type = 'CHANNEL_POST_PUBLISH'
      and entity_type = 'CHANNEL_POST'
      and entity_id = v_post.id
      and status = 'PROCESSING'
  ) then
    raise exception 'POST_ALREADY_PROCESSING';
  end if;
  if not exists (
    select 1 from public.categories
    where id = p_category_id
      and workspace_id = v_workspace
      and kind = 'PROMPT'
      and status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE_PROMPT_CATEGORY_REQUIRED';
  end if;
  if char_length(trim(p_title)) not between 3 and 120 then raise exception 'INVALID_TITLE'; end if;
  if not private.is_nonempty_text_array(p_prompt_parts) then raise exception 'INVALID_PROMPT_PARTS'; end if;
  if char_length(trim(p_caption)) not between 10 and 1024 then raise exception 'INVALID_CAPTION'; end if;
  if p_upsell_mode not in ('NONE', 'PROMPT_VIRAL') then raise exception 'INVALID_UPSELL_MODE'; end if;
  if v_schedule is not null and v_schedule < clock_timestamp() + interval '30 seconds' then
    raise exception 'SCHEDULE_MUST_BE_FUTURE';
  end if;
  if p_image_path is distinct from v_post.image_path
    and p_image_path !~ ('^' || v_actor::text || '/[A-Za-z0-9._/-]+$') then
    raise exception 'INVALID_IMAGE_PATH';
  end if;

  perform public.admin_save_comment_automation_rule(
    v_post.comment_rule_id,
    p_automation_name,
    p_keywords,
    p_match_mode,
    p_public_success_reply,
    p_start_required_reply,
    p_membership_required_reply,
    p_automation_status,
    100::smallint
  );

  update public.prompts
  set category_id = p_category_id,
      title = trim(p_title)
  where id = v_post.prompt_id and workspace_id = v_workspace;

  if not found then
    raise exception 'PROMPT_NOT_FOUND';
  end if;

  select pv.id
  into v_new_version_id
  from public.prompt_versions pv
  where pv.id = v_post.prompt_version_id
    and pv.workspace_id = v_workspace
    and pv.parts = p_prompt_parts;

  if v_new_version_id is null then
    select coalesce(max(pv.version_no), 0) + 1
    into v_next_version_no
    from public.prompt_versions pv
    where pv.prompt_id = v_post.prompt_id
      and pv.workspace_id = v_workspace;

    insert into public.prompt_versions (
      prompt_id,
      version_no,
      parts,
      content_hash,
      status,
      license_type,
      creator_name,
      source_url,
      permission_reference,
      preview_allowed,
      created_by,
      workspace_id
    )
    select
      pv.prompt_id,
      v_next_version_no,
      p_prompt_parts,
      '',
      'APPROVED',
      pv.license_type,
      pv.creator_name,
      pv.source_url,
      pv.permission_reference,
      pv.preview_allowed,
      v_actor,
      v_workspace
    from public.prompt_versions pv
    where pv.id = v_post.prompt_version_id
      and pv.workspace_id = v_workspace
    returning id into v_new_version_id;

    if v_new_version_id is null then
      raise exception 'PROMPT_VERSION_NOT_FOUND';
    end if;

    update public.prompts
    set current_version_id = v_new_version_id
    where id = v_post.prompt_id
      and workspace_id = v_workspace;
  end if;

  update public.channel_posts
  set prompt_version_id = v_new_version_id,
      image_path = p_image_path,
      caption = trim(p_caption),
      upsell_mode = p_upsell_mode,
      scheduled_at = v_schedule,
      status = case when v_schedule is null then 'DRAFT' else 'SCHEDULED' end,
      failure_code = null,
      failure_message = null
  where id = v_post.id
  returning * into v_saved;

  if v_schedule is null then
    update public.scheduled_jobs
    set status = 'CANCELLED',
        completed_at = clock_timestamp(),
        lease_owner = null,
        lease_expires_at = null
    where job_type = 'CHANNEL_POST_PUBLISH'
      and entity_type = 'CHANNEL_POST'
      and entity_id = v_post.id
      and status in ('QUEUED', 'RETRY');
  else
    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key, status,
      priority, run_at, max_attempts
    ) values (
      'CHANNEL_POST_PUBLISH', 'CHANNEL_POST', v_post.id,
      jsonb_build_object('channel_post_id', v_post.id),
      'channel-post:' || v_post.id::text || ':publish:v1',
      'QUEUED', 50, v_schedule, 3
    )
    on conflict (idempotency_key) do update
    set status = 'QUEUED',
        run_at = excluded.run_at,
        attempt_count = 0,
        lease_owner = null,
        lease_expires_at = null,
        started_at = null,
        completed_at = null,
        last_error_code = null,
        last_error_message = null,
        payload = excluded.payload;
  end if;

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, summary)
  values (
    'ADMIN', v_actor, 'CHANNEL_POST_UPDATED', 'CHANNEL_POST', v_saved.id,
    jsonb_build_object(
      'status', v_saved.status,
      'scheduled_at', v_saved.scheduled_at,
      'prompt_id', v_saved.prompt_id,
      'prompt_version_id', v_saved.prompt_version_id
    )
  );

  return v_saved;
end;
$function$;
