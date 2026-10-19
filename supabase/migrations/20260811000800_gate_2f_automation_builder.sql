create or replace function private.is_valid_comment_keywords(p_keywords text[])
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(cardinality(p_keywords) between 1 and 10, false)
    and not exists (
      select 1 from unnest(p_keywords) value
      where char_length(trim(value)) not between 1 and 40
    );
$function$;

alter table public.comment_automation_rules
  add column if not exists keywords text[] not null default '{}';

update public.comment_automation_rules
set keywords = array[keyword]
where cardinality(keywords) = 0;

alter table public.comment_automation_rules
  drop constraint if exists comment_automation_rules_keywords_check;
alter table public.comment_automation_rules
  add constraint comment_automation_rules_keywords_check
  check (private.is_valid_comment_keywords(keywords));

alter table public.channel_posts
  add column if not exists comment_rule_id uuid
  references public.comment_automation_rules(id) on delete restrict;

update public.channel_posts post
set comment_rule_id = rule.id
from lateral (
  select id from public.comment_automation_rules
  order by priority, created_at
  limit 1
) rule
where post.comment_rule_id is null;

create index if not exists channel_posts_comment_rule_idx
  on public.channel_posts(comment_rule_id);

create or replace function public.admin_save_comment_automation_rule(
  p_rule_id uuid,
  p_name text,
  p_keywords text[],
  p_match_mode text,
  p_public_success_reply text,
  p_start_required_reply text,
  p_membership_required_reply text,
  p_status text,
  p_priority smallint default 100
) returns public.comment_automation_rules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_rule public.comment_automation_rules;
  v_keywords text[];
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_name)) not between 3 and 80 then raise exception 'INVALID_RULE_NAME'; end if;
  select array_agg(value order by position) into v_keywords
  from (
    select trim(value) value, min(position) position
    from unnest(p_keywords) with ordinality input(value, position)
    where nullif(trim(value), '') is not null
    group by lower(trim(value)), trim(value)
  ) normalized;
  if not private.is_valid_comment_keywords(v_keywords) then raise exception 'INVALID_KEYWORDS'; end if;
  if p_match_mode not in ('EXACT','WORD','CONTAINS') then raise exception 'INVALID_MATCH_MODE'; end if;
  if char_length(trim(p_public_success_reply)) not between 3 and 500 then raise exception 'INVALID_SUCCESS_REPLY'; end if;
  if char_length(trim(p_start_required_reply)) not between 3 and 500 then raise exception 'INVALID_START_REPLY'; end if;
  if char_length(trim(p_membership_required_reply)) not between 3 and 500 then raise exception 'INVALID_MEMBERSHIP_REPLY'; end if;
  if p_status not in ('ACTIVE','INACTIVE') then raise exception 'INVALID_STATUS'; end if;
  if p_priority not between 1 and 1000 then raise exception 'INVALID_PRIORITY'; end if;

  if p_rule_id is null then
    insert into public.comment_automation_rules (
      name, keyword, keywords, match_mode, public_success_reply,
      start_required_reply, membership_required_reply, status, priority, created_by
    ) values (
      trim(p_name), v_keywords[1], v_keywords, p_match_mode, trim(p_public_success_reply),
      trim(p_start_required_reply), trim(p_membership_required_reply), p_status, p_priority, v_actor
    ) returning * into v_rule;
  else
    update public.comment_automation_rules
    set name = trim(p_name), keyword = v_keywords[1], keywords = v_keywords,
        match_mode = p_match_mode, public_success_reply = trim(p_public_success_reply),
        start_required_reply = trim(p_start_required_reply),
        membership_required_reply = trim(p_membership_required_reply),
        status = p_status, priority = p_priority
    where id = p_rule_id
    returning * into v_rule;
    if not found then raise exception 'RULE_NOT_FOUND'; end if;
  end if;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'COMMENT_AUTOMATION_RULE_SAVED', 'COMMENT_RULE', v_rule.id,
    jsonb_build_object('name', v_rule.name, 'keywords', v_rule.keywords, 'match_mode', v_rule.match_mode, 'status', v_rule.status));
  return v_rule;
end;
$function$;

revoke all on function public.admin_save_comment_automation_rule(uuid,text,text[],text,text,text,text,text,smallint) from public, anon;
grant execute on function public.admin_save_comment_automation_rule(uuid,text,text[],text,text,text,text,text,smallint) to authenticated;

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
  p_comment_rule_id uuid,
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
  if not exists (select 1 from public.comment_automation_rules where id = p_comment_rule_id) then raise exception 'COMMENT_AUTOMATION_REQUIRED'; end if;
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
    prompt_id, prompt_version_id, image_path, caption, upsell_mode,
    comment_rule_id, scheduled_at, status, created_by
  ) values (
    v_prompt_id, v_version_id, p_image_path, trim(p_caption), p_upsell_mode,
    p_comment_rule_id, v_schedule,
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
    jsonb_build_object('status', v_post.status, 'prompt_id', v_prompt_id, 'upsell_mode', p_upsell_mode, 'comment_rule_id', p_comment_rule_id));
  return v_post;
end;
$function$;

revoke all on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,text,uuid,timestamptz) from public, anon;
grant execute on function public.admin_create_channel_post(uuid,text,text,jsonb,text,text,text,text,text,text,text,uuid,timestamptz) to authenticated;
