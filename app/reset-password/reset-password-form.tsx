"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabase } from "../lib/supabase";

export function ResetPasswordForm({ config }: { config: SupabasePublicConfig }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Memeriksa link...");

  useEffect(() => {
    const supabase = getSupabase(config);
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (
        session &&
        (event === "INITIAL_SESSION" || event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")
      ) {
        setReady(true);
        setMessage("Link valid. Silakan buat password baru.");
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (data.session) {
        setReady(true);
        setMessage("Link valid. Silakan buat password baru.");
        return;
      }
      if (error) setMessage("Sesi pemulihan gagal dibaca. Minta satu link baru.");
    });

    const timeout = window.setTimeout(() => {
      if (active) {
        setMessage((current) => current === "Memeriksa link..." ? "Link tidak valid atau sudah dipakai." : current);
      }
    }, 5000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, [config]);

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 12) { setMessage("Password minimal 12 karakter."); return; }
    if (password !== confirmation) { setMessage("Konfirmasi password tidak sama."); return; }
    setBusy(true);
    const { error } = await getSupabase(config).auth.updateUser({ password });
    if (error) { setMessage("Password gagal disimpan. Minta link baru."); setBusy(false); return; }
    router.replace("/dashboard"); router.refresh();
  }

  return (
    <form className="form" action={submit}>
      <label className="field">Password baru<input name="password" type="password" minLength={12} autoComplete="new-password" disabled={!ready} required /></label>
      <label className="field">Ulangi password<input name="confirmation" type="password" minLength={12} autoComplete="new-password" disabled={!ready} required /></label>
      <button className="button" type="submit" disabled={!ready || busy}>{busy ? "Menyimpan..." : "Simpan Password"}</button>
      <p className={`notice ${ready ? "" : "error"}`} role="status">{message}</p>
    </form>
  );
}
