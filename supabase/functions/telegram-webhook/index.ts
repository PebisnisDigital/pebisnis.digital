import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { createTelegramWebhookHandler } from "../_shared/telegram-contract.ts";
import { jsonResponse } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
};

type RuntimeConfig = {
  bot_token?: string | null;
  webhook_secret?: string | null;
  bot_id?: string | null;
  bot_username?: string | null;
  webhook_path_id?: string | null;
  configured_at?: string | null;
};

type TelegramBot = { id: number; is_bot?: boolean; username?: string; first_name?: string };
type TelegramWebhookInfo = { url?: string; pending_update_count?: number; last_error_message?: string };

class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly description: string | null,
    public readonly errorCode: number | null,
  ) {
    super(`TELEGRAM_${method.toUpperCase()}_FAILED`);
  }
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

async function getRuntimeConfig(): Promise<RuntimeConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("telegram_get_runtime_configuration");
  if (error) throw new Error("TELEGRAM_CONFIG_READ_FAILED");
  return data && typeof data === "object" ? data as RuntimeConfig : null;
}

async function requireSuperAdmin(request: Request): Promise<{ userId: string } | { response: Response }> {
  if (!supabase) return { response: jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503) };
  const jwt = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { response: jsonResponse({ error: "AUTH_REQUIRED" }, 401) };
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) return { response: jsonResponse({ error: "INVALID_SESSION" }, 401) };
  const { data: profile, error: profileError } = await supabase.from("admin_profiles").select("role,status").eq("auth_user_id", userData.user.id).maybeSingle();
  if (profileError) return { response: jsonResponse({ error: "ADMIN_CHECK_FAILED" }, 503) };
  if (profile?.status !== "ACTIVE" || profile?.role !== "SUPER_ADMIN") return { response: jsonResponse({ error: "FORBIDDEN" }, 403) };
  return { userId: userData.user.id };
}

async function telegramCall<T>(token: string, method: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, init);
  const result = await response.json() as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new TelegramApiError(method, result.description ?? null, result.error_code ?? null);
  }
  return result.result;
}

function getWebhookUrl(runtime: RuntimeConfig): string {
  const baseUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
  const pathId = typeof runtime.webhook_path_id === "string" ? runtime.webhook_path_id.trim() : "";
  return pathId ? `${baseUrl}/${encodeURIComponent(pathId)}` : baseUrl;
}

function isConnectedWebhook(url: string | undefined, expectedUrl: string): boolean {
  if (!url) return false;
  const baseUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
  return url === expectedUrl || url === baseUrl;
}

function telegramErrorDetail(error: unknown, fallback: string): string {
  if (!(error instanceof TelegramApiError) || !error.description) return fallback;
  return `${fallback} Telegram: ${error.description.slice(0, 180)}`;
}

async function configureWebhook(request: Request): Promise<Response> {
  const authorization = await requireSuperAdmin(request);
  if ("response" in authorization) return authorization.response;
  if (!supabase || !supabaseUrl) return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503);

  let body: { bot_token?: unknown };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "INVALID_JSON" }, 400); }

  const submittedToken = typeof body.bot_token === "string" ? body.bot_token.trim() : "";
  let runtime = await getRuntimeConfig();
  let replaced = false;
  let previousBotUsername: string | null = null;

  if (submittedToken) {
    if (submittedToken.length < 30 || submittedToken.length > 256 || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(submittedToken)) {
      return jsonResponse({ error: "INVALID_BOT_TOKEN", detail: "Format token BotFather tidak valid." }, 400);
    }

    let bot: TelegramBot;
    try { bot = await telegramCall<TelegramBot>(submittedToken, "getMe"); }
    catch { return jsonResponse({ error: "INVALID_BOT_TOKEN", detail: "Token ditolak Telegram. Salin ulang dari BotFather." }, 400); }
    if (!bot.is_bot || !bot.username || !/bot$/i.test(bot.username)) {
      return jsonResponse({ error: "INVALID_BOT_ACCOUNT", detail: "Token tidak terhubung ke akun bot Telegram yang valid." }, 400);
    }

    replaced = Boolean(runtime?.bot_id && String(runtime.bot_id) !== String(bot.id));
    previousBotUsername = replaced ? runtime?.bot_username ?? null : null;
    if (replaced && runtime?.bot_token) {
      try {
        await telegramCall<true>(runtime.bot_token, "deleteWebhook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ drop_pending_updates: false }),
        });
      } catch {
        return jsonResponse({ error: "OLD_BOT_DISCONNECT_FAILED", detail: "Bot lama belum berhasil dilepas. Coba lagi sebentar." }, 502);
      }
    }

    const { error: storeError } = await supabase.rpc("telegram_store_configuration", {
      p_bot_token: submittedToken,
      p_bot_id: bot.id,
      p_bot_username: bot.username,
      p_actor_id: authorization.userId,
    });
    if (storeError) return jsonResponse({ error: "BOT_TOKEN_STORE_FAILED" }, 503);
    runtime = await getRuntimeConfig();
  }

  if (!runtime?.bot_token || !runtime.webhook_secret) return jsonResponse({ error: "BOT_TOKEN_REQUIRED", detail: "Masukkan token BotFather terlebih dahulu." }, 400);

  const webhookUrl = getWebhookUrl(runtime);
  try {
    await telegramCall<true>(runtime.bot_token, "setWebhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: runtime.webhook_secret,
        drop_pending_updates: false,
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "my_chat_member", "chat_member"],
      }),
    });
  } catch (error) {
    console.error("Telegram setWebhook failed", {
      error_code: error instanceof TelegramApiError ? error.errorCode : null,
      description: error instanceof TelegramApiError ? error.description : null,
    });
    return jsonResponse({
      error: "TELEGRAM_SET_WEBHOOK_FAILED",
      detail: telegramErrorDetail(error, "Telegram gagal memasang webhook."),
    }, 502);
  }

  const [bot, webhookInfo] = await Promise.all([
    telegramCall<TelegramBot>(runtime.bot_token, "getMe"),
    telegramCall<TelegramWebhookInfo>(runtime.bot_token, "getWebhookInfo"),
  ]);
  await supabase.from("audit_logs").insert({
    actor_type: "ADMIN", actor_id: authorization.userId,
    action: "TELEGRAM_WEBHOOK_CONFIGURED",
    entity_type: "telegram_bot",
    summary: { bot_id: bot.id, bot_username: bot.username ?? null, previous_bot_username: previousBotUsername, pending_update_count: webhookInfo.pending_update_count ?? null },
  });

  return jsonResponse({
    ok: true, configured: true, connected: isConnectedWebhook(webhookInfo.url, webhookUrl),
    bot_username: bot.username ?? null, pending_update_count: webhookInfo.pending_update_count ?? 0,
    last_error_message: webhookInfo.last_error_message ?? null, replaced, previous_bot_username: previousBotUsername,
  });
}

async function getBotStatus(request: Request): Promise<Response> {
  const authorization = await requireSuperAdmin(request);
  if ("response" in authorization) return authorization.response;
  if (!supabaseUrl) return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503);
  const runtime = await getRuntimeConfig();
  if (!runtime?.bot_token || !runtime.webhook_secret) return jsonResponse({ ok: true, configured: false, connected: false });
  try {
    const [bot, webhookInfo] = await Promise.all([
      telegramCall<TelegramBot>(runtime.bot_token, "getMe"),
      telegramCall<TelegramWebhookInfo>(runtime.bot_token, "getWebhookInfo"),
    ]);
    const webhookUrl = getWebhookUrl(runtime);
    return jsonResponse({ ok: true, configured: true, connected: isConnectedWebhook(webhookInfo.url, webhookUrl), bot_username: bot.username ?? runtime.bot_username ?? null, configured_at: runtime.configured_at ?? null, pending_update_count: webhookInfo.pending_update_count ?? 0, last_error_message: webhookInfo.last_error_message ?? null });
  } catch {
    return jsonResponse({ ok: true, configured: true, connected: false, bot_username: runtime.bot_username ?? null, configured_at: runtime.configured_at ?? null, error: "SAVED_TOKEN_INVALID" });
  }
}

async function receiveTelegramUpdate(request: Request): Promise<Response> {
  if (!supabase) return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503);
  let runtime: RuntimeConfig | null;
  try { runtime = await getRuntimeConfig(); }
  catch { return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503); }
  if (!runtime?.webhook_secret) return jsonResponse({ error: "SERVICE_NOT_CONFIGURED" }, 503);
  return createTelegramWebhookHandler({
    secret: runtime.webhook_secret,
    async ingest(updateId, payload) {
      const { data, error } = await supabase.rpc("ingest_telegram_update", { p_update_id: updateId, p_payload: payload });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("ingest RPC returned no result");
      return { accepted: Boolean(row.accepted), duplicate: Boolean(row.duplicate), jobId: row.job_id ?? null };
    },
  })(request);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method === "PUT") return withCors(await configureWebhook(request));
  if (request.method === "GET") return withCors(await getBotStatus(request));
  if (request.method === "POST") return withCors(await receiveTelegramUpdate(request));
  return withCors(jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, { allow: "GET, PUT, POST" }));
});
