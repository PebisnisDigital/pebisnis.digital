-- Gate 3A: keep audience filters fast as the member and claim tables grow.
create index if not exists users_last_seen_at_idx
  on public.users (last_seen_at desc);

create index if not exists users_onboarding_status_last_seen_idx
  on public.users (onboarding_status, last_seen_at desc);

create index if not exists users_contact_status_last_seen_idx
  on public.users (contact_status, last_seen_at desc);

create index if not exists comment_claims_user_created_at_idx
  on public.comment_claims (user_id, created_at desc)
  where user_id is not null;
