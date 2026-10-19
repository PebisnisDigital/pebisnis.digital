-- The checkout RPC is owned by Supabase's workspace migration role. Give that
-- non-public role only the Vault capabilities used by the function so the
-- browser-facing authenticated role never receives direct secret access.
grant select on table vault.secrets to workspace_admin_executor;

grant execute on function vault.create_secret(text, text, text, uuid)
  to workspace_admin_executor;

grant execute on function vault.update_secret(uuid, text, text, text, uuid)
  to workspace_admin_executor;

revoke all on function public.admin_update_checkout_settings(
  boolean,
  text,
  bigint,
  boolean,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  bigint,
  boolean,
  text,
  integer,
  integer,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.admin_update_checkout_settings(
  boolean,
  text,
  bigint,
  boolean,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  bigint,
  boolean,
  text,
  integer,
  integer,
  text,
  text,
  text,
  text
) to authenticated;
