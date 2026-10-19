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
  if v_actor is null or not private.is_active_admin() then
    raise exception 'ADMIN_ACCESS_REQUIRED';
  end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception 'INVALID_REPORT_PERIOD';
  end if;

  select jsonb_build_object(
    'total_orders', count(*)::integer,
    'pending_payment', count(*) filter (where status = 'PENDING_PAYMENT')::integer,
    'pending_verification', count(*) filter (where status = 'PENDING_VERIFICATION')::integer,
    'paid_orders', count(*) filter (where status = 'PAID')::integer,
    'cancelled_orders', count(*) filter (where status = 'CANCELLED')::integer,
    'expired_orders', count(*) filter (where status = 'EXPIRED')::integer,
    'revenue_idr', coalesce(sum(amount_idr) filter (where status = 'PAID'), 0)::bigint,
    'conversion_rate', case
      when count(*) = 0 then 0
      else round((count(*) filter (where status = 'PAID')::numeric / count(*)::numeric) * 100, 1)
    end
  ) into v_summary
  from public.purchase_orders
  where (p_from is null or created_at >= p_from)
    and (p_to is null or created_at < p_to);

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_orders
  from (
    select
      o.created_at,
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'telegram_user_id', u.telegram_user_id,
        'username', u.username,
        'first_name', u.first_name,
        'product_label', o.product_label,
        'amount_idr', o.amount_idr,
        'status', o.status,
        'payment_reference', o.payment_reference,
        'paid_at', o.paid_at,
        'access_delivery_status', o.access_delivery_status,
        'created_at', o.created_at
      ) as row_data
    from public.purchase_orders o
    join public.users u on u.id = o.user_id
    where (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
    order by o.created_at desc
    limit 5000
  ) report_rows;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'summary', v_summary,
    'orders', v_orders,
    'generated_at', clock_timestamp()
  );
end;
$function$;

revoke all on function public.admin_sales_report(timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_sales_report(timestamptz,timestamptz) to authenticated;
