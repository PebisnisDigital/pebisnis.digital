-- Fix launch report when no final test order exists yet.

do $do$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='admin_launch_readiness_report_core';

  v_definition := replace(v_definition, 'v_test_order record;', 'v_test_order_number text;');
  v_definition := replace(v_definition,
    'select order_number, paid_at, access_delivery_status::text as access_status',
    'select order_number');
  v_definition := replace(v_definition, 'into v_test_order', 'into v_test_order_number');
  v_definition := replace(v_definition,
    'v_final_test_passed := v_test_order.order_number is not null;',
    'v_final_test_passed := v_test_order_number is not null;');
  v_definition := replace(v_definition,
    'format(''%s lunas dan akses terkirim.'',v_test_order.order_number)',
    'format(''%s lunas dan akses terkirim.'',v_test_order_number)');

  execute v_definition;
end
$do$;
