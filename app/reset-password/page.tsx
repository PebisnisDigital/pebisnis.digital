import Link from "next/link";
import { getSupabasePublicConfig } from "../lib/config";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  const config = getSupabasePublicConfig();
  return (
    <main className="compact-auth-shell">
      <section className="compact-auth-card">
        <header className="compact-auth-header">
          <Link href="/login" aria-label="Kembali ke halaman masuk">←</Link>
          <span className="public-app-logo">PDT</span>
          <span aria-hidden="true" />
        </header>
        <div className="compact-auth-intro">
          <span>KEAMANAN AKUN</span>
          <h1>Atur password baru.</h1>
          <p>Gunakan minimal 12 karakter dengan kombinasi huruf, angka, dan simbol.</p>
        </div>
        <div className="compact-auth-box">
          {config ? <ResetPasswordForm config={config} /> : <div className="setup-card"><strong>Konfigurasi belum terpasang.</strong><p>Hubungi pengelola sistem.</p></div>}
        </div>
        <footer className="compact-auth-footer"><i /> Link pemulihan hanya berlaku sekali</footer>
      </section>
    </main>
  );
}
