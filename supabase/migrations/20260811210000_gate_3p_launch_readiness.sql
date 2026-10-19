-- Gate 3P: Owner-only launch readiness and a final paid-order test window.

insert into public.system_settings(key, category, value, description, status, updated_by)
select 'launch.final_test', 'SYSTEM', jsonb_build_object('started_at', null),
  'Jendela uji transaksi produksi terakhir sebelum launch.', 'ACTIVE', auth_user_id
from public.admin_profiles
where role='SUPER_ADMIN' and status='ACTIVE'
order by created_at limit 1
on conflict(key) do nothing;

create or replace function private.admin_launch_readiness_report_core()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_bot jsonb := '{}'::jsonb;
  v_onboarding jsonb := '{}'::jsonb;
  v_checkout jsonb := '{}'::jsonb;
  v_expiry jsonb := '{}'::jsonb;
  v_notifications jsonb := '{}'::jsonb;
  v_alerts jsonb := '{}'::jsonb;
  v_controls jsonb := '{}'::jsonb;
  v_runtime jsonb := '{}'::jsonb;
  v_test jsonb := '{}'::jsonb;
  v_bot_username text := '';
  v_channel_url text := '';
  v_discussion_url text := '';
  v_test_started_at timestamptz;
  v_test_order record;
  v_bad_jobs integer := 0;
  v_checks jsonb;
  v_ready_count integer;
  v_required_count integer;
  v_preflight_ready boolean;
  v_final_test_passed boolean := false;
begin
  if (select auth.uid()) is null or not private.is_active_admin() then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;

  select coalesce(value,'{}'::jsonb) into v_bot from public.system_settings where key='telegram.bot_connection';
  select coalesce(value,'{}'::jsonb) into v_onboarding from public.system_settings where key='bot.onboarding';
  select coalesce(value,'{}'::jsonb) into v_checkout from public.system_settings where key='bot.checkout';
  select coalesce(value,'{}'::jsonb) into v_expiry from public.system_settings where key='bot.order_expiry';
  select coalesce(value,'{}'::jsonb) into v_notifications from public.system_settings where key='bot.admin_notifications';
  select coalesce(value,'{}'::jsonb) into v_alerts from public.system_settings where key='system.incident_alerts';
  select coalesce(value,'{}'::jsonb) into v_controls from public.system_settings where key='system.emergency_controls';
  select coalesce(value,'{}'::jsonb) into v_runtime from public.system_settings where key='worker.runtime';
  select coalesce(value,'{}'::jsonb) into v_test from public.system_settings where key='launch.final_test';

  v_bot_username := coalesce(v_bot->>'bot_username','');
  v_channel_url := coalesce(v_onboarding->>'channel_url','');
  v_discussion_url := coalesce(v_onboarding->>'discussion_url','');
  begin v_test_started_at := nullif(v_test->>'started_at','')::timestamptz; exception when others then v_test_started_at := null; end;

  select count(*) into v_bad_jobs
  from public.scheduled_jobs
  where status::text in ('DEAD','OUTCOME_UNKNOWN')
     or (status::text='PROCESSING' and coalesce(lease_expires_at,updated_at)<clock_timestamp());

  if v_test_started_at is not null then
    select order_number, paid_at, access_delivery_status::text as access_status
    into v_test_order
    from public.purchase_orders
    where created_at >= v_test_started_at
      and status='PAID'
      and access_delivery_status='SENT'
    order by paid_at desc nulls last
    limit 1;
    v_final_test_passed := v_test_order.order_number is not null;
  end if;

  v_checks := jsonb_build_array(
    jsonb_build_object('key','bot_production','label','Bot Produksi','ready',
      v_bot_username<>'' and lower(v_bot_username) not like '%staging%',
      'detail',case when v_bot_username='' then 'Bot belum terhubung.' when lower(v_bot_username) like '%staging%' then '@'||v_bot_username||' masih bot pengujian.' else '@'||v_bot_username||' siap dipakai.' end,
      'action','Hubungkan token bot produksi dari Pengaturan Bot.'),
    jsonb_build_object('key','channel_production','label','Channel Produksi','ready',
      v_channel_url<>'' and lower(v_channel_url) not like '%staging%',
      'detail',case when v_channel_url='' then 'Link Channel belum diisi.' when lower(v_channel_url) like '%staging%' then 'Channel masih memakai nama staging.' else 'Link Channel produksi siap.' end,
      'action','Ganti link Channel pada Onboarding Member.'),
    jsonb_build_object('key','discussion_production','label','Grup Produksi','ready',
      v_discussion_url<>'' and lower(v_discussion_url) not like '%staging%' and lower(v_discussion_url) not like '%stagging%',
      'detail',case when v_discussion_url='' then 'Link Grup belum diisi.' when lower(v_discussion_url) like '%staging%' or lower(v_discussion_url) like '%stagging%' then 'Grup masih memakai nama staging.' else 'Link Grup produksi siap.' end,
      'action','Ganti link Grup pada Onboarding Member.'),
    jsonb_build_object('key','content_ready','label','Konten & Keyword','ready',
      exists(select 1 from public.prompts where status='ACTIVE') and exists(select 1 from public.comment_automation_rules where status='ACTIVE'),
      'detail',format('%s prompt aktif · %s automasi keyword aktif.',(select count(*) from public.prompts where status='ACTIVE'),(select count(*) from public.comment_automation_rules where status='ACTIVE')),
      'action','Aktifkan minimal satu prompt dan satu automasi keyword.'),
    jsonb_build_object('key','checkout_ready','label','Checkout','ready',
      coalesce((v_checkout->>'enabled')::boolean,false) and coalesce((v_checkout->>'amount_idr')::bigint,0)>0,
      'detail',format('Status %s · harga Rp%s.',case when coalesce((v_checkout->>'enabled')::boolean,false) then 'aktif' else 'nonaktif' end,coalesce(v_checkout->>'amount_idr','0')),
      'action','Aktifkan checkout dan tetapkan harga jual.'),
    jsonb_build_object('key','payment_ready','label','Rekening Pembayaran','ready',
      nullif(trim(v_checkout->>'bank_name'),'') is not null and nullif(trim(v_checkout->>'account_number'),'') is not null and nullif(trim(v_checkout->>'account_name'),'') is not null,
      'detail','Bank, nomor rekening, dan nama pemilik wajib lengkap.',
      'action','Lengkapi rekening pada Tombol BELI.'),
    jsonb_build_object('key','access_ready','label','Akses Produk','ready',
      nullif(trim(v_checkout->>'access_button_url'),'') is not null,
      'detail',case when nullif(trim(v_checkout->>'access_button_url'),'') is null then 'Link akses produk belum diisi.' else 'Link akses produk sudah tersedia.' end,
      'action','Isi link akses yang dikirim setelah pembayaran lunas.'),
    jsonb_build_object('key','expiry_normal','label','Batas Pembayaran','ready',
      coalesce((v_expiry->>'enabled')::boolean,false) and coalesce((v_expiry->>'expire_after_seconds')::integer,0)>=3600,
      'detail',format('Batas saat ini %s menit.',coalesce((v_expiry->>'expire_after_seconds')::integer,0)/60),
      'action','Kembalikan batas uji menjadi minimal 1 jam; rekomendasi 24 jam.'),
    jsonb_build_object('key','admin_notifications','label','Notifikasi Admin','ready',
      coalesce((v_notifications->>'enabled')::boolean,false) and nullif(v_notifications->>'recipient_user_id','') is not null,
      'detail',case when coalesce((v_notifications->>'enabled')::boolean,false) then 'Notifikasi transaksi aktif.' else 'Notifikasi transaksi masih OFF.' end,
      'action','Pilih akun Telegram Admin dan aktifkan Gate 3H.'),
    jsonb_build_object('key','incident_alerts','label','Alarm Gangguan','ready',
      coalesce((v_alerts->>'enabled')::boolean,false) and nullif(v_alerts->>'recipient_user_id','') is not null,
      'detail',case when coalesce((v_alerts->>'enabled')::boolean,false) then 'Alarm gangguan siaga.' else 'Alarm gangguan masih OFF.' end,
      'action','Pilih penerima dan aktifkan Gate 3N.'),
    jsonb_build_object('key','system_healthy','label','Mesin Sistem','ready',
      v_bad_jobs=0
      and exists(select 1 from cron.job where jobname='prompt-viral-staging-job-worker' and active)
      and exists(select 1 from storage.buckets where id='payment-proofs' and public=false)
      and coalesce((v_controls->>'channel_posting_enabled')::boolean,true)
      and coalesce((v_controls->>'free_claim_enabled')::boolean,true)
      and coalesce((v_controls->>'checkout_enabled')::boolean,true)
      and coalesce((v_controls->>'follow_up_enabled')::boolean,true)
      and coalesce((v_controls->>'broadcast_enabled')::boolean,true),
      'detail',format('%s job bermasalah · seluruh rem darurat harus berjalan.',v_bad_jobs),
      'action','Selesaikan gangguan dan hidupkan kembali alur yang dijeda.'),
    jsonb_build_object('key','final_transaction','label','Transaksi Final','ready',v_final_test_passed,
      'detail',case when v_final_test_passed then format('%s lunas dan akses terkirim.',v_test_order.order_number) when v_test_started_at is null then 'Uji final belum dimulai.' else 'Menunggu order baru: BELI → lunas → akses terkirim.' end,
      'action','Mulai uji final, lalu lakukan satu transaksi penuh dari akun pembeli.')
  );

  select count(*) filter(where (item->>'ready')::boolean), count(*)
  into v_ready_count, v_required_count
  from jsonb_array_elements(v_checks) item;

  select bool_and((item->>'ready')::boolean)
  into v_preflight_ready
  from jsonb_array_elements(v_checks) item
  where item->>'key' <> 'final_transaction';

  return jsonb_build_object(
    'status', case when v_preflight_ready and v_final_test_passed then 'READY_TO_LAUNCH' when v_preflight_ready then 'READY_FOR_TEST' else 'BLOCKED' end,
    'ready_count',v_ready_count,
    'required_count',v_required_count,
    'preflight_ready',v_preflight_ready,
    'final_test_started_at',v_test_started_at,
    'final_test_passed',v_final_test_passed,
    'checks',v_checks,
    'generated_at',clock_timestamp()
  );
end
$function$;

create or replace function private.admin_begin_launch_test_core()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor uuid := (select auth.uid()); v_report jsonb; v_started_at timestamptz := clock_timestamp();
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  v_report := private.admin_launch_readiness_report_core();
  if not coalesce((v_report->>'preflight_ready')::boolean,false) then raise exception 'LAUNCH_PREFLIGHT_NOT_READY'; end if;
  update public.system_settings set value=jsonb_build_object('started_at',v_started_at),updated_by=v_actor,updated_at=clock_timestamp() where key='launch.final_test';
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,summary)
  values('ADMIN',v_actor,'LAUNCH_FINAL_TEST_STARTED','SYSTEM_SETTING',jsonb_build_object('started_at',v_started_at));
  return private.admin_launch_readiness_report_core();
end
$function$;

create or replace function public.admin_launch_readiness_report()
returns jsonb language sql stable security invoker set search_path='' as $function$
  select private.admin_launch_readiness_report_core();
$function$;

create or replace function public.admin_begin_launch_test()
returns jsonb language sql volatile security invoker set search_path='' as $function$
  select private.admin_begin_launch_test_core();
$function$;

revoke all on function public.admin_launch_readiness_report() from public,anon;
grant execute on function public.admin_launch_readiness_report() to authenticated;
revoke all on function public.admin_begin_launch_test() from public,anon;
grant execute on function public.admin_begin_launch_test() to authenticated;
revoke all on function private.admin_launch_readiness_report_core() from public,anon;
grant execute on function private.admin_launch_readiness_report_core() to authenticated;
revoke all on function private.admin_begin_launch_test_core() from public,anon;
grant execute on function private.admin_begin_launch_test_core() to authenticated;
