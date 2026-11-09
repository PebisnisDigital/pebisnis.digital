-- /akses is a free public library of explicitly ACTIVE calendar episodes.
-- Never grant anonymous SELECT on admin, order, subscriber or prompt tables.

create or replace function public.public_akses_episodes()
returns table (
  day_number integer,
  title text,
  pillar text,
  parts jsonb,
  image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ci.day_number::integer,
    coalesce(nullif(p.title, ''), 'EPS ' || ci.day_number::text),
    case
      when upper(cp.caption) like '%PEMBELI%' then 'PEMBELI'
      when upper(cp.caption) like '%PRODUK%' then 'PRODUK'
      when upper(cp.caption) like '%SISTEM%' then 'SISTEM'
      else 'PIKIR'
    end,
    pv.parts,
    cp.image_path
  from public.content_365_items ci
  join public.channel_posts cp on cp.id = ci.source_post_id
  join public.prompt_versions pv on pv.id = cp.prompt_version_id
  left join public.prompts p on p.id = cp.prompt_id
  where ci.status = 'ACTIVE'
  order by ci.day_number asc;
$$;

revoke all on function public.public_akses_episodes() from public;
grant execute on function public.public_akses_episodes() to anon, authenticated;

-- Check visibility of a single Storage path with owner privileges, without
-- exposing any private tables, filenames or admin secrets to the visitor.
create or replace function public.public_akses_image_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_365_items ci
    join public.channel_posts cp on cp.id = ci.source_post_id
    where ci.status = 'ACTIVE' and cp.image_path = p_path
  );
$$;

revoke all on function public.public_akses_image_allowed(text) from public;
grant execute on function public.public_akses_image_allowed(text) to anon, authenticated;

drop policy if exists channel_post_images_public_akses_select on storage.objects;
create policy channel_post_images_public_akses_select
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'channel-post-images'
    and (select public.public_akses_image_allowed(name))
  );

comment on function public.public_akses_episodes() is
  'Public read-only projection of active calendar material for /akses; hides admin, subscriber and order fields.';
