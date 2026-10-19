-- Gate 3I: Owner + payment-admin separation.
-- Existing admin functions keep using is_active_admin(), which is intentionally
-- narrowed to SUPER_ADMIN. Payment-only surfaces use can_manage_payments().

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_profiles p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'ACTIVE'
      and p.role = 'SUPER_ADMIN'
  );
$function$;

create or replace function private.can_manage_payments()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.admin_profiles p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'ACTIVE'
      and p.role in ('OPERATOR', 'SUPER_ADMIN')
  );
$function$;

revoke all on function private.can_manage_payments() from public, anon, authenticated;

drop policy if exists purchase_orders_admin_select on public.purchase_orders;
create policy purchase_orders_payment_admin_select on public.purchase_orders
  for select to authenticated using ((select private.can_manage_payments()));

drop policy if exists payment_proofs_admin_select on public.payment_proofs;
create policy payment_proofs_payment_admin_select on public.payment_proofs
  for select to authenticated using ((select private.can_manage_payments()));

drop policy if exists users_active_admin_read on public.users;
create policy users_payment_admin_read on public.users
  for select to authenticated using ((select private.can_manage_payments()));

drop policy if exists payment_proofs_storage_admin_read on storage.objects;
create policy payment_proofs_storage_payment_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and (select private.can_manage_payments()));

create or replace function public.admin_sales_report(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_summary jsonb;
  v_orders jsonb;
begin
  if v_actor is null or not private.can_manage_payments() then raise exception 'PAYMENT_ADMIN_ACCESS_REQUIRED'; end if;
  if p_from is not null and p_to is not null and p_from >= p_to then raise exception 'INVALID_REPORT_PERIOD'; end if;

  select jsonb_build_object(
    'total_orders', count(*)::integer,
    'pending_payment', count(*) filter (where status = 'PENDING_PAYMENT')::integer,
    'pending_verification', count(*) filter (where status = 'PENDING_VERIFICATION')::integer,
    'paid_orders', count(*) filter (where status = 'PAID')::integer,
    'cancelled_orders', count(*) filter (where status = 'CANCELLED')::integer,
    'expired_orders', count(*) filter (where status = 'EXPIRED')::integer,
    'revenue_idr', coalesce(sum(amount_idr) filter (where status = 'PAID'), 0)::bigint,
    'conversion_rate', case when count(*) = 0 then 0 else round((count(*) filter (where status = 'PAID')::numeric / count(*)::numeric) * 100, 1) end
  ) into v_summary
  from public.purchase_orders
  where (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to);

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_orders
  from (
    select o.created_at, jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'telegram_user_id', u.telegram_user_id,
      'username', u.username, 'first_name', u.first_name, 'product_label', o.product_label,
      'amount_idr', o.amount_idr, 'status', o.status, 'payment_reference', o.payment_reference,
      'paid_at', o.paid_at, 'access_delivery_status', o.access_delivery_status, 'created_at', o.created_at
    ) row_data
    from public.purchase_orders o join public.users u on u.id = o.user_id
    where (p_from is null or o.created_at >= p_from) and (p_to is null or o.created_at < p_to)
    order by o.created_at desc limit 5000
  ) report_rows;

  return jsonb_build_object('from', p_from, 'to', p_to, 'summary', v_summary, 'orders', v_orders, 'generated_at', clock_timestamp());
end;
$function$;

create or replace function public.admin_mark_order_paid(
  p_order_id uuid,
  p_payment_reference text default null
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.purchase_orders;
begin
  if v_actor is null or not private.can_manage_payments() then raise exception 'PAYMENT_ADMIN_ACCESS_REQUIRED'; end if;
  update public.purchase_orders
  set status = 'PAID', paid_at = clock_timestamp(), payment_reference = nullif(trim(coalesce(p_payment_reference,'')), '')
  where id = p_order_id and status = 'PENDING_PAYMENT'
  returning * into v_order;
  if not found then raise exception 'PENDING_ORDER_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'ORDER_MARKED_PAID','PURCHASE_ORDER',v_order.id,
    jsonb_build_object('order_number',v_order.order_number,'payment_reference',v_order.payment_reference));
  return v_order;
end;
$function$;

-- Only the authorization guard changes here; the payment state machine remains
-- identical to Gate 3E.
create or replace function public.admin_review_payment_proof(
  p_order_id uuid,
  p_proof_id uuid,
  p_decision text,
  p_rejection_reason text default null
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.purchase_orders;
  v_proof public.payment_proofs;
  v_reason text := trim(coalesce(p_rejection_reason, ''));
begin
  if v_actor is null or not private.can_manage_payments() then raise exception 'PAYMENT_ADMIN_ACCESS_REQUIRED'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'INVALID_PAYMENT_REVIEW_DECISION'; end if;
  if p_decision = 'REJECT' and char_length(v_reason) not between 3 and 500 then raise exception 'PAYMENT_REJECTION_REASON_REQUIRED'; end if;

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or v_order.status <> 'PENDING_VERIFICATION' or v_order.latest_payment_proof_id <> p_proof_id then raise exception 'PAYMENT_PROOF_NOT_PENDING_REVIEW'; end if;
  select * into v_proof from public.payment_proofs where id = p_proof_id and order_id = p_order_id and status = 'PENDING_REVIEW' for update;
  if not found then raise exception 'PAYMENT_PROOF_NOT_PENDING_REVIEW'; end if;

  if p_decision = 'APPROVE' then
    update public.payment_proofs set status='APPROVED', reviewed_at=clock_timestamp(), reviewed_by=v_actor,
      rejection_reason=null, review_notice_status='NOT_READY' where id=v_proof.id;
    update public.purchase_orders set status='PAID', paid_at=clock_timestamp(), payment_reference='BUKTI-' || v_proof.revision::text
      where id=v_order.id returning * into v_order;
  else
    update public.payment_proofs set status='REJECTED', reviewed_at=clock_timestamp(), reviewed_by=v_actor,
      rejection_reason=v_reason, review_notice_status='QUEUED', review_notice_failure_code=null where id=v_proof.id;
    update public.purchase_orders set status='PENDING_PAYMENT' where id=v_order.id returning * into v_order;
    insert into public.scheduled_jobs(job_type,entity_type,entity_id,payload,idempotency_key,status,priority,run_at,max_attempts,correlation_id)
    values ('PAYMENT_PROOF_REJECT_NOTIFY','PAYMENT_PROOF',v_proof.id,jsonb_build_object('proof_id',v_proof.id),
      'payment-proof-reject:' || v_proof.id::text,'QUEUED',100,clock_timestamp(),4,gen_random_uuid())
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'PAYMENT_PROOF_' || p_decision,'PURCHASE_ORDER',v_order.id,
    jsonb_build_object('proof_id',v_proof.id,'reason',nullif(v_reason,'')));
  return v_order;
end;
$function$;

create or replace function public.admin_list_profiles()
returns table(auth_user_id uuid, email text, display_name text, role public.admin_role, status public.admin_status, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  return query
  select p.auth_user_id, u.email::text, p.display_name, p.role, p.status, p.created_at
  from public.admin_profiles p join auth.users u on u.id=p.auth_user_id
  order by case when p.role='SUPER_ADMIN' then 0 else 1 end, p.created_at;
end;
$function$;

create or replace function public.admin_set_payment_admin_status(p_auth_user_id uuid, p_status text)
returns public.admin_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_profile public.admin_profiles;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'INVALID_ADMIN_STATUS'; end if;
  update public.admin_profiles set status=p_status::public.admin_status, updated_at=clock_timestamp()
  where auth_user_id=p_auth_user_id and role='OPERATOR'
  returning * into v_profile;
  if not found then raise exception 'PAYMENT_ADMIN_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,summary)
  values ('ADMIN',v_actor,'PAYMENT_ADMIN_STATUS_UPDATED','ADMIN_PROFILE',p_auth_user_id,
    jsonb_build_object('status',p_status));
  return v_profile;
end;
$function$;

revoke all on function public.admin_list_profiles() from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;
revoke all on function public.admin_set_payment_admin_status(uuid,text) from public, anon;
grant execute on function public.admin_set_payment_admin_status(uuid,text) to authenticated;
