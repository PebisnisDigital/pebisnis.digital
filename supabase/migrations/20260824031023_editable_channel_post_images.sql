alter table public.channel_posts
  alter column image_path drop not null;

alter table public.channel_posts
  drop constraint if exists channel_posts_image_path_check;

alter table public.channel_posts
  drop constraint if exists channel_posts_image_path_shape_check;

alter table public.channel_posts
  add constraint channel_posts_image_path_shape_check
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$')
  not valid;

alter table public.channel_posts
  validate constraint channel_posts_image_path_shape_check;

comment on column public.channel_posts.image_path is
  'Optional private Storage path. Draft and scheduled posts may be published as text-only content.';
