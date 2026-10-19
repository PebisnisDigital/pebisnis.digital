update public.system_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      value,
      '{pending_order_text}',
      to_jsonb(case
        when coalesce(value ->> 'pending_order_text', '') in (
          '',
          '⏳ Pesanan {order_number} dibuat dan sedang menunggu pembayaran.'
        ) then 'Halo {name}, ⏳ pesanan {order_number} dibuat dan sedang menunggu pembayaran.'
        else value ->> 'pending_order_text'
      end),
      true
    ),
    '{cancelled_order_text}',
    to_jsonb(case
      when coalesce(value ->> 'cancelled_order_text', '') in (
        '',
        '❌ Pesanan {order_number} sudah dibatalkan. Jika masih ingin membeli, silakan buat pesanan baru.'
      ) then 'Halo {name}, ❌ pesanan {order_number} sudah dibatalkan. Jika masih ingin membeli, silakan buat pesanan baru.'
      else value ->> 'cancelled_order_text'
    end),
    true
  ),
  '{paid_order_text}',
  to_jsonb(case
    when coalesce(value ->> 'paid_order_text', '') in (
      '',
      '✅ Pembayaran {order_number} sudah dikonfirmasi. Akses PROMPT VIRAL kamu sudah aktif.'
    ) then 'Halo {name}, ✅ pembayaran {order_number} sudah dikonfirmasi. Akses PROMPT VIRAL kamu sudah aktif.'
    else value ->> 'paid_order_text'
  end),
  true
),
updated_at = clock_timestamp()
where key = 'bot.admin_notifications';
