alter table public.comment_claims
  add column if not exists expires_at timestamptz,
  add column if not exists expiry_status text not null default 'NOT_SCHEDULED'
    check (expiry_status in ('NOT_SCHEDULED','SCHEDULED','DELETING','DELETED','NOTIFYING','COMPLETED','FAILED','OUTCOME_UNKNOWN')),
  add column if not exists deleted_message_ids bigint[] not null default '{}',
  add column if not exists deletion_started_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists expiry_notice_message_id bigint,
  add column if not exists offer_message_id bigint,
  add column if not exists offer_sent_at timestamptz,
  add column if not exists expiry_failure_code text;

create index if not exists comment_claims_expiry_status_idx
  on public.comment_claims (expiry_status, expires_at)
  where status = 'DELIVERED';

insert into public.system_settings (key, category, value, description, status, updated_by)
select
  'bot.prompt_expiry',
  'TELEGRAM',
  jsonb_build_object(
    'delete_after_seconds', 21600,
    'expiry_notice', '⏰ Prompt gratis tadi sudah dihapus otomatis.',
    'offer_text', E'Jangan berburu prompt satu-satu terus.\n\nPROMPT VIRAL berisi kumpulan prompt lengkap yang bisa dibuka kapan saja.\n\nKetik BELI untuk lanjut.',
    'offer_button_text', 'BELI PROMPT VIRAL',
    'offer_button_url', ''
  ),
  'Durasi penghapusan prompt gratis dan pesan penawaran setelah penghapusan.',
  'ACTIVE',
  auth_user_id
from public.admin_profiles
where role = 'SUPER_ADMIN' and status = 'ACTIVE'
order by created_at
limit 1
on conflict (key) do nothing;

create or replace function private.prepare_comment_claim_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_seconds integer := 21600;
begin
  if new.status = 'DELIVERED' and old.status is distinct from 'DELIVERED' then
    select greatest(60, least(604800, coalesce((value ->> 'delete_after_seconds')::integer, 21600)))
    into v_seconds
    from public.system_settings
    where key = 'bot.prompt_expiry' and status = 'ACTIVE';

    v_seconds := coalesce(v_seconds, 21600);
    new.expires_at := coalesce(new.expires_at, clock_timestamp() + make_interval(secs => v_seconds));
    new.expiry_status := 'SCHEDULED';
    new.expiry_failure_code := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.prepare_comment_claim_expiry() from public, anon, authenticated;

drop trigger if exists comment_claims_prepare_expiry on public.comment_claims;
create trigger comment_claims_prepare_expiry
before update of status on public.comment_claims
for each row execute function private.prepare_comment_claim_expiry();

create or replace function private.enqueue_comment_claim_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'DELIVERED'
     and new.expiry_status = 'SCHEDULED'
     and new.expires_at is not null
     and (old.status is distinct from 'DELIVERED' or old.expires_at is distinct from new.expires_at) then
    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'COMMENT_CLAIM_EXPIRE', 'COMMENT_CLAIM', new.id,
      jsonb_build_object('claim_id', new.id),
      'comment-claim-expire:' || new.id::text,
      'QUEUED', 70, new.expires_at, 5, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.enqueue_comment_claim_expiry() from public, anon, authenticated;

drop trigger if exists comment_claims_enqueue_expiry on public.comment_claims;
create trigger comment_claims_enqueue_expiry
after update of status, expires_at on public.comment_claims
for each row execute function private.enqueue_comment_claim_expiry();

create or replace function public.admin_update_prompt_expiry_settings(
  p_delete_after_seconds integer,
  p_expiry_notice text,
  p_offer_text text,
  p_offer_button_text text,
  p_offer_button_url text
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
  if p_delete_after_seconds not between 60 and 604800 then raise exception 'INVALID_EXPIRY_DURATION'; end if;
  if char_length(trim(p_expiry_notice)) not between 3 and 1000 then raise exception 'INVALID_EXPIRY_NOTICE'; end if;
  if char_length(trim(p_offer_text)) not between 3 and 4000 then raise exception 'INVALID_OFFER_TEXT'; end if;
  if char_length(trim(p_offer_button_text)) > 64 then raise exception 'INVALID_OFFER_BUTTON_TEXT'; end if;
  if trim(coalesce(p_offer_button_url, '')) <> '' and trim(p_offer_button_url) !~ '^https://t[.]me/[A-Za-z0-9_+/?=&-]+$' then
    raise exception 'INVALID_OFFER_BUTTON_URL';
  end if;

  v_value := jsonb_build_object(
    'delete_after_seconds', p_delete_after_seconds,
    'expiry_notice', trim(p_expiry_notice),
    'offer_text', trim(p_offer_text),
    'offer_button_text', trim(coalesce(p_offer_button_text, '')),
    'offer_button_url', trim(coalesce(p_offer_button_url, ''))
  );

  insert into public.system_settings (key, category, value, description, status, updated_by)
  values ('bot.prompt_expiry', 'TELEGRAM', v_value,
    'Durasi penghapusan prompt gratis dan pesan penawaran setelah penghapusan.', 'ACTIVE', v_actor)
  on conflict (key) do update set
    value = excluded.value, status = 'ACTIVE', updated_by = v_actor, updated_at = clock_timestamp();

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'PROMPT_EXPIRY_SETTINGS_UPDATED', 'SYSTEM_SETTING', null,
    jsonb_build_object('delete_after_seconds', p_delete_after_seconds));
  return v_value;
end;
$function$;

revoke all on function public.admin_update_prompt_expiry_settings(integer,text,text,text,text) from public, anon;
grant execute on function public.admin_update_prompt_expiry_settings(integer,text,text,text,text) to authenticated;

do $block$
declare
  v_claim public.comment_claims;
  v_seconds integer := 21600;
begin
  select greatest(60, least(604800, coalesce((value ->> 'delete_after_seconds')::integer, 21600)))
  into v_seconds
  from public.system_settings
  where key = 'bot.prompt_expiry' and status = 'ACTIVE';
  v_seconds := coalesce(v_seconds, 21600);

  for v_claim in
    update public.comment_claims
    set expires_at = coalesce(delivered_at, updated_at) + make_interval(secs => v_seconds),
        expiry_status = 'SCHEDULED', expiry_failure_code = null
    where status = 'DELIVERED' and expiry_status = 'NOT_SCHEDULED'
    returning *
  loop
    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'COMMENT_CLAIM_EXPIRE', 'COMMENT_CLAIM', v_claim.id,
      jsonb_build_object('claim_id', v_claim.id),
      'comment-claim-expire:' || v_claim.id::text,
      'QUEUED', 70, v_claim.expires_at, 5, gen_random_uuid()
    ) on conflict (idempotency_key) do nothing;
  end loop;
end;
$block$;
