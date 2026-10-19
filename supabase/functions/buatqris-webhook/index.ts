import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { constantTimeEqual, jsonResponse } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");

function getServerKey(): string | null {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Legacy projects can still use the service-role key below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

const serverKey = getServerKey();
const supabase = supabaseUrl && serverKey
  ? createClient(supabaseUrl, serverKey, { auth: { persistSession: false } })
  : null;

type BuatQrisConfig = { enabled?: boolean; signing_secret?: string };
type BuatQrisPayload = {
  event?: unknown;
  transaction_id?: unknown;
  status?: unknown;
  amount?: unknown;
  total_amount?: unknown;
  credit_amount?: unknown;
  admin_fee?: unknown;
  qris_method?: unknown;
  is_test?: unknown;
  paid_at?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))}`;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, { allow: "POST" });
  if (!supabase) return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503);

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 64_000) return jsonResponse({ error: "INVALID_PAYLOAD" }, 400);

  const { data: configData, error: configError } = await supabase.rpc("internal_get_buatqris_configuration");
  if (configError || !configData || typeof configData !== "object") return jsonResponse({ error: "CONFIGURATION_UNAVAILABLE" }, 503);
  const config = configData as BuatQrisConfig;
  if (!config.enabled || !text(config.signing_secret)) return jsonResponse({ error: "BUATQRIS_DISABLED" }, 503);

  const suppliedSignature = text(request.headers.get("x-buatqris-signature"));
  const expectedSignature = await signBody(text(config.signing_secret), rawBody);
  if (!suppliedSignature || !constantTimeEqual(suppliedSignature.toLowerCase(), expectedSignature.toLowerCase())) {
    return jsonResponse({ error: "INVALID_SIGNATURE" }, 401);
  }

  let payload: BuatQrisPayload;
  try { payload = JSON.parse(rawBody) as BuatQrisPayload; }
  catch { return jsonResponse({ error: "INVALID_JSON" }, 400); }

  const eventType = text(payload.event);
  const transactionId = text(payload.transaction_id);
  const status = text(payload.status).toLowerCase();
  const paidAt = text(payload.paid_at);
  if (!transactionId || !eventType || !status) return jsonResponse({ error: "INCOMPLETE_EVENT" }, 400);
  if (eventType !== "payment.success" && status !== "success") return jsonResponse({ received: true, ignored: true });
  if (paidAt && Number.isNaN(Date.parse(paidAt))) return jsonResponse({ error: "INVALID_PAID_AT" }, 400);

  const eventKey = [transactionId, eventType, paidAt || "no-time"].join(":");
  const { data, error } = await supabase.rpc("internal_process_buatqris_webhook", {
    p_event_key: eventKey,
    p_transaction_id: transactionId,
    p_event_type: eventType,
    p_status: status,
    p_amount: integer(payload.amount),
    p_total_amount: integer(payload.total_amount),
    p_credit_amount: integer(payload.credit_amount),
    p_admin_fee: integer(payload.admin_fee),
    p_is_test: payload.is_test === true,
    p_paid_at: paidAt || null,
    p_payload: payload,
  });
  if (error) {
    const notFound = /BUATQRIS_ORDER_NOT_FOUND/i.test(error.message ?? "");
    return jsonResponse({ error: notFound ? "ORDER_NOT_FOUND" : "PROCESSING_FAILED" }, notFound ? 404 : 503);
  }

  return jsonResponse({ received: true, result: data });
});
