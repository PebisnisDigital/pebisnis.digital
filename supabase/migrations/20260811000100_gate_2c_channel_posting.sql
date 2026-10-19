create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts(id) on delete restrict,
  prompt_version_id uuid not null references public.prompt_versions(id) on delete restrict,
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$'),
  caption text not null check (char_length(caption) between 10 and 1024),
  scheduled_at timestamptz,
  status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','PUBLISHING','SENT','FAILED','OUTCOME_UNKNOWN','CANCELLED')),
  telegram_chat_id bigint,
  telegram_message_id bigint,
  published_at timestamptz,
  failure_code text,
  failure_message text,
  created_by uuid not null default auth.uid() references public.admin_profiles(auth_user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_posts_sent_identity unique (telegram_chat_id, telegram_message_id),
  constraint channel_posts_schedule_shape check (
    (status = 'DRAFT' and scheduled_at is null)
    or (status in ('SCHEDULED','PUBLISHING','FAILED','OUTCOME_UNKNOWN','CANCELLED') and scheduled_at is not null)
    or (status = 'SENT' and scheduled_at is not null and telegram_message_id is not null and published_at is not null)
  )
);

create index if not exists channel_posts_status_schedule_idx
  on public.channel_posts(status, scheduled_at);
create index if not exists channel_posts_prompt_idx
  on public.channel_posts(prompt_id, created_at desc);

alter table public.channel_posts enable row level security;
drop policy if exists channel_posts_admin_select on public.channel_posts;
create policy channel_posts_admin_select on public.channel_posts
  for select to authenticated using ((select private.is_active_admin()));
drop policy if exists channel_posts_admin_update on public.channel_posts;
create policy channel_posts_admin_update on public.channel_posts
  for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

grant select, update on public.channel_posts to authenticated;
revoke insert, delete on public.channel_posts from anon, authenticated;

drop trigger if exists channel_posts_set_updated_at on public.channel_posts;
create trigger channel_posts_set_updated_at
before update on public.channel_posts
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('channel-post-images', 'channel-post-images', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists channel_post_images_admin_select on storage.objects;
create policy channel_post_images_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'channel-post-images' and (select private.is_active_admin()));

drop policy if exists channel_post_images_admin_insert on storage.objects;
create policy channel_post_images_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'channel-post-images'
    and (select private.is_active_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists channel_post_images_admin_update on storage.objects;
create policy channel_post_images_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'channel-post-images'
    and (select private.is_active_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'channel-post-images'
    and (select private.is_active_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists channel_post_images_admin_delete on storage.objects;
create policy channel_post_images_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'channel-post-images'
    and (select private.is_active_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
  if not exists (
    select 1 from public.categories
    where id = p_category_id and kind = 'PROMPT' and status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE_PROMPT_CATEGORY_REQUIRED';
  end if;
  if char_length(trim(p_title)) not between 3 and 120 then raise exception 'INVALID_TITLE'; end if;
  if p_description is not null and char_length(trim(p_description)) > 1000 then raise exception 'INVALID_DESCRIPTION'; end if;
  if not private.is_nonempty_text_array(p_prompt_parts) then raise exception 'INVALID_PROMPT_PARTS'; end if;
  if p_license_type not in ('ORIGINAL','LICENSED','PUBLIC_DOMAIN','CLIENT_OWNED') then raise exception 'INVALID_LICENSE'; end if;
  if p_license_type in ('LICENSED','PUBLIC_DOMAIN','CLIENT_OWNED') and nullif(trim(p_creator_name), '') is null then
    raise exception 'CREATOR_NAME_REQUIRED';
  end if;
  if p_source_url is not null and p_source_url !~ '^https?://' then raise exception 'INVALID_SOURCE_URL'; end if;
  if p_image_path !~ ('^' || v_actor::text || '/[A-Za-z0-9._/-]+$') then raise exception 'INVALID_IMAGE_PATH'; end if;
  if char_length(trim(p_caption)) not between 10 and 1024 then raise exception 'INVALID_CAPTION'; end if;

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

  update public.prompts
  set current_version_id = v_version_id, status = 'ACTIVE'
  where id = v_prompt_id;

  insert into public.channel_posts (
    prompt_id, prompt_version_id, image_path, caption, scheduled_at, status, created_by
  ) values (
    v_prompt_id, v_version_id, p_image_path, trim(p_caption), v_schedule,
    case when v_schedule is null then 'DRAFT' else 'SCHEDULED' end,
    v_actor
  ) returning * into v_post;

  if v_schedule is not null then
    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key, status,
      priority, run_at, max_attempts
    ) values (
      'CHANNEL_POST_PUBLISH', 'CHANNEL_POST', v_post.id,
      jsonb_build_object('channel_post_id', v_post.id),
      'channel-post:' || v_post.id::text || ':publish:v1', 'QUEUED',
      50, v_schedule, 3
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
    jsonb_build_object('status', v_post.status, 'scheduled_at', v_post.scheduled_at, 'prompt_id', v_prompt_id));

  return v_post;
end;
$function$;

revoke all on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,timestamptz) to authenticated;

create or replace function public.mark_scheduled_job_outcome_unknown(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text
) returns public.scheduled_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare v_job public.scheduled_jobs;
begin
  update public.scheduled_jobs
  set status = 'OUTCOME_UNKNOWN', completed_at = clock_timestamp(), lease_owner = null,
      lease_expires_at = null, last_error_code = p_error_code,
      last_error_message = left(p_error_message, 500)
  where id = p_job_id and status = 'PROCESSING' and lease_owner = p_worker_id
  returning * into v_job;
  if not found then raise exception 'job lease not owned'; end if;
  return v_job;
end;
$function$;

revoke all on function public.mark_scheduled_job_outcome_unknown(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.mark_scheduled_job_outcome_unknown(uuid,text,text,text) to service_role;

