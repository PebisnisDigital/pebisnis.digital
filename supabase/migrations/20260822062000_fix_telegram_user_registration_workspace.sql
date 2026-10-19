drop function if exists public.register_telegram_user(bigint, bigint, text, text, text, text);

create or replace function public.register_telegram_user(
  p_workspace_id uuid,
  p_telegram_user_id bigint,
  p_private_chat_id bigint,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  if p_workspace_id is null then
    raise exception 'workspace id required';
  end if;

  if not exists (
    select 1
    from public.workspaces
    where id = p_workspace_id
  ) then
    raise exception 'workspace not found';
  end if;

  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    raise exception 'invalid telegram user id';
  end if;

  insert into public.users (
    workspace_id, telegram_user_id, private_chat_id, username, first_name,
    last_name, language_code, status, contact_status, last_seen_at
  ) values (
    p_workspace_id, p_telegram_user_id, p_private_chat_id,
    nullif(left(p_username, 64), ''), nullif(left(p_first_name, 128), ''),
    nullif(left(p_last_name, 128), ''), nullif(left(p_language_code, 16), ''),
    'ACTIVE', 'CONTACTABLE', clock_timestamp()
  )
  on conflict (workspace_id, telegram_user_id) do update
  set private_chat_id = coalesce(excluded.private_chat_id, public.users.private_chat_id),
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      language_code = excluded.language_code,
      status = case when public.users.status = 'DELETED_REQUESTED'
        then public.users.status else 'ACTIVE'::public.customer_status end,
      contact_status = 'CONTACTABLE',
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning id into v_user_id;

  return v_user_id;
end;
$function$;

revoke all on function public.register_telegram_user(uuid, bigint, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_telegram_user(uuid, bigint, bigint, text, text, text, text)
  to service_role;
