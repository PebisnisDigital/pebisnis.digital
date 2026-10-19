-- Gate 3L: owner-only, read-only system health monitoring.

create index if not exists scheduled_jobs_health_status_run_at_idx
  on public.scheduled_jobs (status, run_at, updated_at desc);

create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_runtime jsonb := '{}'::jsonb;
  v_worker_last_at timestamptz;
  v_worker_age_seconds integer;
  v_worker_status text := 'INCIDENT';
  v_worker_detail text := 'Worker belum pernah mencatat detak.';
  v_cron_active boolean := false;
  v_cron_last_at timestamptz;
  v_cron_last_status text;
  v_cron_status text := 'INCIDENT';
  v_cron_detail text := 'Jadwal worker tidak ditemukan.';
  v_bot_configured_at timestamptz;
  v_bot_success_at timestamptz;
  v_bot_status text := 'ATTENTION';
  v_bot_detail text := 'Belum ada bukti koneksi Telegram yang berhasil.';
  v_due integer := 0;
  v_retry integer := 0;
  v_processing integer := 0;
  v_stuck integer := 0;
  v_dead integer := 0;
  v_unknown integer := 0;
  v_succeeded integer := 0;
  v_queue_status text := 'HEALTHY';
  v_queue_detail text := 'Antrean bersih; tidak ada job macet atau gagal.';
  v_storage_ready boolean := false;
  v_storage_private boolean := false;
  v_storage_status text := 'INCIDENT';
  v_storage_detail text := 'Bucket bukti transfer belum siap.';
  v_overall text := 'HEALTHY';
  v_checks jsonb;
  v_failures jsonb;
begin
  if (select auth.uid()) is null or not private.is_active_admin() then
    raise exception 'OWNER_ACCESS_REQUIRED';
  end if;

  select coalesce(value, '{}'::jsonb)
    into v_runtime
  from public.system_settings
  where key = 'worker.runtime';

  begin
    v_worker_last_at := nullif(v_runtime->>'last_run_at', '')::timestamptz;
  exception when others then
    v_worker_last_at := null;
  end;

  if v_worker_last_at is not null then
    v_worker_age_seconds := greatest(0, extract(epoch from (clock_timestamp() - v_worker_last_at))::integer);
    if v_worker_age_seconds <= 90 and coalesce(v_runtime->>'error_code', '') = '' then
      v_worker_status := 'HEALTHY';
      v_worker_detail := 'Worker berdetak normal dan batch terakhir tidak mencatat error.';
    elsif v_worker_age_seconds <= 180 then
      v_worker_status := 'ATTENTION';
      v_worker_detail := 'Detak worker melambat atau batch terakhir perlu diperiksa.';
    else
      v_worker_status := 'INCIDENT';
      v_worker_detail := 'Worker tidak berdetak lebih dari 3 menit.';
    end if;
  end if;

  select coalesce(bool_or(active), false)
    into v_cron_active
  from cron.job
  where jobname = 'prompt-viral-staging-job-worker';

  select run.status, coalesce(run.end_time, run.start_time)
    into v_cron_last_status, v_cron_last_at
  from cron.job_run_details run
  where run.jobid = (
    select jobid from cron.job
    where jobname = 'prompt-viral-staging-job-worker'
    limit 1
  )
  order by run.start_time desc
  limit 1;

  if v_cron_active and v_cron_last_status = 'succeeded'
     and v_cron_last_at >= clock_timestamp() - interval '90 seconds' then
    v_cron_status := 'HEALTHY';
    v_cron_detail := 'Jadwal aktif dan pemanggilan terakhir berhasil.';
  elsif v_cron_active then
    v_cron_status := 'ATTENTION';
    v_cron_detail := 'Jadwal aktif, tetapi hasil terakhir perlu diperiksa.';
  end if;

  select
    max(created_at) filter (where action = 'TELEGRAM_WEBHOOK_CONFIGURED'),
    max(created_at) filter (where action in ('TELEGRAM_UPDATE_JOB_SUCCEEDED', 'TELEGRAM_MEMBER_DELIVERY_DELETE_PROVED'))
  into v_bot_configured_at, v_bot_success_at
  from public.audit_logs
  where action in ('TELEGRAM_WEBHOOK_CONFIGURED', 'TELEGRAM_UPDATE_JOB_SUCCEEDED', 'TELEGRAM_MEMBER_DELIVERY_DELETE_PROVED');

  if v_bot_configured_at is not null and v_bot_success_at is not null then
    v_bot_status := 'HEALTHY';
    v_bot_detail := 'Webhook pernah terhubung dan aktivitas Telegram terakhir berhasil.';
  elsif v_bot_configured_at is not null then
    v_bot_detail := 'Webhook sudah dikonfigurasi, tetapi belum ada aktivitas sukses yang tercatat.';
  end if;

  select
    count(*) filter (where status::text in ('QUEUED', 'RETRY') and run_at <= clock_timestamp()),
    count(*) filter (where status::text = 'RETRY'),
    count(*) filter (where status::text = 'PROCESSING'),
    count(*) filter (where status::text = 'PROCESSING' and coalesce(lease_expires_at, updated_at) < clock_timestamp()),
    count(*) filter (where status::text = 'DEAD'),
    count(*) filter (where status::text = 'OUTCOME_UNKNOWN'),
    count(*) filter (where status::text = 'SUCCEEDED')
  into v_due, v_retry, v_processing, v_stuck, v_dead, v_unknown, v_succeeded
  from public.scheduled_jobs;

  if v_dead > 0 or v_unknown > 0 or v_stuck > 0 then
    v_queue_status := 'INCIDENT';
    v_queue_detail := 'Ada job mati, hasil tidak pasti, atau proses yang kehilangan lease.';
  elsif v_due > 0 or v_retry > 0 then
    v_queue_status := 'ATTENTION';
    v_queue_detail := 'Ada job jatuh tempo atau sedang menunggu retry.';
  end if;

  select exists(select 1 from storage.buckets where id = 'payment-proofs'),
         exists(select 1 from storage.buckets where id = 'payment-proofs' and public = false)
    into v_storage_ready, v_storage_private;

  if v_storage_ready and v_storage_private then
    v_storage_status := 'HEALTHY';
    v_storage_detail := 'Ruang bukti transfer tersedia dan tetap privat.';
  elsif v_storage_ready then
    v_storage_status := 'INCIDENT';
    v_storage_detail := 'Bucket bukti transfer ada, tetapi tidak privat.';
  end if;

  if 'INCIDENT' = any(array[v_worker_status, v_cron_status, v_queue_status, v_storage_status]) then
    v_overall := 'INCIDENT';
  elsif 'ATTENTION' = any(array[v_worker_status, v_cron_status, v_bot_status, v_queue_status, v_storage_status]) then
    v_overall := 'ATTENTION';
  end if;

  v_checks := jsonb_build_array(
    jsonb_build_object('key', 'database', 'label', 'Database', 'status', 'HEALTHY',
      'detail', 'Database merespons pemeriksaan Owner.', 'last_seen_at', clock_timestamp()),
    jsonb_build_object('key', 'telegram', 'label', 'Bot Telegram', 'status', v_bot_status,
      'detail', v_bot_detail, 'last_seen_at', coalesce(v_bot_success_at, v_bot_configured_at)),
    jsonb_build_object('key', 'worker', 'label', 'Worker Otomatis', 'status', v_worker_status,
      'detail', v_worker_detail, 'last_seen_at', v_worker_last_at,
      'metric', jsonb_build_object('age_seconds', v_worker_age_seconds, 'last_succeeded', coalesce((v_runtime->>'succeeded')::integer, 0), 'last_failed', coalesce((v_runtime->>'failed')::integer, 0))),
    jsonb_build_object('key', 'scheduler', 'label', 'Jadwal Worker', 'status', v_cron_status,
      'detail', v_cron_detail, 'last_seen_at', v_cron_last_at,
      'metric', jsonb_build_object('active', v_cron_active, 'last_status', v_cron_last_status)),
    jsonb_build_object('key', 'queue', 'label', 'Antrean Pesan', 'status', v_queue_status,
      'detail', v_queue_detail, 'last_seen_at', clock_timestamp(),
      'metric', jsonb_build_object('due', v_due, 'retry', v_retry, 'processing', v_processing, 'stuck', v_stuck, 'dead', v_dead, 'outcome_unknown', v_unknown, 'succeeded', v_succeeded)),
    jsonb_build_object('key', 'storage', 'label', 'Bukti Transfer', 'status', v_storage_status,
      'detail', v_storage_detail, 'last_seen_at', clock_timestamp(),
      'metric', jsonb_build_object('ready', v_storage_ready, 'private', v_storage_private))
  );

  select coalesce(jsonb_agg(to_jsonb(recent_failure) order by recent_failure.updated_at desc), '[]'::jsonb)
    into v_failures
  from (
    select id, job_type, status::text as status, attempt_count, last_error_code, updated_at
    from public.scheduled_jobs
    where status::text in ('DEAD', 'OUTCOME_UNKNOWN')
       or (status::text = 'PROCESSING' and coalesce(lease_expires_at, updated_at) < clock_timestamp())
    order by updated_at desc
    limit 10
  ) recent_failure;

  return jsonb_build_object(
    'overall_status', v_overall,
    'generated_at', clock_timestamp(),
    'checks', v_checks,
    'queue', jsonb_build_object('due', v_due, 'retry', v_retry, 'processing', v_processing, 'stuck', v_stuck, 'dead', v_dead, 'outcome_unknown', v_unknown, 'succeeded', v_succeeded),
    'recent_failures', v_failures,
    'read_only', true
  );
end;
$function$;

revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;
