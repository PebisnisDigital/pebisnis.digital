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
      // Fall back to the legacy runtime secret while key rotation completes.
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

  const { data: actorProfile } = await service
    .from("admin_profiles")
    .select("role,status")
    .eq("auth_user_id", actorData.user.id)
    .maybeSingle();
  if (!actorProfile || actorProfile.role !== "SUPER_ADMIN" || actorProfile.status !== "ACTIVE") {
    return jsonResponse({ error: "OWNER_ACCESS_REQUIRED" }, 403, corsHeaders);
  }

  let payload: { email?: unknown; display_name?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "INVALID_JSON" }, 400, corsHeaders);
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const displayName = String(payload.display_name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "INVALID_EMAIL" }, 400, corsHeaders);
  }
  if (displayName.length < 2 || displayName.length > 100) {
    return jsonResponse({ error: "INVALID_DISPLAY_NAME" }, 400, corsHeaders);
  }

  let invited = true;
  let targetUserId: string | null = null;
  const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: "https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/reset-password",
  });

  if (!inviteError && inviteData.user) {
    targetUserId = inviteData.user.id;
  } else {
    invited = false;
    for (let page = 1; page <= 10 && !targetUserId; page += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return jsonResponse({ error: "AUTH_DIRECTORY_UNAVAILABLE" }, 503, corsHeaders);
      const found = data.users.find((user) => user.email?.toLowerCase() === email);
      if (found) targetUserId = found.id;
      if (data.users.length < 100) break;
    }
    if (!targetUserId) {
      return jsonResponse({ error: "INVITE_FAILED", detail: inviteError?.message ?? "Email tidak dapat diundang." }, 400, corsHeaders);
    }
  }

  const { data: existing } = await service
    .from("admin_profiles")
    .select("role")
    .eq("auth_user_id", targetUserId)
    .maybeSingle();
  if (existing?.role === "SUPER_ADMIN") {
    return jsonResponse({ error: "OWNER_CANNOT_BE_REASSIGNED" }, 409, corsHeaders);
  }

  const { error: profileError } = await service.from("admin_profiles").upsert({
    auth_user_id: targetUserId,
    display_name: displayName,
    role: "OPERATOR",
    status: "ACTIVE",
    updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });
  if (profileError) return jsonResponse({ error: "PROFILE_SAVE_FAILED", detail: profileError.message }, 500, corsHeaders);

  await service.from("audit_logs").insert({
    actor_type: "ADMIN",
    actor_id: actorData.user.id,
    action: invited ? "PAYMENT_ADMIN_INVITED" : "PAYMENT_ADMIN_REACTIVATED",
    entity_type: "ADMIN_PROFILE",
    entity_id: targetUserId,
    summary: { email, role: "OPERATOR" },
  });

  return jsonResponse({ ok: true, invited, email }, 200, corsHeaders);
});
