-- Gate 3Q: allow safe owner-driven bot replacement and lock bot secrets to the service role.

create or replace function public.telegram_store_configuration(
  p_bot_token text,
  p_bot_id bigint,
  p_bot_username text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token_id uuid;
  v_webhook_secret_id uuid;
  v_now timestamptz := clock_timestamp();
  v_previous_bot_id bigint;
  v_previous_bot_username text;
  v_replaced boolean := false;
begin
  if not exists (
    select 1 from public.admin_profiles p
    where p.auth_user_id = p_actor_id and p.status = 'ACTIVE' and p.role = 'SUPER_ADMIN'
  ) then
    raise exception 'active SUPER_ADMIN required';
  end if;

  if p_bot_token is null or length(p_bot_token) < 30 or length(p_bot_token) > 256
     or p_bot_token !~ '^[0-9]+:[A-Za-z0-9_-]+$' then
    raise exception 'invalid Telegram bot token format';
  end if;
  if p_bot_id is null or p_bot_id <= 0 then raise exception 'invalid Telegram bot id'; end if;
  if p_bot_username is null or p_bot_username !~ '^[A-Za-z0-9_]{5,32}$' or p_bot_username !~* 'bot$' then
    raise exception 'invalid Telegram bot username';
  end if;

  select nullif(value->>'bot_id','')::bigint, value->>'bot_username'
  into v_previous_bot_id, v_previous_bot_username
  from public.system_settings where key = 'telegram.bot_connection';
  v_replaced := v_previous_bot_id is not null and v_previous_bot_id <> p_bot_id;

  select id into v_token_id from vault.secrets where name = 'prompt_viral_staging_telegram_bot_token';
  if v_token_id is null then
    perform vault.create_secret(p_bot_token, 'prompt_viral_staging_telegram_bot_token', 'PROMPT VIRAL active Telegram BotFather token');
  else
    perform vault.update_secret(v_token_id, p_bot_token, 'prompt_viral_staging_telegram_bot_token', 'PROMPT VIRAL active Telegram BotFather token');
  end if;

  select id into v_webhook_secret_id from vault.secrets where name = 'prompt_viral_staging_telegram_webhook_secret';
  if v_webhook_secret_id is null then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'prompt_viral_staging_telegram_webhook_secret', 'PROMPT VIRAL active Telegram webhook verification secret');
  elsif v_replaced then
    perform vault.update_secret(v_webhook_secret_id, encode(extensions.gen_random_bytes(32), 'hex'), 'prompt_viral_staging_telegram_webhook_secret', 'PROMPT VIRAL active Telegram webhook verification secret');
  end if;

  insert into public.system_settings(key, category, value, description, status, updated_by)
  values ('telegram.bot_connection', 'TELEGRAM', jsonb_build_object('bot_id',p_bot_id,'bot_username',p_bot_username,'configured_at',v_now), 'Metadata koneksi bot aktif; token disimpan terpisah di Vault', 'ACTIVE', p_actor_id)
  on conflict(key) do update set value=excluded.value,description=excluded.description,status=excluded.status,updated_by=excluded.updated_by,updated_at=v_now;

  insert into public.audit_logs(actor_type,actor_id,action,entity_type,summary)
  values ('ADMIN',p_actor_id,case when v_replaced then 'TELEGRAM_BOT_REPLACED' else 'TELEGRAM_BOT_CREDENTIAL_STORED' end,'telegram_bot',
    jsonb_build_object('bot_id',p_bot_id,'bot_username',p_bot_username,'previous_bot_id',v_previous_bot_id,'previous_bot_username',v_previous_bot_username,'storage','SUPABASE_VAULT'));
end;
$function$;

revoke all on function public.telegram_store_configuration(text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.telegram_store_configuration(text,bigint,text,uuid) to service_role;
revoke all on function public.telegram_get_runtime_configuration() from public, anon, authenticated;
grant execute on function public.telegram_get_runtime_configuration() to service_role;
