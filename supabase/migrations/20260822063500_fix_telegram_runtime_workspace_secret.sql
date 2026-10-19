create or replace function public.telegram_get_runtime_configuration()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with configured as (
    select
      s.value,
      b.id as connection_id
    from public.system_settings s
    left join public.bot_connections b
      on b.telegram_bot_id = nullif(s.value ->> 'bot_id', '')::bigint
     and b.status = 'ACTIVE'
    where s.key = 'telegram.bot_connection'
    order by b.updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'bot_token', coalesce(
      (
        select v.decrypted_secret
        from vault.decrypted_secrets v
        where v.name = 'prompt_viral_staging_telegram_bot_token'
        limit 1
      ),
      (
        select v.decrypted_secret
        from private.workspace_secret_refs r
        join vault.decrypted_secrets v on v.id = r.vault_secret_id
        where r.connection_type = 'TELEGRAM_BOT'
          and r.connection_id = c.connection_id
          and r.secret_kind = 'BOT_TOKEN'
        limit 1
      )
    ),
    'webhook_secret', coalesce(
      (
        select v.decrypted_secret
        from vault.decrypted_secrets v
        where v.name = 'prompt_viral_staging_telegram_webhook_secret'
        limit 1
      ),
      (
        select v.decrypted_secret
        from private.workspace_secret_refs r
        join vault.decrypted_secrets v on v.id = r.vault_secret_id
        where r.connection_type = 'TELEGRAM_BOT'
          and r.connection_id = c.connection_id
          and r.secret_kind = 'WEBHOOK_SECRET'
        limit 1
      )
    ),
    'bot_id', c.value ->> 'bot_id',
    'bot_username', c.value ->> 'bot_username',
    'configured_at', c.value ->> 'configured_at'
  )
  from configured c;
$function$;

revoke all on function public.telegram_get_runtime_configuration()
  from public, anon, authenticated;
grant execute on function public.telegram_get_runtime_configuration()
  to service_role;
