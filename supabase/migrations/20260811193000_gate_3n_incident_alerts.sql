-- Gate 3N: owner-configured Telegram incident alerts, evaluated by an
-- independent scheduled Edge Function. Alerts are disabled on installation.

create table if not exists public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null,
  severity text not null check (severity in ('ATTENTION','INCIDENT')),
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  detail text not null,
  opened_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index if not exists system_incidents_one_open_key_idx
  on public.system_incidents(incident_key) where status = 'OPEN';
create index if not exists system_incidents_recent_idx
  on public.system_incidents(created_at desc);

create table if not exists public.system_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.system_incidents(id) on delete cascade,
  alert_kind text not null check (alert_kind in ('INCIDENT','RECOVERY')),
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','FAILED','BLOCKED','OUTCOME_UNKNOWN','SKIPPED')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 4),
  lease_token uuid,
  lease_expires_at timestamptz,
  telegram_message_id bigint,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  unique(incident_id, alert_kind)
);

alter table public.system_incidents enable row level security;
alter table public.system_alert_deliveries enable row level security;
revoke all on table public.system_incidents from public, anon, authenticated;
revoke all on table public.system_alert_deliveries from public, anon, authenticated;

insert into public.system_settings(key, category, value, description, status, updated_by)
select 'system.incident_alerts', 'SYSTEM',
  jsonb_build_object(
    'enabled', false,
    'recipient_user_id', null,
    'admin_url', 'https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/dashboard#kesehatan-sistem'
  ),
  'Alarm Telegram satu kali saat sistem terganggu dan satu kali saat pulih.',
  'ACTIVE', auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at limit 1
on conflict(key) do nothing;

-- Keep privileged Owner logic outside the exposed API schema. Public RPCs are
-- security-invoker wrappers; the private cores perform the authorization check.
create or replace function private.admin_incident_alert_report_core()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_setting jsonb; v_incidents jsonb; v_deliveries jsonb;
begin
  if (select auth.uid()) is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  select coalesce(value, '{}'::jsonb) into v_setting from public.system_settings where key = 'system.incident_alerts';
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc), '[]'::jsonb) into v_incidents
  from (select id, incident_key, severity, status, detail, opened_at, resolved_at, updated_at, created_at from public.system_incidents order by created_at desc limit 20) i;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb) into v_deliveries
  from (select id, incident_id, alert_kind, status, attempt_count, failure_code, created_at, sent_at from public.system_alert_deliveries order by created_at desc limit 20) d;
  return jsonb_build_object('settings', jsonb_build_object(
    'enabled', coalesce((v_setting->>'enabled')::boolean, false),
    'recipient_user_id', nullif(v_setting->>'recipient_user_id',''),
    'admin_url', coalesce(v_setting->>'admin_url','')
  ), 'open_count', (select count(*) from public.system_incidents where status='OPEN'),
    'incidents', v_incidents, 'deliveries', v_deliveries, 'generated_at', clock_timestamp());
end $function$;

create or replace function private.admin_update_incident_alert_settings_core(p_enabled boolean, p_recipient_user_id uuid, p_admin_url text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_value jsonb;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'OWNER_ACCESS_REQUIRED'; end if;
  if p_enabled and p_recipient_user_id is null then raise exception 'INCIDENT_ALERT_RECIPIENT_REQUIRED'; end if;
  if p_recipient_user_id is not null and not exists(select 1 from public.users where id=p_recipient_user_id and private_chat_id is not null and contact_status='CONTACTABLE') then
    raise exception 'INCIDENT_ALERT_RECIPIENT_NOT_CONTACTABLE';
  end if;
  if p_admin_url is null or p_admin_url !~ '^https://[^[:space:]]+$' or char_length(p_admin_url)>500 then raise exception 'INVALID_ADMIN_URL'; end if;
  v_value := jsonb_build_object('enabled', p_enabled, 'recipient_user_id', p_recipient_user_id, 'admin_url', trim(p_admin_url));
  update public.system_settings set value=v_value, updated_by=v_actor, updated_at=clock_timestamp() where key='system.incident_alerts';
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,summary)
  values('ADMIN',v_actor,'INCIDENT_ALERT_SETTINGS_UPDATED','SYSTEM_SETTING',jsonb_build_object('enabled',p_enabled,'recipient_user_id',p_recipient_user_id));
  return v_value;
end $function$;

create or replace function public.admin_incident_alert_report()
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select private.admin_incident_alert_report_core();
$function$;

create or replace function public.admin_update_incident_alert_settings(p_enabled boolean, p_recipient_user_id uuid, p_admin_url text)
returns jsonb language sql volatile security invoker set search_path = '' as $function$
  select private.admin_update_incident_alert_settings_core(p_enabled, p_recipient_user_id, p_admin_url);
$function$;

-- Evaluate four independently actionable checks and atomically create delivery work.
create or replace function public.system_alert_evaluate()
returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_setting jsonb; v_runtime jsonb; v_worker_at timestamptz; v_cron_ok boolean; v_bad_jobs integer; v_storage_ok boolean;
  v_check record; v_open public.system_incidents%rowtype; v_created integer := 0;
begin
  select value into v_setting from public.system_settings where key='system.incident_alerts';
  if not coalesce((v_setting->>'enabled')::boolean,false) then return 0; end if;
  select coalesce(value,'{}'::jsonb) into v_runtime from public.system_settings where key='worker.runtime';
  begin v_worker_at := nullif(v_runtime->>'last_run_at','')::timestamptz; exception when others then v_worker_at := null; end;
  select exists(select 1 from cron.job j join lateral (select status,end_time,start_time from cron.job_run_details r where r.jobid=j.jobid order by start_time desc limit 1) r on true where j.jobname='prompt-viral-staging-job-worker' and j.active and r.status='succeeded' and coalesce(r.end_time,r.start_time)>=clock_timestamp()-interval '3 minutes') into v_cron_ok;
  select count(*) into v_bad_jobs from public.scheduled_jobs where status::text in ('DEAD','OUTCOME_UNKNOWN') or (status::text='PROCESSING' and coalesce(lease_expires_at,updated_at)<clock_timestamp());
  select exists(select 1 from storage.buckets where id='payment-proofs' and public=false) into v_storage_ok;

  for v_check in select * from (values
    ('worker', v_worker_at is not null and v_worker_at>=clock_timestamp()-interval '3 minutes' and coalesce(v_runtime->>'error_code','')='', 'INCIDENT', 'Worker tidak berdetak normal lebih dari 3 menit.'),
    ('scheduler', v_cron_ok, 'INCIDENT', 'Jadwal worker tidak aktif atau pemanggilan terakhir gagal.'),
    ('queue', v_bad_jobs=0, 'INCIDENT', format('Ada %s job mati, macet, atau hasilnya tidak pasti.',v_bad_jobs)),
    ('storage', v_storage_ok, 'INCIDENT', 'Penyimpanan bukti transfer tidak tersedia atau tidak privat.')
  ) c(incident_key,is_healthy,severity,detail)
  loop
    select * into v_open from public.system_incidents where incident_key=v_check.incident_key and status='OPEN' limit 1 for update;
    if not v_check.is_healthy and v_open.id is null then
      insert into public.system_incidents(incident_key,severity,detail) values(v_check.incident_key,v_check.severity,v_check.detail) returning * into v_open;
      insert into public.system_alert_deliveries(incident_id,alert_kind) values(v_open.id,'INCIDENT') on conflict do nothing;
      v_created := v_created + 1;
    elsif not v_check.is_healthy and v_open.id is not null then
      update public.system_incidents set detail=v_check.detail,updated_at=clock_timestamp() where id=v_open.id;
    elsif v_check.is_healthy and v_open.id is not null then
      update public.system_incidents set status='RESOLVED',resolved_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_open.id;
      if exists(select 1 from public.system_alert_deliveries where incident_id=v_open.id and alert_kind='INCIDENT' and status='SENT') then
        insert into public.system_alert_deliveries(incident_id,alert_kind) values(v_open.id,'RECOVERY') on conflict do nothing;
        v_created := v_created + 1;
      end if;
    end if;
  end loop;
  return v_created;
end $function$;

create or replace function public.system_alert_claim(p_lease_token uuid)
returns table(delivery_id uuid, alert_kind text, incident_key text, severity text, detail text, opened_at timestamptz, resolved_at timestamptz, recipient_chat_id bigint, admin_url text)
language plpgsql security definer set search_path = '' as $function$
begin
  if not coalesce((select (value->>'enabled')::boolean from public.system_settings where key='system.incident_alerts'), false) then
    return;
  end if;
  perform public.system_alert_evaluate();
  return query with picked as (
    select d.id from public.system_alert_deliveries d where (d.status in ('QUEUED','FAILED') or (d.status='SENDING' and d.lease_expires_at<clock_timestamp())) and d.attempt_count<4 order by d.created_at for update skip locked limit 10
  ), claimed as (
    update public.system_alert_deliveries d set status='SENDING',attempt_count=d.attempt_count+1,lease_token=p_lease_token,lease_expires_at=clock_timestamp()+interval '2 minutes'
    from picked where d.id=picked.id returning d.*
  ) select c.id,c.alert_kind,i.incident_key,i.severity,i.detail,i.opened_at,i.resolved_at,u.private_chat_id,(s.value->>'admin_url')
  from claimed c join public.system_incidents i on i.id=c.incident_id cross join public.system_settings s join public.users u on u.id=nullif(s.value->>'recipient_user_id','')::uuid
  where s.key='system.incident_alerts' and u.contact_status='CONTACTABLE';
end $function$;

create or replace function public.system_alert_complete(p_delivery_id uuid,p_lease_token uuid,p_status text,p_message_id bigint default null,p_failure_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_count integer;
begin
  if p_status not in ('SENT','FAILED','BLOCKED','OUTCOME_UNKNOWN') then raise exception 'INVALID_ALERT_STATUS'; end if;
  update public.system_alert_deliveries set status=p_status,telegram_message_id=p_message_id,failure_code=left(p_failure_code,120),sent_at=case when p_status='SENT' then clock_timestamp() else sent_at end,lease_token=null,lease_expires_at=null
  where id=p_delivery_id and status='SENDING' and lease_token=p_lease_token;
  get diagnostics v_count=row_count; return v_count=1;
end $function$;

revoke all on function public.admin_incident_alert_report() from public,anon;
grant execute on function public.admin_incident_alert_report() to authenticated;
revoke all on function public.admin_update_incident_alert_settings(boolean,uuid,text) from public,anon;
grant execute on function public.admin_update_incident_alert_settings(boolean,uuid,text) to authenticated;
revoke all on function private.admin_incident_alert_report_core() from public,anon;
grant execute on function private.admin_incident_alert_report_core() to authenticated;
revoke all on function private.admin_update_incident_alert_settings_core(boolean,uuid,text) from public,anon;
grant execute on function private.admin_update_incident_alert_settings_core(boolean,uuid,text) to authenticated;
revoke all on function public.system_alert_evaluate() from public,anon,authenticated;
revoke all on function public.system_alert_claim(uuid) from public,anon,authenticated;
revoke all on function public.system_alert_complete(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.system_alert_evaluate() to service_role;
grant execute on function public.system_alert_claim(uuid) to service_role;
grant execute on function public.system_alert_complete(uuid,uuid,text,bigint,text) to service_role;

do $do$
begin
  if exists(select 1 from cron.job where jobname='prompt-viral-staging-system-alert') then perform cron.unschedule('prompt-viral-staging-system-alert'); end if;
  perform cron.schedule('prompt-viral-staging-system-alert','* * * * *',$cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='prompt_viral_staging_project_url' limit 1) || '/functions/v1/system-alert',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='prompt_viral_staging_job_worker_secret' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$);
end $do$;
