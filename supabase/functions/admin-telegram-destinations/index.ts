import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { jsonResponse } from "../_shared/http.ts";

const allowedOrigin = "https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site";
const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  vary: "origin",
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

type RuntimeConfig = { bot_token?: string | null; bot_id?: string | null };
type TelegramEnvelope<T> = { ok?: boolean; result?: T; description?: string };
type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  linked_chat_id?: number;
};
type TelegramMember = { status: string };

async function telegramCall<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TelegramEnvelope<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED:${payload.description ?? "unknown"}`);
  }
  return payload.result;
}

function normalizePublicTelegramUrl(value: unknown): { url: string; handle: string } {
  const raw = String(value ?? "").trim();
  const username = raw.startsWith("@")
    ? raw.slice(1)
    : raw.match(/^https:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i)?.[1] ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new Error("PUBLIC_TELEGRAM_USERNAME_REQUIRED");
  }
  return { url: `https://t.me/${username}`, handle: `@${username}` };
}

function isAdmin(member: TelegramMember): boolean {
  return member.status === "creator" || member.status === "administrator";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, corsHeaders);

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: actorData, error: actorError } = await service.auth.getUser(bearer);
  if (actorError || !actorData.user) return jsonResponse({ error: "UNAUTHORIZED" }, 401, corsHeaders);
  const { data: profile } = await service.from("admin_profiles").select("role,status")
    .eq("auth_user_id", actorData.user.id).maybeSingle();
  if (!profile || profile.role !== "SUPER_ADMIN" || profile.status !== "ACTIVE") {
    return jsonResponse({ error: "OWNER_ACCESS_REQUIRED" }, 403, corsHeaders);
  }

  let payload: { channel_url?: unknown; discussion_url?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "INVALID_JSON" }, 400, corsHeaders);
  }

  try {
    const channelInput = normalizePublicTelegramUrl(payload.channel_url);
    const discussionInput = normalizePublicTelegramUrl(payload.discussion_url);
    const { data: runtimeData, error: runtimeError } = await service.rpc("telegram_get_runtime_configuration");
    if (runtimeError || !runtimeData || typeof runtimeData !== "object") throw new Error("BOT_NOT_CONFIGURED");
    const runtime = runtimeData as RuntimeConfig;
    const botId = Number(runtime.bot_id);
    if (!runtime.bot_token || !Number.isSafeInteger(botId)) throw new Error("BOT_NOT_CONFIGURED");

    const [channel, discussion] = await Promise.all([
      telegramCall<TelegramChat>(runtime.bot_token, "getChat", { chat_id: channelInput.handle }),
      telegramCall<TelegramChat>(runtime.bot_token, "getChat", { chat_id: discussionInput.handle }),
    ]);
    if (channel.type !== "channel") throw new Error("CHANNEL_TYPE_REQUIRED");
    if (!['group', 'supergroup'].includes(discussion.type)) throw new Error("DISCUSSION_GROUP_REQUIRED");

    const [channelBot, discussionBot] = await Promise.all([
      telegramCall<TelegramMember>(runtime.bot_token, "getChatMember", { chat_id: channel.id, user_id: botId }),
      telegramCall<TelegramMember>(runtime.bot_token, "getChatMember", { chat_id: discussion.id, user_id: botId }),
    ]);
    if (!isAdmin(channelBot) || !isAdmin(discussionBot)) throw new Error("BOT_ADMIN_REQUIRED");
    if (channel.linked_chat_id !== discussion.id) throw new Error("CHANNEL_GROUP_NOT_LINKED");

    const { data: existing } = await service.from("system_settings").select("value")
      .eq("key", "bot.onboarding").maybeSingle();
    const onboarding = existing?.value && typeof existing.value === "object" && !Array.isArray(existing.value)
      ? existing.value as Record<string, unknown>
      : {};
    const updatedOnboarding = {
      ...onboarding,
      channel_url: channelInput.url,
      discussion_url: discussionInput.url,
    };

    const { error: saveError } = await service.from("system_settings").upsert([
      {
        key: "telegram.channel_id", category: "TELEGRAM", value: String(channel.id),
        description: "Channel produksi aktif yang sudah diverifikasi.", status: "ACTIVE", updated_by: actorData.user.id,
      },
      {
        key: "telegram.discussion_id", category: "TELEGRAM", value: String(discussion.id),
        description: "Grup diskusi produksi aktif yang sudah diverifikasi.", status: "ACTIVE", updated_by: actorData.user.id,
      },
      {
        key: "bot.onboarding", category: "TELEGRAM", value: updatedOnboarding,
        description: "Teks, tombol, dan tautan onboarding Telegram.", status: "ACTIVE", updated_by: actorData.user.id,
      },
    ], { onConflict: "key" });
    if (saveError) throw new Error("TELEGRAM_DESTINATIONS_SAVE_FAILED");

    await service.from("audit_logs").insert({
      actor_type: "ADMIN",
      actor_id: actorData.user.id,
      action: "TELEGRAM_PRODUCTION_DESTINATIONS_UPDATED",
      entity_type: "SYSTEM_SETTING",
      summary: {
        channel_id: channel.id,
        channel_title: channel.title ?? channel.username ?? channelInput.handle,
        channel_url: channelInput.url,
        discussion_id: discussion.id,
        discussion_title: discussion.title ?? discussion.username ?? discussionInput.handle,
        discussion_url: discussionInput.url,
      },
    });

    return jsonResponse({
      ok: true,
      channel: { id: channel.id, title: channel.title ?? channelInput.handle, url: channelInput.url },
      discussion: { id: discussion.id, title: discussion.title ?? discussionInput.handle, url: discussionInput.url },
    }, 200, corsHeaders);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN_ERROR";
    const details: Record<string, string> = {
      PUBLIC_TELEGRAM_USERNAME_REQUIRED: "Gunakan username publik, misalnya https://t.me/promptviralchannel.",
      BOT_NOT_CONFIGURED: "Hubungkan bot produksi terlebih dahulu.",
      CHANNEL_TYPE_REQUIRED: "Link Channel tidak mengarah ke Telegram Channel.",
      DISCUSSION_GROUP_REQUIRED: "Link Grup tidak mengarah ke grup Telegram.",
      BOT_ADMIN_REQUIRED: "Jadikan bot sebagai Admin di Channel dan Grup terlebih dahulu.",
      CHANNEL_GROUP_NOT_LINKED: "Hubungkan Grup sebagai ruang diskusi Channel terlebih dahulu.",
      TELEGRAM_GETCHAT_FAILED: "Channel atau Grup tidak ditemukan. Pastikan username publiknya benar.",
      TELEGRAM_GETCHATMEMBER_FAILED: "Bot tidak dapat memeriksa akses Admin di Channel atau Grup.",
      TELEGRAM_DESTINATIONS_SAVE_FAILED: "Tujuan Telegram gagal disimpan.",
    };
    return jsonResponse({ error: code, detail: details[code] ?? "Pengaturan Channel dan Grup gagal diperbarui." }, 400, corsHeaders);
  }
});
