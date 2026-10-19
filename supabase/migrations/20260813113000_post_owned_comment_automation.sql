-- Setiap posting memiliki aturan komentar sendiri. Keyword yang sama boleh dipakai
-- pada posting berbeda karena worker selalu memilih rule dari channel_post_id.
drop index if exists public.comment_automation_rules_keyword_mode_uidx;

create index if not exists comment_automation_rules_keyword_mode_idx
  on public.comment_automation_rules (lower(trim(keyword)), match_mode);

create or replace function public.admin_create_channel_post_with_automation(
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
  p_scheduled_at timestamptz,
  p_automation_name text,
  p_keywords text[],
  p_match_mode text,
  p_public_success_reply text,
  p_start_required_reply text,
  p_membership_required_reply text,
  p_automation_status text default 'ACTIVE'
) returns public.channel_posts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule public.comment_automation_rules;
  v_post public.channel_posts;
begin
  select * into v_rule
  from public.admin_save_comment_automation_rule(
    null,
    p_automation_name,
    p_keywords,
    p_match_mode,
    p_public_success_reply,
    p_start_required_reply,
    p_membership_required_reply,
    p_automation_status,
    100::smallint
  );

  select * into v_post
  from public.admin_create_channel_post(
    p_category_id,
    p_title,
    p_description,
    p_prompt_parts,
    p_license_type,
    p_creator_name,
    p_source_url,
    p_permission_reference,
    p_image_path,
    p_caption,
    p_upsell_mode,
    v_rule.id,
    p_scheduled_at
  );

  return v_post;
end;
$function$;

revoke all on function public.admin_create_channel_post_with_automation(
  uuid,text,text,jsonb,text,text,text,text,text,text,text,timestamptz,
  text,text[],text,text,text,text,text
) from public, anon;

grant execute on function public.admin_create_channel_post_with_automation(
  uuid,text,text,jsonb,text,text,text,text,text,text,text,timestamptz,
  text,text[],text,text,text,text,text
) to authenticated;
