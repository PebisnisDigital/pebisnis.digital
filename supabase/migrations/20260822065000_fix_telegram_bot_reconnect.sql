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
  v_workspace_id uuid;
  v_connection public.bot_connections;
  v_token_id uuid;
  v_webhook_id uuid;
  v_previous_bot_id bigint;
  v_replaced boolean;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.admin_profiles p
    where p.auth_user_id = p_actor_id
      and p.status = 'ACTIVE'
      and p.role = 'SUPER_ADMIN'
  ) then
    raise exception 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;

  select m.workspace_id
  into v_workspace_id
  from public.workspace_members m
  where m.auth_user_id = p_actor_id
    and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'ADMIN')
  order by case m.role when 'OWNER' then 0 else 1 end
  limit 1;

  if v_workspace_id is null then
    raise exception 'WORKSPACE_ADMIN_REQUIRED';
  end if;
  if p_bot_token is null or length(p_bot_token) < 30 or length(p_bot_token) > 256
     or p_bot_token !~ '^[0-9]+:[A-Za-z0-9_-]+$' then
    raise exception 'INVALID_BOT_TOKEN';
  end if;
  if p_bot_id is null or p_bot_id <= 0 then
    raise exception 'INVALID_BOT_ID';
  end if;
  if p_bot_username is null or p_bot_username !~ '^[A-Za-z0-9_]{5,32}$'
     or p_bot_username !~* 'bot$' then
    raise exception 'INVALID_BOT_USERNAME';
  end if;

  select *
  into v_connection
  from public.bot_connections
  where workspace_id = v_workspace_id
  order by created_at
  limit 1
  for update;

  if found then
    v_previous_bot_id := v_connection.telegram_bot_id;
    v_replaced := v_previous_bot_id is not null and v_previous_bot_id <> p_bot_id;

    update public.bot_connections
    set telegram_bot_id = p_bot_id,
        bot_username = p_bot_username,
        status = 'ACTIVE',
        last_verified_at = v_now,
        last_error_code = null,
        updated_at = v_now
    where id = v_connection.id
    returning * into v_connection;
  else
    v_previous_bot_id := null;
    v_replaced := false;

    insert into public.bot_connections (
      workspace_id, label, telegram_bot_id, bot_username, status, last_verified_at
    ) values (
      v_workspace_id, 'Bot Utama', p_bot_id, p_bot_username, 'ACTIVE', v_now
    ) returning * into v_connection;
  end if;

  select r.vault_secret_id
  into v_token_id
  from private.workspace_secret_refs r
  where r.connection_type = 'TELEGRAM_BOT'
    and r.connection_id = v_connection.id
    and r.secret_kind = 'BOT_TOKEN';

  if v_token_id is null then
    v_token_id := vault.create_secret(
      p_bot_token,
      'telegram_bot_' || v_connection.id::text,
      'Workspace Telegram bot token'
    );
    insert into private.workspace_secret_refs (
      workspace_id, connection_type, connection_id, secret_kind, vault_secret_id
    ) values (
      v_workspace_id, 'TELEGRAM_BOT', v_connection.id, 'BOT_TOKEN', v_token_id
    );
  else
    perform vault.update_secret(
      v_token_id,
      p_bot_token,
      'telegram_bot_' || v_connection.id::text,
      'Workspace Telegram bot token'
    );
    update private.workspace_secret_refs
    set rotated_at = v_now
    where connection_type = 'TELEGRAM_BOT'
      and connection_id = v_connection.id
      and secret_kind = 'BOT_TOKEN';
  end if;

  select r.vault_secret_id
  into v_webhook_id
  from private.workspace_secret_refs r
  where r.connection_type = 'TELEGRAM_BOT'
    and r.connection_id = v_connection.id
    and r.secret_kind = 'WEBHOOK_SECRET';

  if v_webhook_id is null then
    v_webhook_id := vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'telegram_webhook_' || v_connection.id::text,
      'Workspace Telegram webhook secret'
    );
    insert into private.workspace_secret_refs (
      workspace_id, connection_type, connection_id, secret_kind, vault_secret_id
    ) values (
      v_workspace_id, 'TELEGRAM_BOT', v_connection.id, 'WEBHOOK_SECRET', v_webhook_id
    );
  elsif v_replaced then
    perform vault.update_secret(
      v_webhook_id,
      encode(extensions.gen_random_bytes(32), 'hex'),
      'telegram_webhook_' || v_connection.id::text,
      'Workspace Telegram webhook secret'
    );
    update private.workspace_secret_refs
    set rotated_at = v_now
    where connection_type = 'TELEGRAM_BOT'
      and connection_id = v_connection.id
      and secret_kind = 'WEBHOOK_SECRET';
  end if;

  insert into public.system_settings (
    key, category, value, description, status, updated_by, workspace_id
  ) values (
    'telegram.bot_connection',
    'TELEGRAM',
    jsonb_build_object(
      'bot_id', p_bot_id,
      'bot_username', p_bot_username,
      'configured_at', v_now
    ),
    'Metadata koneksi bot aktif; token disimpan terpisah di Vault',
    'ACTIVE',
    p_actor_id,
    v_workspace_id
  )
  on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      status = excluded.status,
      updated_by = excluded.updated_by,
      workspace_id = excluded.workspace_id,
      updated_at = v_now;

  insert into public.audit_logs (
    workspace_id, actor_type, actor_id, action, entity_type, entity_id, summary
  ) values (
    v_workspace_id,
    'ADMIN',
    p_actor_id,
    case when v_replaced then 'TELEGRAM_BOT_REPLACED' else 'TELEGRAM_BOT_CREDENTIAL_STORED' end,
    'telegram_bot',
    v_connection.id,
    jsonb_build_object(
      'bot_id', p_bot_id,
      'bot_username', p_bot_username,
      'previous_bot_id', v_previous_bot_id,
      'storage', 'SUPABASE_VAULT'
    )
  );
end;
$function$;

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
      b.id as connection_id,
      b.webhook_path_id
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
    'webhook_path_id', c.webhook_path_id,
    'configured_at', c.value ->> 'configured_at'
  )
  from configured c;
$function$;

revoke all on function public.telegram_store_configuration(text, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_store_configuration(text, bigint, text, uuid)
  to service_role;

revoke all on function public.telegram_get_runtime_configuration()
  from public, anon, authenticated;
grant execute on function public.telegram_get_runtime_configuration()
  to service_role;
