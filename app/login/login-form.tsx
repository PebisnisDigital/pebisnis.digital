"use client";

import { useState } from "react";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabase } from "../lib/supabase";

const LOGIN_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), LOGIN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function retry<T>(task: () => PromiseLike<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function LoginForm({ config }: { config: SupabasePublicConfig }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    if (busy) return;
    setBusy(true); setMessage("Memeriksa email dan password...");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const supabase = getSupabase(config);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        "Server login terlalu lama merespons.",
      );
      if (error || !data.user) {
        setMessage("Login gagal. Periksa email dan password.");
        return;
      }

      setMessage("Password benar. Membuka dashboard...");
      const profile = await retry(async () => {
        const { data: adminProfile, error: profileError } = await withTimeout(
          supabase
            .from("admin_profiles")
            .select("role,status")
            .eq("auth_user_id", data.user.id)
            .maybeSingle(),
          "Pemeriksaan admin terlalu lama merespons.",
        );
        if (profileError) throw profileError;
        return adminProfile;
      });
      if (!profile || profile.status !== "ACTIVE") {
        await supabase.auth.signOut();
        setMessage("Akun ini bukan admin aktif.");
        return;
      }

      // A full navigation is intentional here. The Sites runtime can leave a
      // client-side router transition pending even after Supabase succeeds.
      window.location.replace("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login terganggu. Coba sekali lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const emailInput = document.querySelector<HTMLInputElement>('input[name="email"]');
    const email = emailInput?.value.trim().toLowerCase();
    if (!email) { setMessage("Isi email dulu."); return; }
    const cooldownKey = `prompt-viral-reset:${email}`;
    const lastRequest = Number(window.localStorage.getItem(cooldownKey) ?? 0);
    const secondsLeft = Math.ceil((lastRequest + 60_000 - Date.now()) / 1000);
    if (secondsLeft > 0) {
      setMessage(`Tunggu ${secondsLeft} detik. Jangan habiskan kuota email.`);
      return;
    }

    setBusy(true); setMessage(null);
    const { error } = await getSupabase(config).auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) {
      const rateLimited = error.status === 429 || error.code === "over_email_send_rate_limit";
      setMessage(rateLimited ? "Kuota email sedang ditahan. Tunggu beberapa menit." : "Email reset gagal dikirim. Coba lagi nanti.");
    } else {
      window.localStorage.setItem(cooldownKey, String(Date.now()));
      setMessage("Link terbaru sudah dikirim. Klik satu kali saja.");
    }
    setBusy(false);
  }

  return (
    <form className="form" action={submit}>
      <label className="field"><span>Email Admin</span><input name="email" type="email" defaultValue="cuanify25@gmail.com" autoComplete="email" placeholder="nama@email.com" required /></label>
      <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" placeholder="Masukkan password" required /></label>
      <button className="public-app-button" type="submit" disabled={busy}>{busy ? "Memeriksa..." : "Masuk Admin"}<span>→</span></button>
      {message ? <p className={`notice ${message.includes("gagal") || message.includes("bukan") || message.includes("Tunggu") || message.includes("ditahan") || message.includes("lama") || message.includes("terganggu") ? "error" : ""}`} role="status">{message}</p> : null}
      <div className="form-links"><button type="button" onClick={resetPassword} disabled={busy}>Lupa atau buat password?</button></div>
    </form>
  );
}
