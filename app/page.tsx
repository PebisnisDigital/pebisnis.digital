import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="public-app-shell">
      <section className="public-app-card">
        <header className="public-app-header">
          <span className="public-app-logo">PDT</span>
          <div><strong>PEBISNIS DIGITAL TELEGRAM</strong><small>Admin Control</small></div>
          <span className="public-app-status"><i /> Aktif</span>
        </header>

        <section className="public-app-hero">
          <span className="public-app-kicker">PANEL KHUSUS ADMIN</span>
          <h1>Kelola Materi Pebisnis Digital<br />dari satu tempat.</h1>
          <p>Pesanan, konten, member, dan bot Telegram tersusun dalam alur yang simpel.</p>
          <Link className="public-app-button" href="/login">Masuk Admin <span>→</span></Link>
        </section>

        <section className="public-app-features" aria-label="Fitur utama Admin">
          <p className="public-app-label">YANG BISA DIKELOLA</p>
          <article><span>▣</span><div><strong>Pesanan & Pembayaran</strong><small>Cek bukti dan ubah status order</small></div><i>›</i></article>
          <article><span>✦</span><div><strong>Konten & Automasi</strong><small>Posting, keyword, dan broadcast</small></div><i>›</i></article>
          <article><span>♟</span><div><strong>Member & Telegram</strong><small>Kelola akses, Channel, Grup, dan bot</small></div><i>›</i></article>
        </section>

        <footer className="public-app-footer">Akses terbatas untuk Admin terdaftar.</footer>
      </section>
    </main>
  );
}
