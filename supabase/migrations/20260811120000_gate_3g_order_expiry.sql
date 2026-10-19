alter table public.purchase_orders
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists expiry_revision integer not null default 0 check (expiry_revision >= 0),
  add column if not exists expiry_notice_status text not null default 'NOT_READY'
    check (expiry_notice_status in ('NOT_READY','QUEUED','SENDING','SENT','FAILED','BLOCKED','OUTCOME_UNKNOWN')),
  add column if not exists expiry_notice_message_id bigint,
  add column if not exists expiry_failure_code text;

alter table public.follow_up_enrollments
  drop constraint if exists follow_up_enrollments_current_step_check;
alter table public.follow_up_enrollments
  add constraint follow_up_enrollments_current_step_check check (current_step between 0 and 6);

create index if not exists purchase_orders_expiry_due_idx
  on public.purchase_orders(expires_at)
  where status = 'PENDING_PAYMENT' and expires_at is not null;

insert into public.system_settings (key, category, value, description, status, updated_by)
select
  'bot.order_expiry',
  'TELEGRAM',
  jsonb_build_object(
    'enabled', true,
    'expire_after_seconds', 86400,
    'expiry_notice', '⏰ Waktu pembayaran untuk pesanan ini sudah habis. Pesanan ditutup otomatis. Tekan tombol di bawah jika masih ingin membeli.'
  ),
  'Batas waktu pembayaran pesanan dan pesan kedaluwarsa.',
  'ACTIVE',
  auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (key) do nothing;

create or replace function public.admin_update_order_expiry_settings(
  p_enabled boolean,
  p_expire_after_seconds integer,
  p_expiry_notice text
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
  if p_expire_after_seconds is null or p_expire_after_seconds not between 60 and 2592000 then
    raise exception 'INVALID_ORDER_EXPIRY_DURATION';
  end if;
  if char_length(trim(coalesce(p_expiry_notice, ''))) not between 3 and 4000 then
    raise exception 'INVALID_ORDER_EXPIRY_NOTICE';
  end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'expire_after_seconds', p_expire_after_seconds,
    'expiry_notice', trim(p_expiry_notice)
  );

  insert into public.system_settings (key, category, value, description, status, updated_by)
  values (
    'bot.order_expiry', 'TELEGRAM', v_value,
    'Batas waktu pembayaran pesanan dan pesan kedaluwarsa.', 'ACTIVE', v_actor
  )
  on conflict (key) do update set
    value = excluded.value, status = 'ACTIVE', updated_by = v_actor, updated_at = clock_timestamp();

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values (
    'ADMIN', v_actor, 'ORDER_EXPIRY_SETTINGS_UPDATED', 'SYSTEM_SETTING', null,
    jsonb_build_object('enabled', p_enabled, 'expire_after_seconds', p_expire_after_seconds)
  );
  return v_value;
end;
$function$;

revoke all on function public.admin_update_order_expiry_settings(boolean,integer,text) from public, anon;
grant execute on function public.admin_update_order_expiry_settings(boolean,integer,text) to authenticated;

create or replace function private.prepare_order_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_setting jsonb;
  v_enabled boolean := true;
  v_seconds integer := 86400;
begin
  if new.status = 'PENDING_PAYMENT'
    and (tg_op = 'INSERT' or old.status is distinct from 'PENDING_PAYMENT') then
    select value into v_setting from public.system_settings where key = 'bot.order_expiry';
    if v_setting is not null then
      v_enabled := coalesce((v_setting ->> 'enabled')::boolean, true);
      v_seconds := greatest(60, least(2592000, coalesce((v_setting ->> 'expire_after_seconds')::integer, 86400)));
    end if;

    new.expiry_revision := coalesce(case when tg_op = 'UPDATE' then old.expiry_revision else 0 end, 0) + 1;
    new.expires_at := case when v_enabled then clock_timestamp() + make_interval(secs => v_seconds) else null end;
    new.expired_at := null;
    new.expiry_notice_status := case when v_enabled then 'QUEUED' else 'NOT_READY' end;
    new.expiry_notice_message_id := null;
    new.expiry_failure_code := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.prepare_order_expiry() from public, anon, authenticated;
drop trigger if exists purchase_orders_prepare_expiry on public.purchase_orders;
create trigger purchase_orders_prepare_expiry
before insert or update of status on public.purchase_orders
for each row execute function private.prepare_order_expiry();

create or replace function private.sync_order_expiry_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'PENDING_PAYMENT'
    and (tg_op = 'INSERT' or old.status is distinct from 'PENDING_PAYMENT')
    and new.expires_at is not null then
    insert into public.scheduled_jobs(
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'PURCHASE_ORDER_EXPIRE', 'PURCHASE_ORDER', new.id,
      jsonb_build_object('order_id', new.id, 'expiry_revision', new.expiry_revision),
      'purchase-order-expire:' || new.id::text || ':cycle:' || new.expiry_revision::text,
      'QUEUED', 90, new.expires_at, 4, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'PENDING_PAYMENT' and new.status <> 'PENDING_PAYMENT' then
    update public.scheduled_jobs
    set status = 'CANCELLED', completed_at = clock_timestamp(),
      last_error_code = 'ORDER_' || new.status,
      last_error_message = 'Order expiry stopped because order left pending payment.'
    where job_type = 'PURCHASE_ORDER_EXPIRE'
      and entity_id = new.id
      and status in ('QUEUED','RETRY');
  end if;
  return new;
end;
$function$;

revoke all on function private.sync_order_expiry_job() from public, anon, authenticated;
drop trigger if exists purchase_orders_sync_expiry_job on public.purchase_orders;
create trigger purchase_orders_sync_expiry_job
after insert or update of status on public.purchase_orders
for each row execute function private.sync_order_expiry_job();
