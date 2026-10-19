update public.system_settings
set value = value || jsonb_build_object(
  'pending_order_text', '⏳ Pesanan {order_number} dibuat dan sedang menunggu pembayaran.',
  'cancelled_order_text', '❌ Pesanan {order_number} sudah dibatalkan. Jika masih ingin membeli, silakan buat pesanan baru.',
  'paid_order_text', '✅ Pembayaran {order_number} sudah dikonfirmasi. Akses PROMPT VIRAL kamu sudah aktif.'
)
where key = 'bot.admin_notifications';

drop function if exists public.admin_update_notification_settings(boolean,uuid,integer,text);
create function public.admin_update_notification_settings(
  p_enabled boolean,
  p_recipient_user_id uuid,
  p_review_reminder_minutes integer,
  p_admin_url text,
  p_pending_order_text text,
  p_cancelled_order_text text,
  p_paid_order_text text
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
  if p_enabled and p_recipient_user_id is null then raise exception 'ADMIN_NOTIFICATION_RECIPIENT_REQUIRED'; end if;
  if p_recipient_user_id is not null and not exists (
    select 1 from public.users
    where id = p_recipient_user_id and private_chat_id is not null and contact_status = 'CONTACTABLE'
  ) then raise exception 'ADMIN_NOTIFICATION_RECIPIENT_NOT_CONTACTABLE'; end if;
  if p_review_reminder_minutes is null or p_review_reminder_minutes not between 1 and 1440 then raise exception 'INVALID_REVIEW_REMINDER_MINUTES'; end if;
  if p_admin_url is null or p_admin_url !~ '^https://[^[:space:]]+$' or char_length(p_admin_url) > 500 then raise exception 'INVALID_ADMIN_URL'; end if;
  if char_length(trim(coalesce(p_pending_order_text, ''))) not between 3 and 4000 then raise exception 'INVALID_PENDING_ORDER_TEXT'; end if;
  if char_length(trim(coalesce(p_cancelled_order_text, ''))) not between 3 and 4000 then raise exception 'INVALID_CANCELLED_ORDER_TEXT'; end if;
  if char_length(trim(coalesce(p_paid_order_text, ''))) not between 3 and 4000 then raise exception 'INVALID_PAID_ORDER_TEXT'; end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'recipient_user_id', p_recipient_user_id,
    'review_reminder_minutes', p_review_reminder_minutes,
    'admin_url', rtrim(trim(p_admin_url), '/'),
    'pending_order_text', trim(p_pending_order_text),
    'cancelled_order_text', trim(p_cancelled_order_text),
    'paid_order_text', trim(p_paid_order_text)
  );

  insert into public.system_settings(key,category,value,description,status,updated_by)
  values ('bot.admin_notifications','TELEGRAM',v_value,'Notifikasi Telegram untuk Admin dan status pesanan pembeli.','ACTIVE',v_actor)
  on conflict (key) do update set value=excluded.value,status='ACTIVE',updated_by=v_actor,updated_at=clock_timestamp();

  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'ADMIN_NOTIFICATION_SETTINGS_UPDATED','SYSTEM_SETTING',null,
    jsonb_build_object('enabled',p_enabled,'recipient_user_id',p_recipient_user_id,'review_reminder_minutes',p_review_reminder_minutes));
  return v_value;
end;
$function$;

revoke all on function public.admin_update_notification_settings(boolean,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.admin_update_notification_settings(boolean,uuid,integer,text,text,text,text) to authenticated;

create table if not exists public.customer_order_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  order_status text not null check (order_status in ('PENDING_PAYMENT','CANCELLED')),
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','SKIPPED','FAILED','BLOCKED','OUTCOME_UNKNOWN')),
  telegram_message_id bigint,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);

alter table public.customer_order_notification_deliveries enable row level security;
revoke all on public.customer_order_notification_deliveries from public,anon,authenticated;
create index if not exists customer_order_notification_status_idx on public.customer_order_notification_deliveries(status,created_at);

create or replace function private.queue_customer_order_status_notification(
  p_order_id uuid,
  p_order_status text,
  p_event_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_delivery_id uuid;
begin
  if p_order_status not in ('PENDING_PAYMENT','CANCELLED') then return; end if;
  insert into public.customer_order_notification_deliveries(event_key,order_id,order_status)
  values (p_event_key,p_order_id,p_order_status)
  on conflict (event_key) do nothing
  returning id into v_delivery_id;
  if v_delivery_id is not null then
    insert into public.scheduled_jobs(job_type,entity_type,entity_id,payload,idempotency_key,status,priority,run_at,max_attempts,correlation_id)
    values ('CUSTOMER_ORDER_STATUS_NOTIFY','CUSTOMER_ORDER_NOTIFICATION',v_delivery_id,
      jsonb_build_object('delivery_id',v_delivery_id),'customer-order-notification:'||p_event_key,'QUEUED',75,clock_timestamp(),4,gen_random_uuid())
    on conflict (idempotency_key) do nothing;
  end if;
end;
$function$;

revoke all on function private.queue_customer_order_status_notification(uuid,text,text) from public,anon,authenticated;

create or replace function private.queue_admin_managed_order_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.source = 'ADMIN' and tg_op = 'INSERT' and new.status = 'PENDING_PAYMENT' then
    perform private.queue_customer_order_status_notification(new.id,new.status,'admin-order-created:'||new.id::text);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('PENDING_PAYMENT','CANCELLED') then
    perform private.queue_customer_order_status_notification(new.id,new.status,
      'admin-order-status:'||new.id::text||':'||new.status||':'||extract(epoch from clock_timestamp())::text);
  end if;
  return new;
end;
$function$;

revoke all on function private.queue_admin_managed_order_status_notifications() from public,anon,authenticated;
drop trigger if exists purchase_orders_queue_customer_status_notifications on public.purchase_orders;
create trigger purchase_orders_queue_customer_status_notifications
after insert or update of status on public.purchase_orders
for each row execute function private.queue_admin_managed_order_status_notifications();
