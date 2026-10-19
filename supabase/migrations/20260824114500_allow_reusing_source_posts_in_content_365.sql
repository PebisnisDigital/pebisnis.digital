set lock_timeout = '5s';

alter table public.content_365_items
  drop constraint if exists content_365_items_workspace_id_source_post_id_key;

create index if not exists content_365_items_workspace_source_post_idx
  on public.content_365_items (workspace_id, source_post_id);
