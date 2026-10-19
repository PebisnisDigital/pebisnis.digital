-- Gate 3K: Owner-only JSON backup, validation, and insert-safe recovery.

insert into public.system_settings (key, category, value, description, status)
values (
  'backup.project_identity',
  'SECURITY',
  jsonb_build_object('id', gen_random_uuid()::text),
  'Stable marker used to reject backup files from another project.',
  'ACTIVE'
)
on conflict (key) do nothing;

create or replace function public.admin_export_backup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_identity text;
  v_backup jsonb;
begin
  if not exists (
    select 1 from public.admin_profiles
    where auth_user_id = v_actor and role = 'SUPER_ADMIN' and status = 'ACTIVE'
  ) then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;

  select value->>'id' into v_identity
  from public.system_settings where key = 'backup.project_identity';

  select jsonb_build_object(
    'format', 'PROMPT_VIRAL_BACKUP',
    'schema_version', 1,
    'project_identity', v_identity,
    'generated_at', clock_timestamp(),
    'generated_by', v_actor,
    'notice', 'Payment proof files remain in private Storage; this file contains their recovery metadata.',
    'data', jsonb_build_object(
      'system_settings', coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from public.system_settings t where t.key not in ('worker.runtime', 'gate1h.result', 'backup.project_identity')), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.categories t), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.products t), '[]'::jsonb),
      'prompts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.prompts t), '[]'::jsonb),
      'prompt_versions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.prompt_versions t), '[]'::jsonb),
      'comment_automation_rules', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.comment_automation_rules t), '[]'::jsonb),
      'channel_posts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.channel_posts t), '[]'::jsonb),
      'follow_up_automations', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.follow_up_automations t), '[]'::jsonb),
      'follow_up_steps', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.follow_up_steps t), '[]'::jsonb),
      'users', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.users t), '[]'::jsonb),
      'purchase_orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.purchase_orders t), '[]'::jsonb),
      'payment_proofs', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.payment_proofs t), '[]'::jsonb),
      'broadcast_preferences', coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at) from public.broadcast_preferences t), '[]'::jsonb),
      'audit_logs', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.audit_logs t), '[]'::jsonb)
    )
  ) into v_backup;

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, summary)
  values ('ADMIN', v_actor, 'BACKUP_EXPORTED', 'SYSTEM_BACKUP',
    jsonb_build_object('schema_version', 1, 'bytes', octet_length(v_backup::text)));

  return v_backup;
end;
$function$;

create or replace function public.admin_preview_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_identity text;
  v_data jsonb;
  v_key text;
  v_counts jsonb := '{}'::jsonb;
  v_keys constant text[] := array[
    'system_settings', 'categories', 'products', 'prompts', 'prompt_versions',
    'comment_automation_rules', 'channel_posts', 'follow_up_automations',
    'follow_up_steps', 'users', 'purchase_orders', 'payment_proofs',
    'broadcast_preferences', 'audit_logs'
  ];
begin
  if not exists (
    select 1 from public.admin_profiles
    where auth_user_id = v_actor and role = 'SUPER_ADMIN' and status = 'ACTIVE'
  ) then raise exception 'OWNER_ACCESS_REQUIRED'; end if;

  if p_backup is null or octet_length(p_backup::text) > 8388608 then
    raise exception 'BACKUP_FILE_INVALID_OR_TOO_LARGE';
  end if;
  if p_backup->>'format' <> 'PROMPT_VIRAL_BACKUP' or (p_backup->>'schema_version')::integer <> 1 then
    raise exception 'BACKUP_FORMAT_NOT_SUPPORTED';
  end if;
  select value->>'id' into v_identity from public.system_settings where key = 'backup.project_identity';
  if p_backup->>'project_identity' is distinct from v_identity then
    raise exception 'BACKUP_FROM_ANOTHER_PROJECT';
  end if;
  v_data := p_backup->'data';
  if jsonb_typeof(v_data) <> 'object' then raise exception 'BACKUP_DATA_INVALID'; end if;

  foreach v_key in array v_keys loop
    if jsonb_typeof(coalesce(v_data->v_key, '[]'::jsonb)) <> 'array' then
      raise exception 'BACKUP_SECTION_INVALID:%', v_key;
    end if;
    v_counts := v_counts || jsonb_build_object(v_key, jsonb_array_length(coalesce(v_data->v_key, '[]'::jsonb)));
  end loop;

  return jsonb_build_object(
    'valid', true,
    'schema_version', 1,
    'generated_at', p_backup->>'generated_at',
    'counts', v_counts,
    'restore_mode', 'INSERT_MISSING_AND_UPDATE_SETTINGS',
    'warning', 'Existing orders and audit rows are never overwritten. Active send queues are not included.'
  );
exception when invalid_text_representation then
  raise exception 'BACKUP_FORMAT_NOT_SUPPORTED';
end;
$function$;

create or replace function public.admin_restore_backup(
  p_backup jsonb,
  p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_preview jsonb;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_item jsonb;
begin
  if p_confirmation <> 'PULIHKAN DATA' then raise exception 'RESTORE_CONFIRMATION_REQUIRED'; end if;
  v_preview := public.admin_preview_backup(p_backup);

  -- Configuration is restored deliberately; volatile worker state and project
  -- identity were excluded from the backup at export time.
  insert into public.system_settings
  select r.* from jsonb_populate_recordset(null::public.system_settings, p_backup#>'{data,system_settings}') r
  on conflict (key) do update set
    category = excluded.category,
    value = excluded.value,
    description = excluded.description,
    status = excluded.status,
    updated_by = v_actor,
    updated_at = clock_timestamp();
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  insert into public.categories select r.* from jsonb_populate_recordset(null::public.categories, p_backup#>'{data,categories}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  insert into public.products select r.* from jsonb_populate_recordset(null::public.products, p_backup#>'{data,products}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  for v_item in select value from jsonb_array_elements(p_backup#>'{data,prompts}') loop
    insert into public.prompts
    select (jsonb_populate_record(
      null::public.prompts,
      (v_item - 'current_version_id') || jsonb_build_object('status', 'DRAFT')
    )).* on conflict do nothing;
    get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  end loop;
  insert into public.prompt_versions select r.* from jsonb_populate_recordset(null::public.prompt_versions, p_backup#>'{data,prompt_versions}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  for v_item in select value from jsonb_array_elements(p_backup#>'{data,prompts}') loop
    if nullif(v_item->>'current_version_id', '') is not null then
      update public.prompts set
        current_version_id = (v_item->>'current_version_id')::uuid,
        status = coalesce(v_item->>'status', 'DRAFT')
      where id = (v_item->>'id')::uuid and current_version_id is null
        and exists (select 1 from public.prompt_versions where id = (v_item->>'current_version_id')::uuid);
    end if;
  end loop;

  insert into public.comment_automation_rules select r.* from jsonb_populate_recordset(null::public.comment_automation_rules, p_backup#>'{data,comment_automation_rules}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  insert into public.channel_posts select r.* from jsonb_populate_recordset(null::public.channel_posts, p_backup#>'{data,channel_posts}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  insert into public.follow_up_automations select r.* from jsonb_populate_recordset(null::public.follow_up_automations, p_backup#>'{data,follow_up_automations}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  insert into public.follow_up_steps select r.* from jsonb_populate_recordset(null::public.follow_up_steps, p_backup#>'{data,follow_up_steps}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  insert into public.users select r.* from jsonb_populate_recordset(null::public.users, p_backup#>'{data,users}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  for v_item in select value from jsonb_array_elements(p_backup#>'{data,purchase_orders}') loop
    insert into public.purchase_orders select (jsonb_populate_record(null::public.purchase_orders, v_item - 'latest_payment_proof_id')).* on conflict do nothing;
    get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  end loop;
  insert into public.payment_proofs select r.* from jsonb_populate_recordset(null::public.payment_proofs, p_backup#>'{data,payment_proofs}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  for v_item in select value from jsonb_array_elements(p_backup#>'{data,purchase_orders}') loop
    if nullif(v_item->>'latest_payment_proof_id', '') is not null then
      update public.purchase_orders set latest_payment_proof_id = (v_item->>'latest_payment_proof_id')::uuid
      where id = (v_item->>'id')::uuid and latest_payment_proof_id is null
        and exists (select 1 from public.payment_proofs where id = (v_item->>'latest_payment_proof_id')::uuid);
    end if;
  end loop;
  insert into public.broadcast_preferences select r.* from jsonb_populate_recordset(null::public.broadcast_preferences, p_backup#>'{data,broadcast_preferences}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  -- Audit history is append-only. Existing IDs are skipped and never changed.
  insert into public.audit_logs select r.* from jsonb_populate_recordset(null::public.audit_logs, p_backup#>'{data,audit_logs}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, summary)
  values ('ADMIN', v_actor, 'BACKUP_RESTORED', 'SYSTEM_BACKUP',
    jsonb_build_object('schema_version', 1, 'rows_inserted_or_settings_updated', v_inserted));

  return jsonb_build_object(
    'restored', true,
    'rows_inserted_or_settings_updated', v_inserted,
    'active_queues_restored', false,
    'completed_at', clock_timestamp(),
    'preview', v_preview
  );
end;
$function$;

revoke all on function public.admin_export_backup() from public, anon;
revoke all on function public.admin_preview_backup(jsonb) from public, anon;
revoke all on function public.admin_restore_backup(jsonb, text) from public, anon;
grant execute on function public.admin_export_backup() to authenticated;
grant execute on function public.admin_preview_backup(jsonb) to authenticated;
grant execute on function public.admin_restore_backup(jsonb, text) to authenticated;
