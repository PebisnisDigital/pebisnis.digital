create table if not exists public.admin_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  notification_type text not null check (notification_type in ('NEW_ORDER','PAYMENT_PROOF','PAYMENT_REVIEW_REMINDER','ORDER_EXPIRED')),
  entity_type text not null check (entity_type in ('PURCHASE_ORDER','PAYMENT_PROOF')),
  entity_id uuid not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','SKIPPED','FAILED','BLOCKED','OUTCOME_UNKNOWN')),
  telegram_message_id bigint,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);

alter table public.admin_notification_deliveries enable row level security;
revoke all on table public.admin_notification_deliveries from public, anon, authenticated;

create index if not exists admin_notification_deliveries_status_idx
  on public.admin_notification_deliveries(status, created_at);

insert into public.system_settings (key, category, value, description, status, updated_by)
select
  'bot.admin_notifications',
  'TELEGRAM',
  jsonb_build_object(
    'enabled', false,
    'recipient_user_id', null,
    'review_reminder_minutes', 15,
    'admin_url', 'https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/dashboard'
  ),
  'Notifikasi Telegram privat untuk order dan verifikasi pembayaran.',
  'ACTIVE',
  auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (key) do nothing;

create or replace function public.admin_update_notification_settings(
  p_enabled boolean,
  p_recipient_user_id uuid,
  p_review_reminder_minutes integer,
  p_admin_url text
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
  if p_recipient_user_id is null then raise exception 'ADMIN_NOTIFICATION_RECIPIENT_REQUIRED'; end if;
  if not exists (
    select 1 from public.users
    where id = p_recipient_user_id and private_chat_id is not null and contact_status = 'CONTACTABLE'
  ) then raise exception 'ADMIN_NOTIFICATION_RECIPIENT_NOT_CONTACTABLE'; end if;
  if p_review_reminder_minutes is null or p_review_reminder_minutes not between 1 and 1440 then
    raise exception 'INVALID_REVIEW_REMINDER_MINUTES';
  end if;
  if p_admin_url is null or p_admin_url !~ '^https://[^[:space:]]+$' or char_length(p_admin_url) > 500 then
    raise exception 'INVALID_ADMIN_URL';
  end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'recipient_user_id', p_recipient_user_id,
    'review_reminder_minutes', p_review_reminder_minutes,
    'admin_url', rtrim(trim(p_admin_url), '/')
  );

  insert into public.system_settings (key, category, value, description, status, updated_by)
  values (
    'bot.admin_notifications', 'TELEGRAM', v_value,
    'Notifikasi Telegram privat untuk order dan verifikasi pembayaran.', 'ACTIVE', v_actor
  )
  on conflict (key) do update set
    value = excluded.value, status = 'ACTIVE', updated_by = v_actor, updated_at = clock_timestamp();

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values (
    'ADMIN', v_actor, 'ADMIN_NOTIFICATION_SETTINGS_UPDATED', 'SYSTEM_SETTING', null,
    jsonb_build_object('enabled', p_enabled, 'recipient_user_id', p_recipient_user_id, 'review_reminder_minutes', p_review_reminder_minutes)
  );
  return v_value;
end;
$function$;

revoke all on function public.admin_update_notification_settings(boolean,uuid,integer,text) from public, anon;
grant execute on function public.admin_update_notification_settings(boolean,uuid,integer,text) to authenticated;

create or replace function private.queue_admin_notification(
  p_event_key text,
  p_notification_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_run_at timestamptz default clock_timestamp()
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_setting jsonb;
  v_delivery_id uuid;
begin
  select value into v_setting from public.system_settings where key = 'bot.admin_notifications';
  if not coalesce((v_setting ->> 'enabled')::boolean, false) then return; end if;
  if nullif(v_setting ->> 'recipient_user_id', '') is null then return; end if;

  insert into public.admin_notification_deliveries(event_key, notification_type, entity_type, entity_id)
  values (p_event_key, p_notification_type, p_entity_type, p_entity_id)
  on conflict (event_key) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    insert into public.scheduled_jobs(
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'ADMIN_TELEGRAM_NOTIFY', 'ADMIN_NOTIFICATION', v_delivery_id,
      jsonb_build_object('delivery_id', v_delivery_id),
      'admin-notification:' || p_event_key,
      'QUEUED', 70, p_run_at, 4, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  end if;
end;
$function$;

revoke all on function private.queue_admin_notification(text,text,text,uuid,timestamptz) from public, anon, authenticated;

create or replace function private.queue_order_admin_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.queue_admin_notification(
      'new-order:' || new.id::text, 'NEW_ORDER', 'PURCHASE_ORDER', new.id, clock_timestamp()
    );
  elsif old.status is distinct from new.status and new.status = 'EXPIRED' then
    perform private.queue_admin_notification(
      'order-expired:' || new.id::text || ':cycle:' || new.expiry_revision::text,
      'ORDER_EXPIRED', 'PURCHASE_ORDER', new.id, clock_timestamp()
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.queue_order_admin_notifications() from public, anon, authenticated;
drop trigger if exists purchase_orders_queue_admin_notifications on public.purchase_orders;
create trigger purchase_orders_queue_admin_notifications
after insert or update of status on public.purchase_orders
for each row execute function private.queue_order_admin_notifications();

create or replace function private.queue_proof_admin_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_setting jsonb;
  v_reminder_minutes integer := 15;
begin
  select value into v_setting from public.system_settings where key = 'bot.admin_notifications';
  if not coalesce((v_setting ->> 'enabled')::boolean, false) then return new; end if;
  v_reminder_minutes := greatest(1, least(1440, coalesce((v_setting ->> 'review_reminder_minutes')::integer, 15)));

  perform private.queue_admin_notification(
    'payment-proof:' || new.id::text, 'PAYMENT_PROOF', 'PAYMENT_PROOF', new.id, clock_timestamp()
  );
  perform private.queue_admin_notification(
    'payment-review-reminder:' || new.id::text, 'PAYMENT_REVIEW_REMINDER', 'PAYMENT_PROOF', new.id,
    clock_timestamp() + make_interval(mins => v_reminder_minutes)
  );
  return new;
end;
$function$;

revoke all on function private.queue_proof_admin_notifications() from public, anon, authenticated;
drop trigger if exists payment_proofs_queue_admin_notifications on public.payment_proofs;
create trigger payment_proofs_queue_admin_notifications
after insert on public.payment_proofs
for each row execute function private.queue_proof_admin_notifications();
