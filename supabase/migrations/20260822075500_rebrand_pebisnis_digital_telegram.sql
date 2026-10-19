-- Rebrand user-facing product copy while keeping internal schema identifiers stable.

update public.system_settings
set value = value || jsonb_build_object(
  'product_label', 'PEBISNIS DIGITAL TELEGRAM',
  'buatqris_umkm_name', 'PEBISNIS',
  'access_text', replace(coalesce(value->>'access_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM')
)
where key = 'bot.checkout';

update public.system_settings
set value = value || jsonb_build_object(
  'offer_text', replace(
    replace(
      replace(coalesce(value->>'offer_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
      'Prompt Viral', 'PEBISNIS DIGITAL TELEGRAM'
    ),
    'prompt', 'materi'
  ),
  'offer_button_text', case
    when coalesce(value->>'offer_button_text', '') ilike '%prompt viral%' then 'BELI SEKARANG'
    else coalesce(value->>'offer_button_text', '')
  end
)
where key = 'bot.prompt_expiry';

update public.system_settings
set value = value || jsonb_build_object(
  'start_active_text', replace(
    replace(
      replace(coalesce(value->>'start_active_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
      'Prompt Viral', 'PEBISNIS DIGITAL TELEGRAM'
    ),
    'prompt', 'materi'
  ),
  'buy_button_text', case
    when coalesce(value->>'buy_button_text', '') ilike '%prompt viral%' then 'BELI SEKARANG'
    else coalesce(value->>'buy_button_text', '')
  end,
  'reference_image_caption', replace(coalesce(value->>'reference_image_caption', ''), 'prompt', 'materi'),
  'free_claim_paused_reply', replace(coalesce(value->>'free_claim_paused_reply', ''), 'prompt', 'materi'),
  'checkout_closed_text', replace(coalesce(value->>'checkout_closed_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
  'broadcast_unsubscribed_text', replace(
    replace(coalesce(value->>'broadcast_unsubscribed_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
    'prompt', 'materi'
  ),
  'broadcast_resubscribed_text', replace(coalesce(value->>'broadcast_resubscribed_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
  'onboarding_active_instruction', replace(coalesce(value->>'onboarding_active_instruction', ''), 'prompt', 'materi')
)
where key = 'bot.notifications';

update public.system_settings
set value = value || jsonb_build_object(
  'paid_order_text', replace(coalesce(value->>'paid_order_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
  'pending_order_text', replace(
    replace(
      replace(coalesce(value->>'pending_order_text', ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
      'Prompt Viral', 'PEBISNIS DIGITAL TELEGRAM'
    ),
    'prompt', 'materi'
  )
)
where key = 'bot.admin_notifications';

update public.system_settings
set description = replace(
  replace(
    replace(coalesce(description, ''), 'PROMPT VIRAL', 'PEBISNIS DIGITAL TELEGRAM'),
    'Prompt Viral', 'PEBISNIS DIGITAL TELEGRAM'
  ),
  'prompt', 'materi'
)
where description ilike '%prompt%';

update public.purchase_orders
set product_label = 'PEBISNIS DIGITAL TELEGRAM'
where product_label ilike '%prompt viral%';

alter table public.purchase_orders
  alter column order_number set default ('PDT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

alter table public.purchase_orders
  alter column product_label set default 'PEBISNIS DIGITAL TELEGRAM';
