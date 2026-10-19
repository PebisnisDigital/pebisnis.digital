import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
function getServerKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Fall back while staging completes key rotation.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const serviceKey = getServerKey();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!supplied) return json({ error: "UNAUTHORIZED" }, 401);
  if (!url || !serviceKey) return json({ error: "CONFIGURATION_MISSING" }, 503);
  const authorization = await supabase.rpc("job_worker_verify_secret", { p_secret: supplied });
  if (authorization.error) return json({ error: "AUTHORIZATION_FAILED" }, 503);
  if (authorization.data !== true) return json({ error: "UNAUTHORIZED" }, 401);
  const runtime = await supabase.rpc("telegram_get_runtime_configuration");
  const token = runtime.data && typeof runtime.data === "object" ? String((runtime.data as { bot_token?: string }).bot_token ?? "") : "";
  if (runtime.error || !token) return json({ error: "TELEGRAM_CONFIGURATION_MISSING" }, 503);

  const leaseToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc("system_alert_claim", { p_lease_token: leaseToken });
  if (error) return json({ error: "ALERT_CLAIM_FAILED" }, 503);
  let sent = 0, failed = 0;
  for (const row of data ?? []) {
    const keyLabels: Record<string, string> = { worker: "Worker Otomatis", scheduler: "Jadwal Worker", queue: "Antrean Pesan", storage: "Bukti Transfer" };
    const isRecovery = row.alert_kind === "RECOVERY";
    const text = isRecovery
      ? `✅ NORMAL KEMBALI\n\n${keyLabels[row.incident_key] ?? row.incident_key} sudah pulih.\nGangguan dibuka: ${new Date(row.opened_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.`
      : `🚨 GANGGUAN SISTEM\n\nBagian: ${keyLabels[row.incident_key] ?? row.incident_key}\nStatus: ${row.severity}\n\n${row.detail}\n\nPeriksa Web Admin sekarang.`;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: row.recipient_chat_id, text, reply_markup: { inline_keyboard: [[{ text: "PERIKSA SISTEM", url: row.admin_url }]] } }) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; error_code?: number };
      if (!response.ok || !result.ok) throw new Error(`TELEGRAM_${result.error_code ?? response.status}`);
      const completed = await supabase.rpc("system_alert_complete", { p_delivery_id: row.delivery_id, p_lease_token: leaseToken, p_status: "SENT", p_message_id: result.result?.message_id ?? null, p_failure_code: null });
      if (completed.error || completed.data !== true) throw new Error("ALERT_SENT_BUT_SAVE_FAILED");
      sent += 1;
    } catch (sendError) {
      const code = sendError instanceof Error ? sendError.message.slice(0, 120) : "ALERT_SEND_FAILED";
      const blocked = /TELEGRAM_403/.test(code);
      const explicitTelegramFailure = /^TELEGRAM_\d+$/.test(code);
      const status = blocked ? "BLOCKED" : explicitTelegramFailure ? "FAILED" : "OUTCOME_UNKNOWN";
      await supabase.rpc("system_alert_complete", { p_delivery_id: row.delivery_id, p_lease_token: leaseToken, p_status: status, p_message_id: null, p_failure_code: code });
      failed += 1;
    }
  }
  return json({ ok: true, claimed: (data ?? []).length, sent, failed });
});
