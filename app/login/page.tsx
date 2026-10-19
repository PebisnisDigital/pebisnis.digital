import Link from "next/link";
import { getSupabasePublicConfig } from "../lib/config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const config = getSupabasePublicConfig();
  return (
    <main className="compact-auth-shell">
      <section className="compact-auth-card">
        <header className="compact-auth-header">
          <Link href="/" aria-label="Kembali ke halaman depan">←</Link>
          <span className="public-app-logo">PDT</span>
          <span aria-hidden="true" />
        </header>
        <div className="compact-auth-intro">
          <span>ADMIN PEBISNIS DIGITAL TELEGRAM</span>
          <h1>Selamat datang.</h1>
          <p>Masuk untuk melanjutkan pengelolaan bisnis hari ini.</p>
        </div>
        <div className="compact-auth-box">
          {config ? <LoginForm config={config} /> : <div className="setup-card"><strong>Konfigurasi belum terpasang.</strong><p>Hubungi pengelola sistem.</p></div>}
        </div>
        <footer className="compact-auth-footer"><i /> Akses terenkripsi & khusus Admin</footer>
      </section>
    </main>
  );
}
