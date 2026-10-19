-- Payment settings: manual transfer, gateway credentials, coupon, and unique code.
-- Gateway secrets are encrypted in Supabase Vault and are never returned to the browser.

alter table public.purchase_orders
  add column if not exists base_amount_idr bigint,
  add column if not exists discount_amount_idr bigint not null default 0,
  add column if not exists unique_code_amount_idr bigint not null default 0,
  add column if not exists coupon_code text;

update public.purchase_orders
set base_amount_idr = amount_idr
where base_amount_idr is null;

alter table public.purchase_orders
  alter column base_amount_idr set not null,
  add constraint purchase_orders_payment_amounts_check
    check (base_amount_idr >= 0 and discount_amount_idr >= 0 and amount_idr >= 0);

create or replace function private.normalize_purchase_order_amounts()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.base_amount_idr := coalesce(new.base_amount_idr, new.amount_idr);
  return new;
end;
$function$;

drop trigger if exists purchase_orders_normalize_amounts on public.purchase_orders;
create trigger purchase_orders_normalize_amounts
before insert on public.purchase_orders
for each row execute function private.normalize_purchase_order_amounts();

update public.system_settings
set value = value || jsonb_build_object(
  'manual_enabled', true,
  'gateway_enabled', false,
  'gateway_provider', '',
  'gateway_api_url', '',
  'gateway_merchant_id', '',
  'gateway_api_key_configured', false,
  'coupon_enabled', false,
  'coupon_code', '',
  'coupon_discount_type', 'FIXED',
  'coupon_discount_value', 0,
  'unique_code_enabled', false,
  'unique_code_direction', 'ADD',
  'unique_code_min', 1,
  'unique_code_max', 999
), updated_at = clock_timestamp()
where key = 'bot.checkout';

drop function if exists public.admin_update_checkout_settings(boolean,text,bigint,text,text,text,text,text,text,text);

create function public.admin_update_checkout_settings(
  p_enabled boolean,
  p_product_label text,
  p_amount_idr bigint,
  p_manual_enabled boolean,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_gateway_enabled boolean,
  p_gateway_provider text,
  p_gateway_api_url text,
  p_gateway_merchant_id text,
  p_gateway_api_key text,
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
  v_secret_id uuid;
  v_secret_name constant text := 'prompt_viral_payment_gateway_api_key';
  v_secret_configured boolean := false;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  if char_length(trim(coalesce(p_product_label,''))) not between 3 and 160 then raise exception 'INVALID_PRODUCT_LABEL'; end if;
  if p_amount_idr is null or p_amount_idr <= 0 then raise exception 'INVALID_CHECKOUT_AMOUNT'; end if;
  if p_enabled and not coalesce(p_manual_enabled,false) and not coalesce(p_gateway_enabled,false) then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
  if coalesce(p_manual_enabled,false) and (
    trim(coalesce(p_bank_name,'')) = '' or trim(coalesce(p_account_number,'')) = '' or trim(coalesce(p_account_name,'')) = ''
  ) then raise exception 'MANUAL_PAYMENT_DETAILS_REQUIRED'; end if;
  if char_length(trim(coalesce(p_bank_name,''))) > 80 or char_length(trim(coalesce(p_account_number,''))) > 80 or char_length(trim(coalesce(p_account_name,''))) > 120 then raise exception 'INVALID_MANUAL_PAYMENT_DETAILS'; end if;
  if trim(coalesce(p_gateway_api_url,'')) <> '' and trim(p_gateway_api_url) !~ '^https://' then raise exception 'INVALID_GATEWAY_API_URL'; end if;
  if p_gateway_enabled and (
    trim(coalesce(p_gateway_provider,'')) = '' or trim(coalesce(p_gateway_api_url,'')) = '' or trim(coalesce(p_gateway_merchant_id,'')) = ''
  ) then raise exception 'GATEWAY_DETAILS_REQUIRED'; end if;
  if p_coupon_discount_type not in ('FIXED','PERCENT') then raise exception 'INVALID_COUPON_TYPE'; end if;
  if p_coupon_discount_value < 0 or (p_coupon_discount_type = 'PERCENT' and p_coupon_discount_value > 100) then raise exception 'INVALID_COUPON_VALUE'; end if;
  if p_coupon_enabled and (trim(coalesce(p_coupon_code,'')) = '' or p_coupon_discount_value <= 0) then raise exception 'COUPON_DETAILS_REQUIRED'; end if;
  if p_unique_code_direction not in ('ADD','SUBTRACT') then raise exception 'INVALID_UNIQUE_CODE_DIRECTION'; end if;
  if p_unique_code_min < 0 or p_unique_code_max < p_unique_code_min or p_unique_code_max > 9999 then raise exception 'INVALID_UNIQUE_CODE_RANGE'; end if;
  if char_length(trim(coalesce(p_payment_note,''))) > 1000 then raise exception 'INVALID_PAYMENT_NOTE'; end if;
  if char_length(trim(coalesce(p_access_text,''))) not between 3 and 4000 then raise exception 'INVALID_ACCESS_TEXT'; end if;
  if (trim(coalesce(p_access_button_text,'')) = '') <> (trim(coalesce(p_access_button_url,'')) = '') then raise exception 'INCOMPLETE_ACCESS_BUTTON'; end if;
  if trim(coalesce(p_access_button_url,'')) <> '' and trim(p_access_button_url) !~ '^https://' then raise exception 'INVALID_ACCESS_BUTTON_URL'; end if;

  select id into v_secret_id from vault.secrets where name = v_secret_name;
  if trim(coalesce(p_gateway_api_key,'')) <> '' then
    if v_secret_id is null then
      select vault.create_secret(trim(p_gateway_api_key), v_secret_name, 'Payment gateway API key for PROMPT VIRAL') into v_secret_id;
    else
      perform vault.update_secret(v_secret_id, trim(p_gateway_api_key), v_secret_name, 'Payment gateway API key for PROMPT VIRAL');
    end if;
  end if;
  v_secret_configured := v_secret_id is not null;
  if p_gateway_enabled and not v_secret_configured then raise exception 'GATEWAY_API_KEY_REQUIRED'; end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'product_label', trim(p_product_label),
    'amount_idr', p_amount_idr,
    'manual_enabled', coalesce(p_manual_enabled,false),
    'bank_name', trim(coalesce(p_bank_name,'')),
    'account_number', trim(coalesce(p_account_number,'')),
    'account_name', trim(coalesce(p_account_name,'')),
    'gateway_enabled', coalesce(p_gateway_enabled,false),
    'gateway_provider', trim(coalesce(p_gateway_provider,'')),
    'gateway_api_url', trim(coalesce(p_gateway_api_url,'')),
    'gateway_merchant_id', trim(coalesce(p_gateway_merchant_id,'')),
    'gateway_api_key_configured', v_secret_configured,
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
  values ('bot.checkout','PAYMENT',v_value,'Checkout, metode pembayaran, kupon, dan kode unik.','ACTIVE',v_actor)
  on conflict (key) do update set value=excluded.value,category='PAYMENT',description=excluded.description,status='ACTIVE',updated_by=v_actor,updated_at=clock_timestamp();

  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'PAYMENT_SETTINGS_UPDATED','SYSTEM_SETTING',null,
    jsonb_build_object('checkout_enabled',p_enabled,'manual_enabled',p_manual_enabled,'gateway_enabled',p_gateway_enabled,'gateway_provider',trim(coalesce(p_gateway_provider,'')),'coupon_enabled',p_coupon_enabled,'unique_code_enabled',p_unique_code_enabled));
  return v_value;
end;
$function$;

revoke all on function public.admin_update_checkout_settings(boolean,text,bigint,boolean,text,text,text,boolean,text,text,text,text,boolean,text,text,bigint,boolean,text,integer,integer,text,text,text,text) from public,anon;
grant execute on function public.admin_update_checkout_settings(boolean,text,bigint,boolean,text,text,text,boolean,text,text,text,text,boolean,text,text,bigint,boolean,text,integer,integer,text,text,text,text) to authenticated;
