-- Keep bot checkout inserts from failing when admin notifications are enabled.

create or replace function private.queue_admin_notification(
  p_event_key text,
  p_notification_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_run_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_setting jsonb;
  v_delivery_id uuid;
  v_workspace_id uuid;
begin
  select value
  into v_setting
  from public.system_settings
  where key = 'bot.admin_notifications';

  if not coalesce((v_setting ->> 'enabled')::boolean, false) then return; end if;
  if nullif(v_setting ->> 'recipient_user_id', '') is null then return; end if;

  case upper(coalesce(p_entity_type, ''))
    when 'PURCHASE_ORDER' then
      select workspace_id into v_workspace_id
      from public.purchase_orders
      where id = p_entity_id;
    when 'PAYMENT_PROOF' then
      select workspace_id into v_workspace_id
      from public.payment_proofs
      where id = p_entity_id;
    else
      v_workspace_id := private.actor_workspace_id_core();
  end case;

  if v_workspace_id is null then
    raise exception 'ADMIN_NOTIFICATION_WORKSPACE_REQUIRED';
  end if;

  insert into public.admin_notification_deliveries(
    event_key, notification_type, entity_type, entity_id, workspace_id
  ) values (
    p_event_key, p_notification_type, p_entity_type, p_entity_id, v_workspace_id
  )
  on conflict (event_key) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    insert into public.scheduled_jobs(
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id, workspace_id
    ) values (
      'ADMIN_TELEGRAM_NOTIFY', 'ADMIN_NOTIFICATION', v_delivery_id,
      jsonb_build_object('delivery_id', v_delivery_id, 'workspace_id', v_workspace_id),
      'admin-notification:' || p_event_key,
      'QUEUED', 70, p_run_at, 4, gen_random_uuid(), v_workspace_id
    )
    on conflict (idempotency_key) do nothing;
  end if;
end;
$function$;

revoke all on function private.queue_admin_notification(text,text,text,uuid,timestamptz)
  from public, anon, authenticated;

-- A failed worker attempt can leave the delivery in SENDING before Telegram was
-- contacted. Allow the leased job retry to reclaim that stale reservation.
create or replace function public.reserve_bot_response(
  p_telegram_update_id uuid,
  p_user_id uuid,
  p_response_key text
)
returns table(delivery_id uuid, should_send boolean, current_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery public.bot_response_deliveries;
begin
  if p_response_key is null or length(trim(p_response_key)) < 1 then
    raise exception 'response key required';
  end if;

  insert into public.bot_response_deliveries (
    telegram_update_id, user_id, response_key, status
  ) values (
    p_telegram_update_id, p_user_id, left(trim(p_response_key), 120), 'SENDING'
  )
  on conflict (telegram_update_id, response_key) do nothing
  returning * into v_delivery;

  if found then
    return query select v_delivery.id, true, v_delivery.status::text;
    return;
  end if;

  select *
  into v_delivery
  from public.bot_response_deliveries
  where telegram_update_id = p_telegram_update_id
    and response_key = left(trim(p_response_key), 120)
  for update;

  if v_delivery.status::text = 'FAILED'
     or (
       v_delivery.status::text = 'SENDING'
       and v_delivery.updated_at < clock_timestamp() - interval '5 seconds'
     ) then
    update public.bot_response_deliveries
    set status = 'SENDING',
        telegram_message_id = null,
        error_code = null,
        updated_at = clock_timestamp()
    where id = v_delivery.id
    returning * into v_delivery;

    return query select v_delivery.id, true, v_delivery.status::text;
    return;
  end if;

  return query select v_delivery.id, false, v_delivery.status::text;
end;
$function$;

revoke all on function public.reserve_bot_response(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.reserve_bot_response(uuid,uuid,text)
  to service_role;
