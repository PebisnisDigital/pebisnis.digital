create index if not exists channel_posts_prompt_version_idx
  on public.channel_posts(prompt_version_id);
create index if not exists channel_posts_created_by_idx
  on public.channel_posts(created_by);
create index if not exists prompts_current_version_idx
  on public.prompts(current_version_id);

