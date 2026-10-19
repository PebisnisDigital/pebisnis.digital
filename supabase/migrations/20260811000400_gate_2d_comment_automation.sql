create table if not exists public.comment_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 80),
  keyword text not null check (char_length(trim(keyword)) between 1 and 40),
  match_mode text not null default 'EXACT' check (match_mode in ('EXACT','WORD','CONTAINS')),
  public_success_reply text not null check (char_length(trim(public_success_reply)) between 3 and 500),
  start_required_reply text not null check (char_length(trim(start_required_reply)) between 3 and 500),
  membership_required_reply text not null check (char_length(trim(membership_required_reply)) between 3 and 500),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  priority smallint not null default 100 check (priority between 1 and 1000),
  created_by uuid not null default auth.uid() references public.admin_profiles(auth_user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists comment_automation_rules_keyword_mode_uidx
  on public.comment_automation_rules (lower(trim(keyword)), match_mode);

alter table public.comment_automation_rules enable row level security;
drop policy if exists comment_automation_rules_admin_select on public.comment_automation_rules;
create policy comment_automation_rules_admin_select on public.comment_automation_rules
  for select to authenticated using ((select private.is_active_admin()));
grant select on public.comment_automation_rules to authenticated;
revoke insert, update, delete on public.comment_automation_rules from anon, authenticated;

drop trigger if exists comment_automation_rules_set_updated_at on public.comment_automation_rules;
create trigger comment_automation_rules_set_updated_at
before update on public.comment_automation_rules
for each row execute function public.set_updated_at();

insert into public.comment_automation_rules (
  name, keyword, match_mode, public_success_reply,
  start_required_reply, membership_required_reply, status, created_by
)
select
  'Ambil prompt gratis', 'MAU', 'EXACT',
  'Prompt sudah dikirim ke japri ✅',
  'Buka bot dan tekan START dulu agar prompt bisa dikirim ke japri.',
  'Syarat join belum lengkap. Buka bot lalu cek keanggotaan.',
  'ACTIVE', auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (lower(trim(keyword)), match_mode) do nothing;

create table if not exists public.channel_discussion_threads (
  id uuid primary key default gen_random_uuid(),
  channel_post_id uuid not null references public.channel_posts(id) on delete cascade,
  discussion_chat_id bigint not null,
  discussion_message_id bigint not null,
  channel_chat_id bigint not null,
  channel_message_id bigint not null,
  created_at timestamptz not null default now(),
  unique (discussion_chat_id, discussion_message_id),
  unique (channel_chat_id, channel_message_id)
);

alter table public.channel_discussion_threads enable row level security;
drop policy if exists channel_discussion_threads_admin_select on public.channel_discussion_threads;
create policy channel_discussion_threads_admin_select on public.channel_discussion_threads
  for select to authenticated using ((select private.is_active_admin()));
grant select on public.channel_discussion_threads to authenticated;
revoke insert, update, delete on public.channel_discussion_threads from anon, authenticated;

insert into public.channel_discussion_threads (
  channel_post_id, discussion_chat_id, discussion_message_id,
  channel_chat_id, channel_message_id
)
select
  cp.id,
  (tu.payload #>> '{message,chat,id}')::bigint,
  (tu.payload #>> '{message,message_id}')::bigint,
  cp.telegram_chat_id,
  cp.telegram_message_id
from public.telegram_updates tu
join public.channel_posts cp
  on cp.telegram_message_id = coalesce(
    nullif(tu.payload #>> '{message,forward_origin,message_id}', '')::bigint,
    nullif(tu.payload #>> '{message,forward_from_message_id}', '')::bigint
  )
where tu.payload #>> '{message,is_automatic_forward}' = 'true'
  and tu.payload #>> '{message,chat,id}' ~ '^-?[0-9]+$'
  and tu.payload #>> '{message,message_id}' ~ '^[0-9]+$'
  and cp.telegram_chat_id is not null
  and cp.telegram_message_id is not null
on conflict do nothing;

create table if not exists public.comment_claims (
  id uuid primary key default gen_random_uuid(),
  telegram_update_id uuid not null unique references public.telegram_updates(id) on delete restrict,
  rule_id uuid not null references public.comment_automation_rules(id) on delete restrict,
  channel_post_id uuid not null references public.channel_posts(id) on delete restrict,
  user_id uuid references public.users(id) on delete restrict,
  discussion_chat_id bigint not null,
  comment_message_id bigint not null,
  status text not null default 'RECEIVED' check (status in (
    'RECEIVED','USER_NOT_STARTED','MEMBERSHIP_REQUIRED','SENDING',
    'DELIVERED','BLOCKED','FAILED','OUTCOME_UNKNOWN'
  )),
  next_part_index integer not null default 0 check (next_part_index >= 0),
  dm_message_ids bigint[] not null default '{}',
  public_reply_message_id bigint,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (discussion_chat_id, comment_message_id)
);

create index if not exists comment_claims_status_created_idx
  on public.comment_claims(status, created_at desc);
create index if not exists comment_claims_post_created_idx
  on public.comment_claims(channel_post_id, created_at desc);

alter table public.comment_claims enable row level security;
drop policy if exists comment_claims_admin_select on public.comment_claims;
create policy comment_claims_admin_select on public.comment_claims
  for select to authenticated using ((select private.is_active_admin()));
grant select on public.comment_claims to authenticated;
revoke insert, update, delete on public.comment_claims from anon, authenticated;

drop trigger if exists comment_claims_set_updated_at on public.comment_claims;
create trigger comment_claims_set_updated_at
before update on public.comment_claims
for each row execute function public.set_updated_at();

create or replace function public.admin_update_comment_automation_rule(
  p_rule_id uuid,
  p_keyword text,
  p_match_mode text,
  p_public_success_reply text,
  p_start_required_reply text,
  p_membership_required_reply text,
  p_status text
) returns public.comment_automation_rules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_rule public.comment_automation_rules;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
  if char_length(trim(p_keyword)) not between 1 and 40 then raise exception 'INVALID_KEYWORD'; end if;
  if p_match_mode not in ('EXACT','WORD','CONTAINS') then raise exception 'INVALID_MATCH_MODE'; end if;
  if char_length(trim(p_public_success_reply)) not between 3 and 500 then raise exception 'INVALID_SUCCESS_REPLY'; end if;
  if char_length(trim(p_start_required_reply)) not between 3 and 500 then raise exception 'INVALID_START_REPLY'; end if;
  if char_length(trim(p_membership_required_reply)) not between 3 and 500 then raise exception 'INVALID_MEMBERSHIP_REPLY'; end if;
  if p_status not in ('ACTIVE','INACTIVE') then raise exception 'INVALID_STATUS'; end if;

  update public.comment_automation_rules
  set keyword = trim(p_keyword), match_mode = p_match_mode,
      public_success_reply = trim(p_public_success_reply),
      start_required_reply = trim(p_start_required_reply),
      membership_required_reply = trim(p_membership_required_reply),
      status = p_status
  where id = p_rule_id
  returning * into v_rule;
  if not found then raise exception 'RULE_NOT_FOUND'; end if;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'COMMENT_AUTOMATION_RULE_UPDATED', 'COMMENT_RULE', v_rule.id,
    jsonb_build_object('keyword', v_rule.keyword, 'match_mode', v_rule.match_mode, 'status', v_rule.status));
  return v_rule;
end;
$function$;

revoke all on function public.admin_update_comment_automation_rule(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_comment_automation_rule(uuid,text,text,text,text,text,text) to authenticated;
