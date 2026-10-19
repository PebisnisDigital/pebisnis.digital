create index if not exists channel_discussion_threads_post_idx
  on public.channel_discussion_threads(channel_post_id);

create index if not exists comment_automation_rules_created_by_idx
  on public.comment_automation_rules(created_by);

create index if not exists comment_claims_rule_idx
  on public.comment_claims(rule_id);

create index if not exists comment_claims_user_idx
  on public.comment_claims(user_id)
  where user_id is not null;
