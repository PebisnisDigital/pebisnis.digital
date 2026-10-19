alter table public.broadcast_preferences
  drop constraint if exists broadcast_preferences_source_check;

alter table public.broadcast_preferences
  add constraint broadcast_preferences_source_check
  check (source in ('DEFAULT','TELEGRAM_BUTTON','TELEGRAM_COMMAND','ADMIN'));

create or replace function public.admin_resubscribe_broadcast(p_user_id uuid)
returns public.broadcast_preferences
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_preference public.broadcast_preferences;
begin
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.broadcast_preferences (
    user_id, subscribed, opted_out_at, source, updated_at
  ) values (
    p_user_id, true, null, 'ADMIN', clock_timestamp()
  )
  on conflict (user_id) do update
  set subscribed = true,
      opted_out_at = null,
      source = 'ADMIN',
      updated_at = clock_timestamp()
  returning * into v_preference;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values (
    'ADMIN', v_actor, 'BROADCAST_RESUBSCRIBED', 'USER', p_user_id,
    jsonb_build_object('source', 'ADMIN')
  );

  return v_preference;
end;
$function$;

revoke all on function public.admin_resubscribe_broadcast(uuid) from public, anon;
grant execute on function public.admin_resubscribe_broadcast(uuid) to authenticated;
