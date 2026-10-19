# PEBISNIS DIGITAL TELEGRAM

Migrasi aplikasi admin asli dari Prompt Viral Staging ke GitHub dan Vercel.

## Asal source

- Site: `prompt-viral-admin-staging.pebisnisdigital.chatgpt.site`
- Versi terpublikasi: **132**
- Commit asli: `a60e5cb2e7cdc94332f805c88be21f969c4003ef`
- Repository tujuan: `PebisnisDigital/pebisnis.digital`, branch `main`
- Vercel: project `pebisnis.digital`, team `cuanify25-2175s-projects`

## Menjalankan web

Gunakan Node.js 22. Buat `.env.local` dari `.env.example` dan isi konfigurasi publik Supabase proyek yang sudah ada.

```sh
npm ci
npm run dev
```

Build produksi: `npm run build`, kemudian `npm start`. Uji HTTP tanpa efek samping: `SMOKE_ORIGIN=http://localhost:3000 npm run test:smoke`.

Vercel memakai preset **Next.js**, root repository, install `npm ci`, build `npm run build`, dan output directory default framework.

## Konfigurasi dan akses

`SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` dipasang melalui Environment Variables Vercel. Keduanya konfigurasi klien publik; jangan menggantinya dengan service-role key. Tidak ada password admin, token Telegram, service-role key, atau database dump di repository.

Login memakai Supabase Auth dan profil admin aktif. Dashboard mengecek sesi serta role; akses database tetap menggunakan kebijakan Supabase yang sudah ada. Sesi browser staging tidak otomatis berpindah ke origin Vercel: admin masuk kembali dengan akun yang sama.

## Struktur

- `app/`: halaman depan, login, reset password, dashboard asli dan CSS.
- `supabase/functions/`: source fungsi backend yang tersimpan pada staging.
- `supabase/migrations/`: riwayat SQL yang tersedia; **bukan** perintah untuk diulang ke database produksi.
- `edge-functions/`: salinan fungsi terdahulu yang ikut dipertahankan.
- `legacy/sites/`: konfigurasi dan scaffold Sites terdahulu, termasuk manifest dan lockfile asli. Tidak digunakan build Vercel.
- `tests/`: pemeriksaan HTTP aplikasi produksi tanpa login, perubahan data, atau pengiriman pesan.

## Materi harian dan Telegram

Database, media Storage, member, materi, kalender, webhook, antrean dan worker tetap memakai Supabase lama (`hufndpzanstcsvqdixgp`). Pemindahan frontend tidak menyalin data atau menjalankan migration SQL.

**Tidak ada Vercel Cron, GitHub Action pengiriman, atau worker Telegram baru.** Build Vercel tidak menjalankan fungsi Supabase. Scheduler dan webhook yang sudah ada tidak diubah. Jangan menjalankan `supabase db reset`, deploy fungsi, atau memasang cron baru sebagai langkah deployment frontend.

Dashboard asli mencakup pesanan/pembayaran, konten/keyword, Kalender Konten 365, riwayat, member, broadcast teks/media, bot, admin/role, laporan penjualan, kesehatan sistem dan pusat kegagalan. Tombol kirim/broadcast/post-now tidak digunakan dalam pengujian migrasi.

## Batas verifikasi

Konektor Supabase saat migrasi tidak memiliki izin management ke database lama. Auth dan REST bisa diperiksa melalui konfigurasi publik; data admin, isi jadwal, status cron, runtime worker dan delivery log perlu sesi admin atau akses management proyek tersebut. Frontend berhasil deploy bukan bukti scheduler sehat.

Reset password membuat URL redirect dari origin aktif. Allowlist Supabase Auth perlu mencakup URL produksi Vercel `/reset-password` sebelum alur email pemulihan dinyatakan teruji. Jangan mengganti atau menghapus URL staging.

Proyek BADAI, PROMPTIONAL, database dan publikasi staging tidak diubah oleh migrasi ini.
