-- Create broadcast campaigns and queue recipient jobs without trying to read
-- Vault secrets inside the campaign transaction. The recurring job-worker
-- cron drains scheduled_jobs independently.
create or replace function public.admin_create_broadcast_campaign_queued(
  p_name text,
  p_audience_segment text,
  p_message_parts jsonb,
  p_button_text text,
  p_button_url text,
  p_opt_out_button_text text,
  p_send_interval_seconds integer,
  p_scheduled_at timestamptz
) returns public.broadcast_campaigns
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_campaign public.broadcast_campaigns;
  v_recipient record;
  v_recipient_id uuid;
  v_position integer := 0;
begin
  if v_actor is null or not private.is_active_admin() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(trim(p_name)) not between 3 and 100 then raise exception 'INVALID_CAMPAIGN_NAME'; end if;
  if p_audience_segment not in ('ALL','ACTIVE','PENDING','CLAIMED','NEVER_CLAIMED') then raise exception 'INVALID_AUDIENCE_SEGMENT'; end if;
  if not private.is_nonempty_text_array(p_message_parts) then raise exception 'INVALID_MESSAGE_PARTS'; end if;
  if char_length(trim(coalesce(p_button_text, ''))) > 64 then raise exception 'INVALID_BUTTON_TEXT'; end if;
  if trim(coalesce(p_button_url, '')) <> '' and trim(p_button_url) !~ '^https://' then raise exception 'INVALID_BUTTON_URL'; end if;
  if char_length(trim(coalesce(p_opt_out_button_text, ''))) not between 2 and 64 then raise exception 'INVALID_OPT_OUT_TEXT'; end if;
  if p_send_interval_seconds not between 10 and 60 then raise exception 'INVALID_SEND_INTERVAL'; end if;
  if p_scheduled_at is null or p_scheduled_at < clock_timestamp() - interval '30 seconds' then raise exception 'INVALID_SCHEDULE'; end if;

  insert into public.broadcast_campaigns (
    name, audience_segment, message_parts, button_text, button_url,
    opt_out_button_text, send_interval_seconds, scheduled_at, created_by
  ) values (
    trim(p_name), p_audience_segment, p_message_parts,
    trim(coalesce(p_button_text, '')), trim(coalesce(p_button_url, '')),
    trim(p_opt_out_button_text), p_send_interval_seconds, p_scheduled_at, v_actor
  ) returning * into v_campaign;

  for v_recipient in
    select u.id, u.private_chat_id
    from public.users u
    left join public.broadcast_preferences preference on preference.user_id = u.id
    where u.status = 'ACTIVE'
      and u.private_chat_id is not null
      and u.contact_status = 'CONTACTABLE'
      and coalesce(preference.subscribed, true)
      and (
        p_audience_segment = 'ALL'
        or (p_audience_segment = 'ACTIVE' and u.onboarding_status = 'ACTIVE')
        or (p_audience_segment = 'PENDING' and u.onboarding_status <> 'ACTIVE')
        or (p_audience_segment = 'CLAIMED' and exists (select 1 from public.comment_claims c where c.user_id = u.id))
        or (p_audience_segment = 'NEVER_CLAIMED' and not exists (select 1 from public.comment_claims c where c.user_id = u.id))
      )
    order by u.first_seen_at, u.id
  loop
    v_position := v_position + 1;
    insert into public.broadcast_recipients (campaign_id, user_id, private_chat_id)
    values (v_campaign.id, v_recipient.id, v_recipient.private_chat_id)
    returning id into v_recipient_id;

    insert into public.scheduled_jobs (
      job_type, entity_type, entity_id, payload, idempotency_key,
      status, priority, run_at, max_attempts, correlation_id
    ) values (
      'BROADCAST_RECIPIENT_SEND', 'BROADCAST_RECIPIENT', v_recipient_id,
      jsonb_build_object('recipient_id', v_recipient_id),
      'broadcast-recipient:' || v_recipient_id::text || ':send:v1',
      'QUEUED', 90,
      p_scheduled_at + make_interval(secs => (v_position - 1) * p_send_interval_seconds),
      4, gen_random_uuid()
    );
  end loop;

  update public.broadcast_campaigns
  set total_recipients = v_position,
      status = case when v_position = 0 then 'COMPLETED' else 'SCHEDULED' end,
      completed_at = case when v_position = 0 then clock_timestamp() else null end,
      updated_at = clock_timestamp()
  where id = v_campaign.id
  returning * into v_campaign;

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, summary)
  values ('ADMIN', v_actor, 'BROADCAST_CAMPAIGN_CREATED', 'BROADCAST_CAMPAIGN', v_campaign.id,
    jsonb_build_object('segment', p_audience_segment, 'recipients', v_position, 'scheduled_at', p_scheduled_at));

  return v_campaign;
end;
$function$;

revoke all on function public.admin_create_broadcast_campaign_queued(text,text,jsonb,text,text,text,integer,timestamptz) from public, anon;
grant execute on function public.admin_create_broadcast_campaign_queued(text,text,jsonb,text,text,text,integer,timestamptz) to authenticated;
