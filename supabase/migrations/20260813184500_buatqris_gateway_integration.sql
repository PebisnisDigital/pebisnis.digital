-- BuatQris gateway integration: secure credentials, QRIS transaction tracking,
-- and an idempotent server-only payment callback transition.

alter table public.purchase_orders
  add column if not exists payment_gateway text,
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_payment_url text,
  add column if not exists gateway_qr_url text,
  add column if not exists gateway_status text,
  add column if not exists gateway_requested_amount_idr bigint,
  add column if not exists gateway_total_amount_idr bigint,
  add column if not exists gateway_credit_amount_idr bigint,
  add column if not exists gateway_admin_fee_idr bigint,
  add column if not exists gateway_is_test boolean not null default false,
  add column if not exists gateway_paid_at timestamptz,
  add column if not exists gateway_failure_code text;

create unique index if not exists purchase_orders_gateway_transaction_uidx
  on public.purchase_orders(gateway_transaction_id)
  where gateway_transaction_id is not null;

create table if not exists public.buatqris_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  transaction_id text not null,
  event_type text not null,
  status text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);

alter table public.buatqris_webhook_events enable row level security;
revoke all on public.buatqris_webhook_events from public, anon, authenticated;

update public.system_settings
set value = value
  - 'gateway_api_url'
  - 'gateway_merchant_id'
  - 'gateway_api_key_configured'
  || jsonb_build_object(
    'gateway_enabled', false,
    'gateway_provider', 'BUATQRIS',
    'buatqris_enabled', false,
    'buatqris_account_id', '',
    'buatqris_secret_token_configured', false,
    'buatqris_signing_secret_configured', false,
    'buatqris_mode', 'SANDBOX',
    'buatqris_qris_method', 'qris_two',
    'buatqris_umkm_name', 'PROMPT VIRAL'
  ),
  updated_at = clock_timestamp()
where key = 'bot.checkout';

drop function if exists public.admin_update_checkout_settings(boolean,text,bigint,boolean,text,text,text,boolean,text,text,text,text,boolean,text,text,bigint,boolean,text,integer,integer,text,text,text,text);

create function public.admin_update_checkout_settings(
  p_enabled boolean,
  p_product_label text,
  p_amount_idr bigint,
  p_manual_enabled boolean,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_buatqris_enabled boolean,
  p_buatqris_account_id text,
  p_buatqris_secret_token text,
  p_buatqris_signing_secret text,
  p_buatqris_mode text,
  p_buatqris_qris_method text,
  p_buatqris_umkm_name text,
  p_coupon_enabled boolean,
  p_coupon_code text,
  p_coupon_discount_type text,
  p_coupon_discount_value bigint,
  p_unique_code_enabled boolean,
  p_unique_code_direction text,
  p_unique_code_min integer,
  p_unique_code_max integer,
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
  v_api_secret_id uuid;
  v_signing_secret_id uuid;
  v_api_secret_configured boolean := false;
  v_signing_secret_configured boolean := false;
  v_api_secret_name constant text := 'prompt_viral_buatqris_secret_token';
  v_signing_secret_name constant text := 'prompt_viral_buatqris_signing_secret';
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  if char_length(trim(coalesce(p_product_label,''))) not between 3 and 160 then raise exception 'INVALID_PRODUCT_LABEL'; end if;
  if p_amount_idr is null or p_amount_idr <= 0 then raise exception 'INVALID_CHECKOUT_AMOUNT'; end if;
  if p_enabled and not coalesce(p_manual_enabled,false) and not coalesce(p_buatqris_enabled,false) then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
  if coalesce(p_manual_enabled,false) and (
    trim(coalesce(p_bank_name,'')) = '' or trim(coalesce(p_account_number,'')) = '' or trim(coalesce(p_account_name,'')) = ''
  ) then raise exception 'MANUAL_PAYMENT_DETAILS_REQUIRED'; end if;
  if p_buatqris_mode not in ('SANDBOX','LIVE') then raise exception 'INVALID_BUATQRIS_MODE'; end if;
  if p_buatqris_qris_method not in ('qris_one','qris_two','qris_three','qris_four') then raise exception 'INVALID_BUATQRIS_METHOD'; end if;
  if char_length(trim(coalesce(p_buatqris_umkm_name,''))) > 15 then raise exception 'BUATQRIS_UMKM_NAME_TOO_LONG'; end if;
  if p_buatqris_enabled and trim(coalesce(p_buatqris_account_id,'')) = '' then raise exception 'BUATQRIS_ACCOUNT_ID_REQUIRED'; end if;
  if p_coupon_discount_type not in ('FIXED','PERCENT') then raise exception 'INVALID_COUPON_TYPE'; end if;
  if p_coupon_discount_value < 0 or (p_coupon_discount_type = 'PERCENT' and p_coupon_discount_value > 100) then raise exception 'INVALID_COUPON_VALUE'; end if;
  if p_coupon_enabled and (trim(coalesce(p_coupon_code,'')) = '' or p_coupon_discount_value <= 0) then raise exception 'COUPON_DETAILS_REQUIRED'; end if;
  if p_unique_code_direction not in ('ADD','SUBTRACT') then raise exception 'INVALID_UNIQUE_CODE_DIRECTION'; end if;
  if p_unique_code_min < 0 or p_unique_code_max < p_unique_code_min or p_unique_code_max > 9999 then raise exception 'INVALID_UNIQUE_CODE_RANGE'; end if;
  if char_length(trim(coalesce(p_payment_note,''))) > 1000 then raise exception 'INVALID_PAYMENT_NOTE'; end if;
  if char_length(trim(coalesce(p_access_text,''))) not between 3 and 4000 then raise exception 'INVALID_ACCESS_TEXT'; end if;
  if (trim(coalesce(p_access_button_text,'')) = '') <> (trim(coalesce(p_access_button_url,'')) = '') then raise exception 'INCOMPLETE_ACCESS_BUTTON'; end if;
  if trim(coalesce(p_access_button_url,'')) <> '' and trim(p_access_button_url) !~ '^https://' then raise exception 'INVALID_ACCESS_BUTTON_URL'; end if;

  select id into v_api_secret_id from vault.secrets where name = v_api_secret_name;
  if trim(coalesce(p_buatqris_secret_token,'')) <> '' then
    if v_api_secret_id is null then
      select vault.create_secret(trim(p_buatqris_secret_token), v_api_secret_name, 'BuatQris Secret Token for PROMPT VIRAL') into v_api_secret_id;
    else
      perform vault.update_secret(v_api_secret_id, trim(p_buatqris_secret_token), v_api_secret_name, 'BuatQris Secret Token for PROMPT VIRAL');
    end if;
  end if;

  select id into v_signing_secret_id from vault.secrets where name = v_signing_secret_name;
  if trim(coalesce(p_buatqris_signing_secret,'')) <> '' then
    if v_signing_secret_id is null then
      select vault.create_secret(trim(p_buatqris_signing_secret), v_signing_secret_name, 'BuatQris webhook Signing Secret for PROMPT VIRAL') into v_signing_secret_id;
    else
      perform vault.update_secret(v_signing_secret_id, trim(p_buatqris_signing_secret), v_signing_secret_name, 'BuatQris webhook Signing Secret for PROMPT VIRAL');
    end if;
  end if;

  v_api_secret_configured := v_api_secret_id is not null;
  v_signing_secret_configured := v_signing_secret_id is not null;
  if p_buatqris_enabled and not v_api_secret_configured then raise exception 'BUATQRIS_SECRET_TOKEN_REQUIRED'; end if;
  if p_buatqris_enabled and not v_signing_secret_configured then raise exception 'BUATQRIS_SIGNING_SECRET_REQUIRED'; end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'product_label', trim(p_product_label),
    'amount_idr', p_amount_idr,
    'manual_enabled', coalesce(p_manual_enabled,false),
    'bank_name', trim(coalesce(p_bank_name,'')),
    'account_number', trim(coalesce(p_account_number,'')),
    'account_name', trim(coalesce(p_account_name,'')),
    'gateway_enabled', coalesce(p_buatqris_enabled,false),
    'gateway_provider', 'BUATQRIS',
    'buatqris_enabled', coalesce(p_buatqris_enabled,false),
    'buatqris_account_id', trim(coalesce(p_buatqris_account_id,'')),
    'buatqris_secret_token_configured', v_api_secret_configured,
    'buatqris_signing_secret_configured', v_signing_secret_configured,
    'buatqris_mode', p_buatqris_mode,
    'buatqris_qris_method', p_buatqris_qris_method,
    'buatqris_umkm_name', trim(coalesce(p_buatqris_umkm_name,'')),
    'coupon_enabled', coalesce(p_coupon_enabled,false),
    'coupon_code', upper(trim(coalesce(p_coupon_code,''))),
    'coupon_discount_type', p_coupon_discount_type,
    'coupon_discount_value', p_coupon_discount_value,
    'unique_code_enabled', coalesce(p_unique_code_enabled,false),
    'unique_code_direction', p_unique_code_direction,
    'unique_code_min', p_unique_code_min,
    'unique_code_max', p_unique_code_max,
    'payment_note', trim(coalesce(p_payment_note,'')),
    'access_text', trim(p_access_text),
    'access_button_text', trim(coalesce(p_access_button_text,'')),
    'access_button_url', trim(coalesce(p_access_button_url,''))
  );

  insert into public.system_settings(key,category,value,description,status,updated_by)
  values ('bot.checkout','PAYMENT',v_value,'Checkout manual, BuatQris, kupon, dan kode unik.','ACTIVE',v_actor)
  on conflict (key) do update set value=excluded.value,category='PAYMENT',description=excluded.description,status='ACTIVE',updated_by=v_actor,updated_at=clock_timestamp();

  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'BUATQRIS_SETTINGS_UPDATED','SYSTEM_SETTING',null,
    jsonb_build_object('checkout_enabled',p_enabled,'manual_enabled',p_manual_enabled,'buatqris_enabled',p_buatqris_enabled,'buatqris_mode',p_buatqris_mode,'coupon_enabled',p_coupon_enabled,'unique_code_enabled',p_unique_code_enabled));
  return v_value;
end;
$function$;

revoke all on function public.admin_update_checkout_settings(boolean,text,bigint,boolean,text,text,text,boolean,text,text,text,text,text,text,boolean,text,text,bigint,boolean,text,integer,integer,text,text,text,text) from public,anon;
grant execute on function public.admin_update_checkout_settings(boolean,text,bigint,boolean,text,text,text,boolean,text,text,text,text,text,text,boolean,text,text,bigint,boolean,text,integer,integer,text,text,text,text) to authenticated;

create or replace function public.internal_get_buatqris_configuration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
  v_secret_token text;
  v_signing_secret text;
begin
  select value into v_settings from public.system_settings where key = 'bot.checkout';
  select decrypted_secret into v_secret_token from vault.decrypted_secrets where name = 'prompt_viral_buatqris_secret_token';
  select decrypted_secret into v_signing_secret from vault.decrypted_secrets where name = 'prompt_viral_buatqris_signing_secret';
  return jsonb_build_object(
    'enabled', coalesce((v_settings->>'buatqris_enabled')::boolean,false),
    'account_id', coalesce(v_settings->>'buatqris_account_id',''),
    'secret_token', coalesce(v_secret_token,''),
    'signing_secret', coalesce(v_signing_secret,''),
    'mode', coalesce(v_settings->>'buatqris_mode','SANDBOX'),
    'qris_method', coalesce(v_settings->>'buatqris_qris_method','qris_two'),
    'umkm_name', coalesce(v_settings->>'buatqris_umkm_name','')
  );
end;
$function$;

revoke all on function public.internal_get_buatqris_configuration() from public,anon,authenticated;
grant execute on function public.internal_get_buatqris_configuration() to service_role;

create or replace function public.internal_process_buatqris_webhook(
  p_event_key text,
  p_transaction_id text,
  p_event_type text,
  p_status text,
  p_amount bigint,
  p_total_amount bigint,
  p_credit_amount bigint,
  p_admin_fee bigint,
  p_is_test boolean,
  p_paid_at timestamptz,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.purchase_orders;
begin
  if trim(coalesce(p_event_key,'')) = '' or trim(coalesce(p_transaction_id,'')) = '' then raise exception 'INVALID_BUATQRIS_EVENT'; end if;

  insert into public.buatqris_webhook_events(event_key,transaction_id,event_type,status,payload)
  values (p_event_key,trim(p_transaction_id),coalesce(p_event_type,''),coalesce(p_status,''),coalesce(p_payload,'{}'::jsonb))
  on conflict (event_key) do nothing;

  select * into v_order from public.purchase_orders
  where gateway_transaction_id = trim(p_transaction_id)
  for update;
  if not found then raise exception 'BUATQRIS_ORDER_NOT_FOUND'; end if;

  update public.purchase_orders
  set gateway_status = lower(coalesce(p_status,gateway_status)),
      gateway_requested_amount_idr = coalesce(p_amount,gateway_requested_amount_idr),
      gateway_total_amount_idr = coalesce(p_total_amount,gateway_total_amount_idr),
      gateway_credit_amount_idr = coalesce(p_credit_amount,gateway_credit_amount_idr),
      gateway_admin_fee_idr = coalesce(p_admin_fee,gateway_admin_fee_idr),
      gateway_is_test = coalesce(p_is_test,gateway_is_test),
      gateway_paid_at = coalesce(p_paid_at,gateway_paid_at),
      gateway_failure_code = null
  where id = v_order.id;

  if lower(coalesce(p_status,'')) = 'success' or coalesce(p_event_type,'') = 'payment.success' then
    if v_order.status <> 'PAID' then
      update public.purchase_orders
      set status = 'PAID',
          paid_at = coalesce(p_paid_at,clock_timestamp()),
          payment_reference = 'BUATQRIS-' || trim(p_transaction_id),
          cancelled_at = null,
          expired_at = null,
          access_delivery_status = case when access_delivery_status = 'SENT' then access_delivery_status else 'NOT_READY' end,
          access_failure_code = null
      where id = v_order.id;
      insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
      values ('SYSTEM',null,'BUATQRIS_PAYMENT_CONFIRMED','PURCHASE_ORDER',v_order.id,
        jsonb_build_object('order_number',v_order.order_number,'transaction_id',p_transaction_id,'total_amount',p_total_amount,'is_test',p_is_test));
    end if;
  end if;

  update public.buatqris_webhook_events set processed_at = clock_timestamp() where event_key = p_event_key;
  return jsonb_build_object('ok',true,'order_id',v_order.id,'status',case when lower(coalesce(p_status,''))='success' then 'PAID' else v_order.status end);
end;
$function$;

revoke all on function public.internal_process_buatqris_webhook(text,text,text,text,bigint,bigint,bigint,bigint,boolean,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.internal_process_buatqris_webhook(text,text,text,text,bigint,bigint,bigint,bigint,boolean,timestamptz,jsonb) to service_role;
