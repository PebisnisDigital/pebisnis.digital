alter table public.channel_posts
  add column if not exists upsell_mode text not null default 'NONE'
  check (upsell_mode in ('NONE', 'PROMPT_VIRAL'));

alter table public.comment_claims
  add column if not exists upsell_mode text not null default 'NONE'
  check (upsell_mode in ('NONE', 'PROMPT_VIRAL'));

-- Preserve the behavior of posts and claims created before this per-prompt choice existed.
update public.channel_posts set upsell_mode = 'PROMPT_VIRAL';
update public.comment_claims set upsell_mode = 'PROMPT_VIRAL';

drop function if exists public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz);

create or replace function public.admin_create_channel_post(
  p_category_id uuid,
  p_title text,
  p_description text,
  p_prompt_parts jsonb,
  p_license_type text,
  p_creator_name text,
  p_source_url text,
  p_permission_reference text,
  p_image_path text,
  p_caption text,
  p_upsell_mode text,
  p_scheduled_at timestamptz
) returns public.channel_posts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_prompt_id uuid;
  v_version_id uuid;
  v_post public.channel_posts;
  v_schedule timestamptz := p_scheduled_at;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and kind = 'PROMPT' and status = 'ACTIVE') then raise exception 'ACTIVE_PROMPT_CATEGORY_REQUIRED'; end if;
  if char_length(trim(p_title)) not between 3 and 120 then raise exception 'INVALID_TITLE'; end if;
  if p_description is not null and char_length(trim(p_description)) > 1000 then raise exception 'INVALID_DESCRIPTION'; end if;
  if not private.is_nonempty_text_array(p_prompt_parts) then raise exception 'INVALID_PROMPT_PARTS'; end if;
  if p_license_type not in ('ORIGINAL','LICENSED','PUBLIC_DOMAIN','CLIENT_OWNED') then raise exception 'INVALID_LICENSE'; end if;
  if p_license_type in ('LICENSED','PUBLIC_DOMAIN','CLIENT_OWNED') and nullif(trim(p_creator_name), '') is null then raise exception 'CREATOR_NAME_REQUIRED'; end if;
  if p_source_url is not null and p_source_url !~ '^https?://' then raise exception 'INVALID_SOURCE_URL'; end if;
  if p_image_path !~ ('^' || v_actor::text || '/[A-Za-z0-9._/-]+$') then raise exception 'INVALID_IMAGE_PATH'; end if;
  if char_length(trim(p_caption)) not between 10 and 1024 then raise exception 'INVALID_CAPTION'; end if;
  if p_upsell_mode not in ('NONE','PROMPT_VIRAL') then raise exception 'INVALID_UPSELL_MODE'; end if;

  insert into public.prompts (category_id, title, description, status, created_by)
  values (p_category_id, trim(p_title), nullif(trim(p_description), ''), 'DRAFT', v_actor)
  returning id into v_prompt_id;

  insert into public.prompt_versions (
    prompt_id, version_no, parts, content_hash, status, license_type,
    creator_name, source_url, permission_reference, preview_allowed, created_by
  ) values (
    v_prompt_id, 1, p_prompt_parts, '', 'APPROVED', p_license_type,
    nullif(trim(p_creator_name), ''), nullif(trim(p_source_url), ''),
    nullif(trim(p_permission_reference), ''), false, v_actor
  ) returning id into v_version_id;

  update public.prompts set current_version_id = v_version_id, status = 'ACTIVE' where id = v_prompt_id;

  insert into public.channel_posts (
    prompt_id, prompt_version_id, image_path, caption, upsell_mode, scheduled_at, status, created_by
  ) values (
    v_prompt_id, v_version_id, p_image_path, trim(p_caption), p_upsell_mode, v_schedule,
    case when v_schedule is null then 'DRAFT' else 'SCHEDULED' end, v_actor
  ) returning * into v_post;

  if v_schedule is not null then
    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key, status, priority, run_at, max_attempts
    ) values (
      'CHANNEL_POST_PUBLISH', 'CHANNEL_POST', v_post.id,
      jsonb_build_object('channel_post_id', v_post.id),
      'channel-post:' || v_post.id::text || ':publish:v1', 'QUEUED', 50, v_schedule, 3
    );

    if v_schedule <= clock_timestamp() then
      perform net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'prompt_viral_staging_project_url' limit 1) || '/functions/v1/job-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'prompt_viral_staging_job_worker_secret' limit 1)
        ),
        body := jsonb_build_object('source', 'admin_post_now', 'channel_post_id', v_post.id),
        timeout_milliseconds := 10000
      );
    end if;
  end if;

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'CHANNEL_POST_CREATED', 'CHANNEL_POST', v_post.id,
    jsonb_build_object('status', v_post.status, 'scheduled_at', v_post.scheduled_at, 'prompt_id', v_prompt_id, 'upsell_mode', p_upsell_mode));
  return v_post;
end;
$function$;

revoke all on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,text,timestamptz) to authenticated;
