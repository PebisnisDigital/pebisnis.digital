alter table public.purchase_orders
  add column if not exists access_delivery_status text not null default 'NOT_READY'
    check (access_delivery_status in ('NOT_READY','QUEUED','SENDING','SENT','FAILED','BLOCKED','OUTCOME_UNKNOWN')),
  add column if not exists access_message_id bigint,
  add column if not exists access_sent_at timestamptz,
  add column if not exists access_failure_code text;

create index if not exists purchase_orders_access_delivery_idx
  on public.purchase_orders(access_delivery_status, paid_at)
  where status = 'PAID' and access_delivery_status in ('QUEUED','FAILED');

insert into public.system_settings (key, category, value, description, status, updated_by)
select
  'bot.checkout',
  'TELEGRAM',
  jsonb_build_object(
    'enabled', false,
    'product_label', 'PROMPT VIRAL — Kumpulan Prompt',
    'amount_idr', 0,
    'bank_name', '',
    'account_number', '',
    'account_name', '',
    'payment_note', 'Transfer sesuai nominal lalu kirim bukti pembayaran kepada Admin.',
    'access_text', '✅ Pembayaran sudah dikonfirmasi. Akses PROMPT VIRAL kamu sudah aktif.',
    'access_button_text', '',
    'access_button_url', ''
  ),
  'Konfigurasi checkout transfer manual dan pengiriman akses produk.',
  'ACTIVE',
  auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (key) do nothing;

create or replace function public.admin_update_checkout_settings(
  p_enabled boolean,
  p_product_label text,
  p_amount_idr bigint,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_payment_note text,
  p_access_text text,
  p_access_button_text text,
  p_access_button_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_value jsonb;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(coalesce(p_product_label, ''))) not between 3 and 160 then raise exception 'INVALID_PRODUCT_LABEL'; end if;
  if p_amount_idr is null or p_amount_idr < 0 then raise exception 'INVALID_CHECKOUT_AMOUNT'; end if;
  if char_length(trim(coalesce(p_bank_name, ''))) > 80 then raise exception 'INVALID_BANK_NAME'; end if;
  if char_length(trim(coalesce(p_account_number, ''))) > 80 then raise exception 'INVALID_ACCOUNT_NUMBER'; end if;
  if char_length(trim(coalesce(p_account_name, ''))) > 120 then raise exception 'INVALID_ACCOUNT_NAME'; end if;
  if char_length(trim(coalesce(p_payment_note, ''))) > 1000 then raise exception 'INVALID_PAYMENT_NOTE'; end if;
  if char_length(trim(coalesce(p_access_text, ''))) not between 3 and 4000 then raise exception 'INVALID_ACCESS_TEXT'; end if;
  if char_length(trim(coalesce(p_access_button_text, ''))) > 64 then raise exception 'INVALID_ACCESS_BUTTON_TEXT'; end if;
  if (trim(coalesce(p_access_button_text, '')) = '') <> (trim(coalesce(p_access_button_url, '')) = '') then
    raise exception 'INCOMPLETE_ACCESS_BUTTON';
  end if;
  if trim(coalesce(p_access_button_url, '')) <> '' and trim(p_access_button_url) !~ '^https://' then
    raise exception 'INVALID_ACCESS_BUTTON_URL';
  end if;
  if p_enabled and (
    p_amount_idr <= 0 or trim(coalesce(p_bank_name, '')) = '' or
    trim(coalesce(p_account_number, '')) = '' or trim(coalesce(p_account_name, '')) = ''
  ) then raise exception 'CHECKOUT_PAYMENT_DETAILS_REQUIRED'; end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'product_label', trim(p_product_label),
    'amount_idr', p_amount_idr,
    'bank_name', trim(coalesce(p_bank_name, '')),
    'account_number', trim(coalesce(p_account_number, '')),
    'account_name', trim(coalesce(p_account_name, '')),
    'payment_note', trim(coalesce(p_payment_note, '')),
    'access_text', trim(p_access_text),
    'access_button_text', trim(coalesce(p_access_button_text, '')),
    'access_button_url', trim(coalesce(p_access_button_url, ''))
  );

  insert into public.system_settings (key, category, value, description, status, updated_by)
  values ('bot.checkout', 'TELEGRAM', v_value,
    'Konfigurasi checkout transfer manual dan pengiriman akses produk.', 'ACTIVE', v_actor)
  on conflict (key) do update set
    value = excluded.value, status = 'ACTIVE', updated_by = v_actor, updated_at = clock_timestamp();

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'CHECKOUT_SETTINGS_UPDATED', 'SYSTEM_SETTING', null,
    jsonb_build_object('enabled', p_enabled, 'amount_idr', p_amount_idr));
  return v_value;
end;
$function$;

revoke all on function public.admin_update_checkout_settings(boolean,text,bigint,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_checkout_settings(boolean,text,bigint,text,text,text,text,text,text,text) to authenticated;

create or replace function private.enqueue_paid_order_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'PAID' and old.status is distinct from 'PAID' then
    update public.purchase_orders
    set access_delivery_status = 'QUEUED', access_failure_code = null
    where id = new.id and access_delivery_status = 'NOT_READY';

    insert into public.scheduled_jobs(
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'PURCHASE_ACCESS_SEND', 'PURCHASE_ORDER', new.id,
      jsonb_build_object('order_id', new.id),
      'purchase-access:' || new.id::text,
      'QUEUED', 100, clock_timestamp(), 4, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.enqueue_paid_order_access() from public, anon, authenticated;
drop trigger if exists purchase_orders_enqueue_paid_access on public.purchase_orders;
create trigger purchase_orders_enqueue_paid_access
after update of status on public.purchase_orders
for each row execute function private.enqueue_paid_order_access();

