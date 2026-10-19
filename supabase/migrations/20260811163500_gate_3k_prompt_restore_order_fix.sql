-- Gate 3K hotfix: restore prompts as DRAFT until their version rows exist.

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

  insert into public.system_settings
  select r.* from jsonb_populate_recordset(null::public.system_settings, p_backup#>'{data,system_settings}') r
  on conflict (key) do update set category = excluded.category, value = excluded.value,
    description = excluded.description, status = excluded.status, updated_by = v_actor,
    updated_at = clock_timestamp();
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  insert into public.categories select r.* from jsonb_populate_recordset(null::public.categories, p_backup#>'{data,categories}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  insert into public.products select r.* from jsonb_populate_recordset(null::public.products, p_backup#>'{data,products}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  for v_item in select value from jsonb_array_elements(p_backup#>'{data,prompts}') loop
    insert into public.prompts
    select (jsonb_populate_record(null::public.prompts,
      (v_item - 'current_version_id') || jsonb_build_object('status', 'DRAFT'))).*
    on conflict do nothing;
    get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  end loop;
  insert into public.prompt_versions select r.* from jsonb_populate_recordset(null::public.prompt_versions, p_backup#>'{data,prompt_versions}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;
  for v_item in select value from jsonb_array_elements(p_backup#>'{data,prompts}') loop
    if nullif(v_item->>'current_version_id', '') is not null then
      update public.prompts set current_version_id = (v_item->>'current_version_id')::uuid,
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
  insert into public.audit_logs select r.* from jsonb_populate_recordset(null::public.audit_logs, p_backup#>'{data,audit_logs}') r on conflict do nothing;
  get diagnostics v_rows = row_count; v_inserted := v_inserted + v_rows;

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, summary)
  values ('ADMIN', v_actor, 'BACKUP_RESTORED', 'SYSTEM_BACKUP',
    jsonb_build_object('schema_version', 1, 'rows_inserted_or_settings_updated', v_inserted));
  return jsonb_build_object('restored', true, 'rows_inserted_or_settings_updated', v_inserted,
    'active_queues_restored', false, 'completed_at', clock_timestamp(), 'preview', v_preview);
end;
$function$;

revoke all on function public.admin_restore_backup(jsonb, text) from public, anon;
grant execute on function public.admin_restore_backup(jsonb, text) to authenticated;
