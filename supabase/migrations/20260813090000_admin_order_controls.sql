alter table public.purchase_orders
  add column if not exists is_test boolean not null default false;

create or replace function public.admin_create_pending_order(
  p_user_id uuid,
  p_product_label text,
  p_amount_idr bigint
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_chat_id bigint;
  v_order public.purchase_orders;
begin
  if v_actor is null or not private.can_manage_payments() then raise exception 'PAYMENT_ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_product_label)) not between 3 and 160 then raise exception 'INVALID_PRODUCT_LABEL'; end if;
  if p_amount_idr < 0 then raise exception 'INVALID_ORDER_AMOUNT'; end if;
  select private_chat_id into v_chat_id from public.users
  where id = p_user_id and contact_status = 'CONTACTABLE';
  if v_chat_id is null then raise exception 'USER_NOT_CONTACTABLE'; end if;
  if exists (select 1 from public.purchase_orders where user_id = p_user_id and status in ('PENDING_PAYMENT','PENDING_VERIFICATION')) then
    raise exception 'USER_ALREADY_HAS_PENDING_ORDER';
  end if;
  insert into public.purchase_orders(user_id,product_label,amount_idr,private_chat_id,status,source,created_by,is_test)
  values (p_user_id,trim(p_product_label),p_amount_idr,v_chat_id,'PENDING_PAYMENT','ADMIN',v_actor,true)
  returning * into v_order;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'TEST_ORDER_CREATED','PURCHASE_ORDER',v_order.id,
    jsonb_build_object('order_number',v_order.order_number,'amount_idr',v_order.amount_idr,'is_test',true));
  return v_order;
end;
$function$;

revoke all on function public.admin_create_pending_order(uuid,text,bigint) from public, anon;
grant execute on function public.admin_create_pending_order(uuid,text,bigint) to authenticated;

create or replace function public.admin_set_purchase_order_status(
  p_order_id uuid,
  p_status text
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.purchase_orders;
  v_old_status text;
  v_enrollment_ids uuid[] := '{}';
begin
  if v_actor is null or not private.can_manage_payments() then
    raise exception 'PAYMENT_ADMIN_ACCESS_REQUIRED';
  end if;
  if p_status not in ('PENDING_PAYMENT', 'PAID', 'CANCELLED') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  select * into v_order
  from public.purchase_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_old_status := v_order.status;
  if v_order.status = p_status then return v_order; end if;
  if v_order.access_delivery_status in ('SENDING', 'OUTCOME_UNKNOWN') then
    raise exception 'ORDER_DELIVERY_REQUIRES_REVIEW';
  end if;
  if v_order.access_delivery_status = 'SENT' and p_status <> 'PAID' then
    raise exception 'ORDER_ACCESS_ALREADY_SENT_DELETE_TEST_ORDER_INSTEAD';
  end if;
  if p_status = 'PENDING_PAYMENT' and exists (
    select 1 from public.purchase_orders other
    where other.user_id = v_order.user_id
      and other.id <> v_order.id
      and other.status in ('PENDING_PAYMENT', 'PENDING_VERIFICATION')
  ) then
    raise exception 'USER_ALREADY_HAS_ACTIVE_ORDER';
  end if;

  if p_status in ('PENDING_PAYMENT', 'CANCELLED') then
    update public.payment_proofs
    set status = 'SUPERSEDED', reviewed_at = coalesce(reviewed_at, clock_timestamp()), reviewed_by = coalesce(reviewed_by, v_actor),
        review_notice_status = case when review_notice_status in ('QUEUED','FAILED') then 'NOT_READY' else review_notice_status end
    where order_id = v_order.id and status = 'PENDING_REVIEW';
  elsif p_status = 'PAID' then
    update public.payment_proofs
    set status = 'APPROVED', reviewed_at = coalesce(reviewed_at, clock_timestamp()), reviewed_by = coalesce(reviewed_by, v_actor),
        rejection_reason = null, review_notice_status = 'NOT_READY'
    where id = v_order.latest_payment_proof_id and status = 'PENDING_REVIEW';
  end if;

  if p_status = 'PENDING_PAYMENT' then
    select coalesce(array_agg(id), '{}') into v_enrollment_ids
    from public.follow_up_enrollments
    where source_type = 'PURCHASE_ORDER' and source_id = v_order.id;

    delete from public.scheduled_jobs
    where (entity_type = 'FOLLOW_UP_ENROLLMENT' and entity_id = any(v_enrollment_ids))
       or (entity_type = 'PURCHASE_ORDER' and entity_id = v_order.id and job_type = 'PURCHASE_ACCESS_SEND');
    delete from public.follow_up_enrollments
    where source_type = 'PURCHASE_ORDER' and source_id = v_order.id;

    update public.purchase_orders
    set status = 'PENDING_PAYMENT', payment_reference = null, paid_at = null, cancelled_at = null,
        latest_payment_proof_id = null,
        access_delivery_status = case when access_delivery_status = 'SENT' then access_delivery_status else 'NOT_READY' end,
        access_sent_at = case when access_delivery_status = 'SENT' then access_sent_at else null end,
        access_message_id = case when access_delivery_status = 'SENT' then access_message_id else null end,
        access_failure_code = null
    where id = v_order.id
    returning * into v_order;
  elsif p_status = 'CANCELLED' then
    update public.scheduled_jobs
    set status = 'CANCELLED', completed_at = clock_timestamp(),
        last_error_code = 'ORDER_CANCELLED_MANUALLY', last_error_message = 'Order dibatalkan dari web admin.'
    where entity_type = 'PURCHASE_ORDER' and entity_id = v_order.id
      and status in ('QUEUED','RETRY');

    update public.purchase_orders
    set status = 'CANCELLED', payment_reference = null, paid_at = null,
        cancelled_at = clock_timestamp(), latest_payment_proof_id = null,
        access_delivery_status = case when access_delivery_status = 'SENT' then access_delivery_status else 'NOT_READY' end,
        access_failure_code = null
    where id = v_order.id
    returning * into v_order;
  else
    delete from public.scheduled_jobs
    where entity_type = 'PURCHASE_ORDER' and entity_id = v_order.id
      and job_type = 'PURCHASE_ACCESS_SEND'
      and status <> 'SUCCEEDED';

    update public.purchase_orders
    set status = 'PAID', paid_at = coalesce(paid_at, clock_timestamp()),
        payment_reference = coalesce(payment_reference, 'MANUAL-ADMIN'),
        cancelled_at = null, expired_at = null,
        access_delivery_status = case when access_delivery_status = 'SENT' then access_delivery_status else 'NOT_READY' end,
        access_failure_code = null
    where id = v_order.id
    returning * into v_order;
  end if;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'ORDER_STATUS_CHANGED', 'PURCHASE_ORDER', v_order.id,
    jsonb_build_object('order_number', v_order.order_number, 'from_status', v_old_status, 'to_status', p_status));
  return v_order;
end;
$function$;

revoke all on function public.admin_set_purchase_order_status(uuid,text) from public, anon;
grant execute on function public.admin_set_purchase_order_status(uuid,text) to authenticated;

create or replace function public.admin_delete_purchase_order(
  p_order_id uuid,
  p_actor_id uuid,
  p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.purchase_orders;
  v_proof_ids uuid[] := '{}';
  v_enrollment_ids uuid[] := '{}';
  v_notification_ids uuid[] := '{}';
  v_storage_paths jsonb := '[]'::jsonb;
begin
  if p_actor_id is null or not exists (
    select 1 from public.admin_profiles
    where auth_user_id = p_actor_id and role = 'SUPER_ADMIN' and status = 'ACTIVE'
  ) then raise exception 'OWNER_ACCESS_REQUIRED'; end if;

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not v_order.is_test then raise exception 'ONLY_TEST_ORDERS_CAN_BE_DELETED'; end if;
  if trim(coalesce(p_confirmation, '')) <> v_order.order_number then
    raise exception 'ORDER_NUMBER_CONFIRMATION_REQUIRED';
  end if;

  select coalesce(array_agg(id), '{}'), coalesce(jsonb_agg(storage_path order by revision), '[]'::jsonb)
  into v_proof_ids, v_storage_paths
  from public.payment_proofs where order_id = v_order.id;

  select coalesce(array_agg(id), '{}') into v_enrollment_ids
  from public.follow_up_enrollments
  where source_type = 'PURCHASE_ORDER' and source_id = v_order.id;

  select coalesce(array_agg(id), '{}') into v_notification_ids
  from public.admin_notification_deliveries
  where (entity_type = 'PURCHASE_ORDER' and entity_id = v_order.id)
     or (entity_type = 'PAYMENT_PROOF' and entity_id = any(v_proof_ids));

  delete from public.scheduled_jobs
  where (entity_type = 'PURCHASE_ORDER' and entity_id = v_order.id)
     or (entity_type = 'PAYMENT_PROOF' and entity_id = any(v_proof_ids))
     or (entity_type = 'FOLLOW_UP_ENROLLMENT' and entity_id = any(v_enrollment_ids))
     or (entity_type = 'ADMIN_NOTIFICATION' and entity_id = any(v_notification_ids));
  delete from public.admin_notification_deliveries where id = any(v_notification_ids);
  update public.purchase_orders set latest_payment_proof_id = null where id = v_order.id;
  delete from public.payment_proofs where order_id = v_order.id;
  delete from public.follow_up_enrollments where source_type = 'PURCHASE_ORDER' and source_id = v_order.id;
  delete from public.purchase_orders where id = v_order.id;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', p_actor_id, 'ORDER_DELETED', 'PURCHASE_ORDER', v_order.id,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status, 'amount_idr', v_order.amount_idr));

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'storage_paths', v_storage_paths);
end;
$function$;

revoke all on function public.admin_delete_purchase_order(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_delete_purchase_order(uuid,uuid,text) to service_role;
