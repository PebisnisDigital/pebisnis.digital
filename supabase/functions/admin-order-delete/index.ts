import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { jsonResponse } from "../_shared/http.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function getServerKey(): string | null {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Use the legacy key while key rotation completes.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serverKey = getServerKey();
if (!supabaseUrl || !serverKey) throw new Error("Missing Supabase runtime configuration");
const service = createClient(supabaseUrl, serverKey, { auth: { persistSession: false } });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, corsHeaders);

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: actorData, error: actorError } = await service.auth.getUser(bearer);
  if (actorError || !actorData.user) return jsonResponse({ error: "UNAUTHORIZED" }, 401, corsHeaders);

  const { data: actorProfile } = await service.from("admin_profiles").select("role,status")
    .eq("auth_user_id", actorData.user.id).maybeSingle();
  if (!actorProfile || actorProfile.role !== "SUPER_ADMIN" || actorProfile.status !== "ACTIVE") {
    return jsonResponse({ error: "OWNER_ACCESS_REQUIRED" }, 403, corsHeaders);
  }

  let payload: { order_id?: unknown; confirmation?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "INVALID_JSON" }, 400, corsHeaders);
  }
  const orderId = String(payload.order_id ?? "").trim();
  const confirmation = String(payload.confirmation ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !confirmation) {
    return jsonResponse({ error: "INVALID_DELETE_REQUEST" }, 400, corsHeaders);
  }

  const { data, error } = await service.rpc("admin_delete_purchase_order", {
    p_order_id: orderId,
    p_actor_id: actorData.user.id,
    p_confirmation: confirmation,
  });
  if (error) return jsonResponse({ error: error.message }, 400, corsHeaders);

  const paths = Array.isArray(data?.storage_paths)
    ? data.storage_paths.filter((path: unknown): path is string => typeof path === "string" && path.length > 0)
    : [];
  let storageWarning: string | null = null;
  if (paths.length) {
    const { error: storageError } = await service.storage.from("payment-proofs").remove(paths);
    if (storageError) {
      storageWarning = "ORDER_DELETED_STORAGE_CLEANUP_PENDING";
      await service.from("audit_logs").insert({
        actor_type: "SYSTEM", actor_id: actorData.user.id, action: "ORDER_STORAGE_CLEANUP_FAILED",
        entity_type: "PURCHASE_ORDER", entity_id: orderId,
        summary: { order_number: data.order_number, paths, error: storageError.message },
      });
    }
  }

  return jsonResponse({ ok: true, order_id: orderId, order_number: data.order_number, storage_warning: storageWarning }, 200, corsHeaders);
});
