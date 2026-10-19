update public.system_settings
set value = value || jsonb_build_object(
      'start_group_text', coalesce(
        nullif(value ->> 'start_group_text', ''),
        '👋 LANGKAH 2 DARI 3' || chr(10) || chr(10)
          || 'Sip, Channel sudah beres. Sekarang masuk ke <b>GRUP PEBISNIS DIGITAL</b> ya Kak 👇'
      ),
      'start_check_text', coalesce(
        nullif(value ->> 'start_check_text', ''),
        '👋 LANGKAH 3 DARI 3' || chr(10) || chr(10)
          || 'Sekarang tekan <b>CEK KEANGGOTAAN</b> untuk memastikan Channel dan Grup sudah lengkap.'
      ),
      'join_channel_button_text', 'MASUK CHANNEL',
      'join_discussion_button_text', 'MASUK GRUP'
    ),
    updated_at = clock_timestamp()
where key = 'bot.notifications';
