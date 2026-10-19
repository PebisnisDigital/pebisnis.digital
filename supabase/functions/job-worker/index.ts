import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  Drawables,
  initializeImageMagick,
  MagickColor,
  MagickFormat,
  MagickImage,
  Point,
} from "npm:@imagemagick/magick-wasm@0.0.30";
import { jsonResponse } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");

function getServerKey(): string | null {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Fall back while staging completes key rotation.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

const serverKey = getServerKey();
if (!supabaseUrl || !serverKey) throw new Error("Missing Supabase runtime configuration");
const supabase = createClient(supabaseUrl, serverKey, { auth: { persistSession: false } });

let imageMagickReady: Promise<void> | null = null;

function ensureImageMagick(): Promise<void> {
  if (!imageMagickReady) {
    imageMagickReady = (async () => {
      const wasmBytes = await Deno.readFile(
        new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")),
      );
      await initializeImageMagick(wasmBytes);
    })();
  }
  return imageMagickReady;
}

type TelegramIdentity = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};
type TelegramChat = { id: number; type: string };
type TelegramForwardOrigin = { type?: string; chat?: TelegramChat; message_id?: number };
type TelegramPhotoSize = { file_id: string; file_unique_id?: string; width?: number; height?: number; file_size?: number };
type TelegramDocument = { file_id: string; file_unique_id?: string; file_name?: string; mime_type?: string; file_size?: number };
type TelegramMessage = {
  message_id?: number;
  message_thread_id?: number;
  chat?: TelegramChat;
  from?: TelegramIdentity;
  sender_chat?: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  is_automatic_forward?: boolean;
  forward_origin?: TelegramForwardOrigin;
  forward_from_message_id?: number;
  reply_to_message?: TelegramMessage;
};
type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: { id?: string; from?: TelegramIdentity; data?: string; message?: TelegramMessage };
  chat_member?: TelegramChatMemberUpdated;
};
type RuntimeConfig = { bot_token?: string | null; bot_username?: string | null };
type SentMessage = { message_id: number };
type TelegramFile = { file_id: string; file_unique_id?: string; file_size?: number; file_path?: string };
type ChannelPost = {
  id: string;
  image_path: string | null;
  caption: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHING" | "SENT" | "FAILED" | "OUTCOME_UNKNOWN" | "CANCELLED";
};
type TelegramApiEnvelope<T> = { ok?: boolean; result?: T; error_code?: number; description?: string };
type ChatMember = { status: string; is_member?: boolean; user?: TelegramIdentity };
type TelegramChatMemberUpdated = {
  chat: TelegramChat;
  from?: TelegramIdentity;
  old_chat_member: ChatMember;
  new_chat_member: ChatMember;
};
type ChatDetails = { username?: string; invite_link?: string };
type OnboardingSettings = {
  welcome_title: string;
  welcome_body: string;
  success_text: string;
  channel_button: string;
  discussion_button: string;
  channel_url: string;
  discussion_url: string;
};
type MenuPayload = {
  text: string;
  reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };
};
type CommentRule = {
  id: string;
  keywords: string[];
  match_mode: "EXACT" | "WORD" | "CONTAINS";
  public_success_reply: string;
  start_required_reply: string;
  membership_required_reply: string;
};
type CommentClaim = {
  id: string;
  status: string;
  next_part_index: number;
  dm_message_ids: number[];
  public_reply_message_id: number | null;
};
type PromptExpirySettings = {
  delete_after_seconds: number;
  expiry_notice: string;
  offer_text: string;
  offer_button_text: string;
  offer_button_url: string;
};
type EmergencyControls = {
  channel_posting_enabled: boolean;
  free_claim_enabled: boolean;
  checkout_enabled: boolean;
  follow_up_enabled: boolean;
  broadcast_enabled: boolean;
};
type ExpiringClaim = {
  id: string;
  user_id: string;
  status: string;
  expiry_status: string;
  dm_message_ids: number[];
  deleted_message_ids: number[];
  expiry_notice_message_id: number | null;
  offer_message_id: number | null;
  upsell_mode: "NONE" | "PROMPT_VIRAL";
};
type BroadcastCampaign = {
  id: string;
  message_parts: unknown;
  media_type: "PHOTO" | "VIDEO" | null;
  media_url: string | null;
  button_text: string;
  button_url: string;
  status: string;
};
type BroadcastRecipient = {
  id: string;
  campaign_id: string;
  user_id: string;
  private_chat_id: number;
  status: string;
  next_part_index: number;
  media_sent: boolean;
  telegram_message_ids: number[];
};
type FollowUpEnrollment = {
  id: string;
  automation_id: string;
  user_id: string;
  source_id: string;
  private_chat_id: number;
  status: string;
  current_step: number;
  telegram_message_ids: number[];
};
type CheckoutSettings = {
  enabled: boolean;
  product_label: string;
  amount_idr: number;
  manual_enabled: boolean;
  bank_name: string;
  account_number: string;
  account_name: string;
  gateway_enabled: boolean;
  gateway_provider: string;
  buatqris_enabled: boolean;
  buatqris_account_id: string;
  buatqris_mode: "SANDBOX" | "LIVE";
  buatqris_qris_method: "qris_one" | "qris_two" | "qris_three" | "qris_four";
  buatqris_umkm_name: string;
  coupon_enabled: boolean;
  coupon_code: string;
  coupon_discount_type: "FIXED" | "PERCENT";
  coupon_discount_value: number;
  unique_code_enabled: boolean;
  unique_code_direction: "ADD" | "SUBTRACT";
  unique_code_min: number;
  unique_code_max: number;
  payment_note: string;
  access_text: string;
  access_button_text: string;
  access_button_url: string;
};
type OrderExpirySettings = {
  enabled: boolean;
  expire_after_seconds: number;
  expiry_notice: string;
};
type AdminNotificationSettings = {
  enabled: boolean;
  recipient_user_id: string | null;
  review_reminder_minutes: number;
  admin_url: string;
  pending_order_text: string;
  cancelled_order_text: string;
  paid_order_text: string;
};
type BotNotificationSettings = {
  start_pending_text: string;
  start_group_text: string;
  start_check_text: string;
  start_active_text: string;
  join_channel_button_text: string;
  join_discussion_button_text: string;
  buy_button_text: string;
  reference_image_caption: string;
  free_claim_paused_reply: string;
  open_bot_button_text: string;
  check_again_button_text: string;
  check_membership_button_text: string;
  checkout_closed_text: string;
  broadcast_unsubscribed_text: string;
  broadcast_resubscribed_text: string;
  proof_rejected_text: string;
  no_pending_order_text: string;
  proof_already_received_text: string;
  invalid_proof_format_text: string;
  proof_too_large_text: string;
  inactive_order_text: string;
  proof_upload_instruction_text: string;
  checkout_paused_text: string;
  admin_new_order_text: string;
  admin_payment_proof_text: string;
  admin_payment_reminder_text: string;
  admin_order_expired_text: string;
  admin_open_orders_button_text: string;
};
type PurchaseOrder = {
  id: string;
  order_number: string;
  user_id: string;
  product_label: string;
  amount_idr: number;
  base_amount_idr?: number;
  discount_amount_idr?: number;
  unique_code_amount_idr?: number;
  coupon_code?: string | null;
  private_chat_id: number;
  status: string;
  proof_revision?: number;
  access_delivery_status: string;
  access_message_id: number | null;
  payment_gateway?: string | null;
  gateway_transaction_id?: string | null;
  gateway_payment_url?: string | null;
  gateway_qr_url?: string | null;
  gateway_status?: string | null;
  gateway_requested_amount_idr?: number | null;
  gateway_total_amount_idr?: number | null;
  gateway_is_test?: boolean;
};

type BuatQrisRuntimeConfig = {
  enabled: boolean;
  account_id: string;
  secret_token: string;
  mode: "SANDBOX" | "LIVE";
  qris_method: "qris_one" | "qris_two" | "qris_three" | "qris_four";
  umkm_name: string;
};

type BuatQrisCreateResponse = {
  success?: boolean;
  message?: string;
  data?: {
    transaction_id?: string | number;
    qr_url?: string;
    qris_image?: string;
    payment_url?: string;
    amount?: number | string;
    total_amount?: number | string;
    status?: string;
  };
};
type MemberIdentity = {
  telegram_user_id: number | string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};
type PaymentProofCandidate = {
  mediaType: "PHOTO" | "DOCUMENT";
  fileId: string;
  fileUniqueId: string | null;
  fileSize: number;
  mimeType: string;
  originalName: string | null;
};

class TelegramApiError extends Error {
  constructor(readonly code: number, readonly description: string, readonly outcomeUnknown = false) {
    super(`TELEGRAM_API_${code}:${description}`);
  }
}

class OutcomeUnknownError extends Error {}

const DEFAULT_ONBOARDING: OnboardingSettings = {
  welcome_title: "Selamat datang di PEBISNIS DIGITAL TELEGRAM",
  welcome_body: "Sebelum mengambil materi gratis, gabung dulu ke Channel dan Grup Diskusi. Setelah itu tekan CEK KEANGGOTAAN.",
  success_text: "Akses aktif. Sekarang kamu sudah bisa meminta materi gratis dari postingan Channel.",
  channel_button: "GABUNG CHANNEL",
  discussion_button: "GABUNG GRUP",
  channel_url: "",
  discussion_url: "",
};

const DEFAULT_PROMPT_EXPIRY: PromptExpirySettings = {
  delete_after_seconds: 21_600,
  expiry_notice: "⏰ Materi gratis tadi sudah dihapus otomatis.",
  offer_text: "Ingin belajar bisnis digital lebih lengkap?\n\nPEBISNIS DIGITAL TELEGRAM menyediakan kumpulan materi yang bisa dibuka kapan saja.\n\nKetik BELI untuk lanjut.",
  offer_button_text: "BELI SEKARANG",
  offer_button_url: "",
};

const DEFAULT_EMERGENCY_CONTROLS: EmergencyControls = {
  channel_posting_enabled: true,
  free_claim_enabled: true,
  checkout_enabled: true,
  follow_up_enabled: true,
  broadcast_enabled: true,
};

const DEFAULT_CHECKOUT: CheckoutSettings = {
  enabled: false,
  product_label: "PEBISNIS DIGITAL TELEGRAM",
  amount_idr: 0,
  manual_enabled: true,
  bank_name: "",
  account_number: "",
  account_name: "",
  gateway_enabled: false,
  gateway_provider: "BUATQRIS",
  buatqris_enabled: false,
  buatqris_account_id: "",
  buatqris_mode: "SANDBOX",
  buatqris_qris_method: "qris_two",
  buatqris_umkm_name: "PEBISNIS",
  coupon_enabled: false,
  coupon_code: "",
  coupon_discount_type: "FIXED",
  coupon_discount_value: 0,
  unique_code_enabled: false,
  unique_code_direction: "ADD",
  unique_code_min: 1,
  unique_code_max: 999,
  payment_note: "Transfer sesuai nominal lalu kirim bukti pembayaran kepada Admin.",
  access_text: "✅ Pembayaran sudah dikonfirmasi. Akses PEBISNIS DIGITAL TELEGRAM kamu sudah aktif.",
  access_button_text: "",
  access_button_url: "",
};

const DEFAULT_ORDER_EXPIRY: OrderExpirySettings = {
  enabled: true,
  expire_after_seconds: 840,
  expiry_notice: "⏰ Waktu pembayaran untuk pesanan ini sudah habis. Pesanan ditutup otomatis. Tekan tombol di bawah jika masih ingin membeli.",
};

const DEFAULT_ADMIN_NOTIFICATIONS: AdminNotificationSettings = {
  enabled: false,
  recipient_user_id: null,
  review_reminder_minutes: 15,
  admin_url: "https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/dashboard",
  pending_order_text: "Halo {name}, ⏳ pesanan {order_number} dibuat dan sedang menunggu pembayaran.",
  cancelled_order_text: "Halo {name}, ❌ pesanan {order_number} sudah dibatalkan. Jika masih ingin membeli, silakan buat pesanan baru.",
  paid_order_text: "Halo {name}, ✅ pembayaran {order_number} sudah dikonfirmasi. Akses PEBISNIS DIGITAL TELEGRAM kamu sudah aktif.",
};
const DEFAULT_BOT_NOTIFICATIONS: BotNotificationSettings = {
  start_pending_text: "👋 LANGKAH 1 DARI 3\n\nGabung <b>CHANNEL PEBISNIS DIGITAL</b> dulu ya Kak 👇",
  start_group_text: "👋 LANGKAH 2 DARI 3\n\nSip, Channel sudah beres. Sekarang masuk ke <b>GRUP PEBISNIS DIGITAL</b> ya Kak 👇",
  start_check_text: "👋 LANGKAH 3 DARI 3\n\nSekarang tekan <b>CEK KEANGGOTAAN</b> untuk memastikan Channel dan Grup sudah lengkap.",
  start_active_text: "✅ AKSES AKTIF\n\nAkses aktif. Sekarang kamu sudah bisa meminta materi gratis dari postingan Channel.\n\nKalau melihat posting materi di Channel, ketik MAU di komentarnya. Bot akan mengirim materi yang tepat ke japri ini.",
  join_channel_button_text: "MASUK CHANNEL",
  join_discussion_button_text: "MASUK GRUP",
  buy_button_text: "BELI SEKARANG",
  reference_image_caption: "Gambar referensi untuk materi ini 👇",
  free_claim_paused_reply: "⏸️ Pembagian materi gratis sedang dijeda sementara oleh Admin.",
  open_bot_button_text: "BUKA BOT",
  check_again_button_text: "CEK LAGI",
  check_membership_button_text: "CEK KEANGGOTAAN",
  checkout_closed_text: "Checkout PEBISNIS DIGITAL TELEGRAM belum dibuka. Tunggu pengumuman dari Admin, ya.",
  broadcast_unsubscribed_text: "✅ Broadcast PEBISNIS DIGITAL TELEGRAM sudah dihentikan. Pesan penting dari bot dan materi yang kamu minta tetap bisa masuk.",
  broadcast_resubscribed_text: "✅ Broadcast PEBISNIS DIGITAL TELEGRAM aktif kembali. Kamu bisa menerima info dan penawaran terbaru dari bot ini.",
  proof_rejected_text: "❌ Bukti transfer {order_number} belum bisa diterima.\n\nAlasan: {reason}\n\nKirim ulang foto bukti transfer langsung ke chat ini.",
  no_pending_order_text: "Belum ada pesanan yang menunggu pembayaran. Ketik BELI dulu, lalu kirim bukti transfer di chat ini.",
  proof_already_received_text: "✅ Bukti untuk {order_number} sudah diterima dan menunggu verifikasi Admin.",
  invalid_proof_format_text: "Format bukti belum diterima. Kirim sebagai foto, JPG, PNG, WEBP, atau PDF.",
  proof_too_large_text: "Ukuran bukti maksimal 10 MB. Kompres gambarnya, lalu kirim ulang.",
  inactive_order_text: "Pesanan ini sudah tidak menunggu pembayaran. Ketik BELI untuk melihat pesanan yang aktif.",
  proof_upload_instruction_text: "📤 UPLOAD BUKTI TRANSFER\n\nPesanan: {order_number}\n\nSekarang kirim foto bukti transfer atau file JPG, PNG, WEBP, atau PDF ke chat ini. Maksimal 10 MB.",
  checkout_paused_text: "⏸️ Checkout sedang dijeda sementara oleh Admin. Pesanan lama dan bukti transfer tetap aman.",
  admin_new_order_text: "🛒 ORDER BARU\n\n{order_number} · {buyer}\n{product} · {amount}\n\nStatus: MENUNGGU TRANSFER",
  admin_payment_proof_text: "🧾 BUKTI TRANSFER MASUK\n\n{order_number} · {buyer}\nNominal order: {amount}\n\nBukti menunggu ACC atau penolakan Admin.",
  admin_payment_reminder_text: "⏰ BUKTI BELUM DIPERIKSA\n\n{order_number} · {buyer}\nBukti transfer masih menunggu keputusan Admin.",
  admin_order_expired_text: "⌛ ORDER KEDALUWARSA\n\n{order_number} · {buyer}\n{amount}\n\nFollow-up sudah dihentikan otomatis.",
  admin_open_orders_button_text: "BUKA PESANAN",
};

function retryAt(attemptCount: number): string {
  const delaySeconds = Math.min(15 * (2 ** Math.max(attemptCount - 1, 0)), 300);
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

async function telegramCall<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TelegramApiError(0, "NETWORK_OUTCOME_UNKNOWN", true);
  }
  let payload: TelegramApiEnvelope<T>;
  try {
    payload = await response.json() as TelegramApiEnvelope<T>;
  } catch {
    throw new TelegramApiError(response.status, "INVALID_TELEGRAM_RESPONSE", true);
  }
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramApiError(payload.error_code ?? response.status, payload.description ?? "Telegram request failed");
  }
  return payload.result;
}

function escapeTelegramHtml(value: string): string {
  const entities: string[] = [];
  const protectedValue = value.replace(/&(amp|lt|gt|quot);/gi, (entity) => {
    const token = `\uE100${entities.length}\uE101`;
    entities.push(entity.toLowerCase());
    return token;
  });
  return entities.reduce(
    (html, entity, index) => html.replace(`\uE100${index}\uE101`, entity),
    protectedValue.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  );
}

function normalizeTelegramHtmlTag(raw: string): string | null {
  const simple = raw.match(/^<\s*(\/?)\s*(b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\s*>$/i);
  if (simple) return `<${simple[1] ? "/" : ""}${simple[2].toLowerCase()}>`;
  const quote = raw.match(/^<\s*(\/?)\s*blockquote(\s+expandable)?\s*>$/i);
  if (quote) return quote[1] ? "</blockquote>" : `<blockquote${quote[2] ? " expandable" : ""}>`;
  if (/^<\s*\/\s*a\s*>$/i.test(raw)) return "</a>";
  const link = raw.match(/^<\s*a\s+href\s*=\s*(["'])(.*?)\1\s*>$/i);
  if (!link) return null;
  try {
    const url = new URL(link[2]);
    if (!["http:", "https:", "tg:"].includes(url.protocol)) return null;
    const href = url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `<a href="${href}">`;
  } catch { return null; }
}

function sanitizeTelegramHtml(value: string): string {
  const tokens: string[] = [];
  const protectedValue = value.replace(/<[^>]*>/g, (raw) => {
    const tag = normalizeTelegramHtmlTag(raw);
    if (!tag) return raw;
    const token = `\uE000${tokens.length}\uE001`;
    tokens.push(tag);
    return token;
  });
  return tokens.reduce((html, tag, index) => html.replace(`\uE000${index}\uE001`, tag), escapeTelegramHtml(protectedValue));
}

function plainTelegramText(value: string): string {
  return sanitizeTelegramHtml(value)
    .replace(/<[^>]*>/g, "")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function isTelegramFormattingError(error: unknown): boolean {
  return error instanceof TelegramApiError
    && error.code === 400
    && /parse entities|unsupported start tag|can't find end|wrong entity/i.test(error.description);
}

async function telegramFormattedCall<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  field: "text" | "caption" = "text",
): Promise<T> {
  const limit = field === "caption" ? 1024 : 4096;
  const source = String(body[field] ?? "").slice(0, limit);
  try {
    return await telegramCall<T>(token, method, { ...body, [field]: sanitizeTelegramHtml(source), parse_mode: "HTML" });
  } catch (error) {
    if (!isTelegramFormattingError(error)) throw error;
    const fallback = { ...body, [field]: plainTelegramText(source) };
    delete fallback.parse_mode;
    return telegramCall<T>(token, method, fallback);
  }
}

async function telegramSendPhotoBytes(
  token: string,
  body: { chat_id: number; caption: string; reply_markup: ReturnType<typeof checkoutButtons>; parse_mode?: "HTML" },
  photo: Uint8Array,
): Promise<SentMessage> {
  const form = new FormData();
  form.set("chat_id", String(body.chat_id));
  form.set("caption", body.caption);
  if (body.parse_mode) form.set("parse_mode", body.parse_mode);
  form.set("reply_markup", JSON.stringify(body.reply_markup));
  form.set("photo", new Blob([photo], { type: "image/png" }), "qris-pebisnis-digital-telegram.png");

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new TelegramApiError(0, "NETWORK_OUTCOME_UNKNOWN", true);
  }
  let payload: TelegramApiEnvelope<SentMessage>;
  try {
    payload = await response.json() as TelegramApiEnvelope<SentMessage>;
  } catch {
    throw new TelegramApiError(response.status, "INVALID_TELEGRAM_RESPONSE", true);
  }
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramApiError(payload.error_code ?? response.status, payload.description ?? "Telegram request failed");
  }
  return payload.result;
}

async function getBotToken(): Promise<string> {
  const { data, error } = await supabase.rpc("telegram_get_runtime_configuration");
  if (error || !data || typeof data !== "object") throw new Error("TELEGRAM_CONFIG_READ_FAILED");
  const token = (data as RuntimeConfig).bot_token;
  if (!token) throw new Error("TELEGRAM_BOT_NOT_CONFIGURED");
  return token;
}

async function getRuntimeConfiguration(): Promise<RuntimeConfig> {
  const { data, error } = await supabase.rpc("telegram_get_runtime_configuration");
  if (error || !data || typeof data !== "object") throw new Error("TELEGRAM_CONFIG_READ_FAILED");
  return data as RuntimeConfig;
}

async function getSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error("SETTING_READ_FAILED");
  return data?.value as T ?? null;
}

async function getBotNotificationSettings(): Promise<BotNotificationSettings> {
  return {
    ...DEFAULT_BOT_NOTIFICATIONS,
    ...((await getSetting<Partial<BotNotificationSettings>>("bot.notifications")) ?? {}),
  };
}

function chatIdFromSetting(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.chat_id === "string" || typeof record.chat_id === "number") return String(record.chat_id);
  }
  throw new Error("TELEGRAM_CHAT_NOT_CONFIGURED");
}

function joined(member: ChatMember): boolean {
  if (["creator", "administrator", "member"].includes(member.status)) return true;
  return member.status === "restricted" && member.is_member !== false;
}

async function resolveJoinUrl(token: string, chatId: string, override: string): Promise<string | null> {
  if (/^https:\/\/t\.me\/[A-Za-z0-9_+\/-]+$/i.test(override)) return override;
  try {
    const chat = await telegramCall<ChatDetails>(token, "getChat", { chat_id: chatId });
    if (chat.username) return `https://t.me/${chat.username}`;
    if (chat.invite_link?.startsWith("https://t.me/")) return chat.invite_link;
  } catch {
    return null;
  }
  return null;
}

async function checkMembership(token: string, telegramUserId: number) {
  const [channelSetting, discussionSetting, savedOnboarding] = await Promise.all([
    getSetting<unknown>("telegram.channel_id"),
    getSetting<unknown>("telegram.discussion_id"),
    getSetting<Partial<OnboardingSettings>>("bot.onboarding"),
  ]);
  const channelId = chatIdFromSetting(channelSetting);
  const discussionId = chatIdFromSetting(discussionSetting);
  const settings = { ...DEFAULT_ONBOARDING, ...(savedOnboarding ?? {}) };
  const [channel, discussion, channelUrl, discussionUrl] = await Promise.all([
    telegramCall<ChatMember>(token, "getChatMember", { chat_id: channelId, user_id: telegramUserId }),
    telegramCall<ChatMember>(token, "getChatMember", { chat_id: discussionId, user_id: telegramUserId }),
    resolveJoinUrl(token, channelId, settings.channel_url),
    resolveJoinUrl(token, discussionId, settings.discussion_url),
  ]);
  return {
    channel,
    discussion,
    channelJoined: joined(channel),
    discussionJoined: joined(discussion),
    channelUrl,
    discussionUrl,
    settings,
  };
}

type OnboardingPhase = "START" | "MEMBERSHIP_CHANGE" | "CHECK";

function onboardingMessage(
  result: Awaited<ReturnType<typeof checkMembership>>,
  notifications: BotNotificationSettings,
  phase: OnboardingPhase,
): MenuPayload {
  const channelButton = result.channelUrl
    ? [{ text: `📣 ${notifications.join_channel_button_text}`.slice(0, 64), url: result.channelUrl }]
    : null;
  const groupButton = result.discussionUrl
    ? [{ text: `💬 ${notifications.join_discussion_button_text}`.slice(0, 64), url: result.discussionUrl }]
    : null;
  const checkButton = [{
    text: `✅ ${notifications.check_membership_button_text}`.slice(0, 64),
    callback_data: "onboarding:check",
  }];
  const missingLinkText = "\n\n⚠️ Tautan belum diatur Admin.";

  if (phase === "START") {
    if (!result.channelJoined) {
      return {
        text: `${notifications.start_pending_text}${channelButton ? "" : missingLinkText}`,
        reply_markup: { inline_keyboard: channelButton ? [channelButton] : [] },
      };
    }
    if (!result.discussionJoined) {
      return {
        text: `${notifications.start_group_text}${groupButton ? "" : missingLinkText}`,
        reply_markup: { inline_keyboard: groupButton ? [groupButton] : [] },
      };
    }
    return {
      text: notifications.start_check_text,
      reply_markup: { inline_keyboard: [checkButton] },
    };
  }

  if (phase === "MEMBERSHIP_CHANGE") {
    if (result.channelJoined && !result.discussionJoined) {
      return {
        text: `${notifications.start_group_text}${groupButton ? "" : missingLinkText}`,
        reply_markup: { inline_keyboard: groupButton ? [groupButton] : [] },
      };
    }
    return {
      text: notifications.start_check_text,
      reply_markup: { inline_keyboard: [checkButton] },
    };
  }

  if (result.channelJoined && result.discussionJoined) {
    return {
      text: notifications.start_active_text,
      reply_markup: { inline_keyboard: [checkButton] },
    };
  }

  const rows: MenuPayload["reply_markup"]["inline_keyboard"] = [];
  if (!result.channelJoined && channelButton) rows.push(channelButton);
  else if (!result.discussionJoined && groupButton) rows.push(groupButton);
  rows.push(checkButton);
  return {
    text: result.channelJoined ? notifications.start_group_text : notifications.start_pending_text,
    reply_markup: { inline_keyboard: rows },
  };
}

function parseStart(text?: string): { isStart: boolean; parameter: string | null } {
  const match = text?.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/i);
  return { isStart: Boolean(match), parameter: match?.[1] ?? null };
}

function isSubscribeCommand(text?: string): boolean {
  return /^\/subscribe(?:@[A-Za-z0-9_]+)?$/i.test(text?.trim() ?? "");
}

function isBuyCommand(text?: string): boolean {
  return /^(?:BELI|\/beli(?:@[A-Za-z0-9_]+)?)(?:\s+[A-Za-z0-9_-]{1,40})?$/i.test(text?.trim() ?? "");
}

function buyCouponCode(text?: string): string | null {
  const match = text?.trim().match(/^(?:BELI|\/beli(?:@[A-Za-z0-9_]+)?)\s+([A-Za-z0-9_-]{1,40})$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function paymentProofUploadOrderId(callbackAction: string | null): string | null {
  const match = callbackAction?.match(/^payment-proof:upload:([0-9a-f-]{36})$/i);
  return match?.[1] ?? null;
}

function checkoutButtons(order: PurchaseOrder, settings: CheckoutSettings) {
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  if (order.gateway_payment_url?.startsWith("https://")) rows.push([{ text: "▣ BAYAR DENGAN QRIS", url: order.gateway_payment_url }]);
  if (settings.manual_enabled) rows.push([{ text: "📤 UPLOAD BUKTI TF", callback_data: `payment-proof:upload:${order.id}` }]);
  return { inline_keyboard: rows };
}

function paymentProofUploadButton(orderId: string) {
  return { inline_keyboard: [[{ text: "📤 UPLOAD BUKTI TF", callback_data: `payment-proof:upload:${orderId}` }]] };
}

function formatRupiah(value: number): string {
  return `Rp${Math.max(0, Math.round(value)).toLocaleString("id-ID")}`;
}

function checkoutInstruction(order: PurchaseOrder, settings: CheckoutSettings): string {
  const baseAmount = Number(order.base_amount_idr ?? order.amount_idr);
  const discountAmount = Number(order.discount_amount_idr ?? 0);
  const uniqueAmount = Number(order.unique_code_amount_idr ?? 0);
  const lines = [
    "🧾 PESANAN PEBISNIS DIGITAL TELEGRAM",
    "",
    `Kode: ${order.order_number}`,
    `Produk: ${order.product_label}`,
    `Harga: ${formatRupiah(baseAmount)}`,
  ];
  if (discountAmount > 0) lines.push(`Kupon ${order.coupon_code ?? "PROMO"}: -${formatRupiah(discountAmount)}`);
  if (uniqueAmount !== 0) lines.push(`Kode unik: ${uniqueAmount > 0 ? "+" : "-"}${formatRupiah(Math.abs(uniqueAmount))}`);
  lines.push(`Total pesanan: ${formatRupiah(order.amount_idr)}`);
  if (order.gateway_transaction_id && order.gateway_payment_url) {
    lines.push(
      "",
      "▣ PEMBAYARAN BUATQRIS",
      `Total QRIS: ${formatRupiah(Number(order.gateway_total_amount_idr ?? order.amount_idr))}`,
      `ID transaksi: ${order.gateway_transaction_id}`,
      order.gateway_is_test ? "Mode: SANDBOX — tidak memakai uang asli" : "Mode: LIVE — pembayaran uang asli",
      "Tekan BAYAR DENGAN QRIS atau scan gambar QR di atas.",
    );
  }
  if (settings.manual_enabled) {
    lines.push(
      "",
      "🏦 TRANSFER MANUAL",
      `Transfer ke ${settings.bank_name}`,
      `No. rekening: ${settings.account_number}`,
      `Atas nama: ${settings.account_name}`,
    );
  }
  if (settings.payment_note.trim()) lines.push("", settings.payment_note.trim());
  if (settings.manual_enabled) lines.push("", "Jika transfer manual, kirim bukti melalui tombol. Pembayaran QRIS dikonfirmasi otomatis.");
  return lines.join("\n").slice(0, 4096);
}

const BITMAP_FONT: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function bitmapText(value: string, maxLength: number): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[—–]/g, "-").replace(/[^A-Z0-9 .:\/-]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function bitmapTextWidth(value: string, scale: number): number {
  return value.length ? (value.length * 6 - 1) * scale : 0;
}

function drawBitmapText(draw: Drawables, value: string, x: number, y: number, scale: number, color: string): void {
  draw.fillColor(new MagickColor(color)).strokeColor(new MagickColor("transparent")).strokeWidth(0);
  [...value].forEach((character, characterIndex) => {
    const glyph = BITMAP_FONT[character] ?? BITMAP_FONT[" "];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === "1") {
          const left = x + (characterIndex * 6 + columnIndex) * scale;
          const top = y + rowIndex * scale;
          draw.rectangle(left, top, left + scale - 1, top + scale - 1);
        }
      });
    });
  });
}

async function createBrandedQrisPhoto(order: PurchaseOrder, settings: CheckoutSettings): Promise<Uint8Array> {
  if (!order.gateway_qr_url?.startsWith("https://")) throw new Error("QRIS_IMAGE_URL_MISSING");
  const response = await fetch(order.gateway_qr_url, { signal: AbortSignal.timeout(12_000) });
  const contentType = (response.headers.get("content-type") ?? "image/png").split(";")[0].trim().toLowerCase();
  const qrBytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || !contentType.startsWith("image/") || qrBytes.length < 100 || qrBytes.length > 5_000_000) {
    throw new Error("QRIS_IMAGE_DOWNLOAD_FAILED");
  }

  await ensureImageMagick();
  const brand = bitmapText(settings.buatqris_umkm_name.trim() || "PEBISNIS", 15);
  const product = bitmapText(order.product_label, 46);
  const amount = bitmapText(formatRupiah(Number(order.gateway_total_amount_idr ?? order.amount_idr)), 18);
  const orderNumber = bitmapText(order.order_number, 20);
  const modeLabel = order.gateway_is_test ? "MODE TEST" : "PEMBAYARAN AMAN";
  const canvas = MagickImage.create(new MagickColor("#fffdf5"), 800, 1100);
  const draw = new Drawables();
  draw.fillColor(new MagickColor("#f4c400")).strokeColor(new MagickColor("#f4c400")).rectangle(0, 0, 799, 164);
  draw.fillColor(new MagickColor("#078f45")).strokeColor(new MagickColor("#078f45")).roundRectangle(48, 24, 112, 88, 16, 16);
  draw.fillColor(new MagickColor("#171914")).strokeColor(new MagickColor("#171914")).roundRectangle(558, 28, 750, 72, 18, 18);
  draw.fillColor(new MagickColor("#ffffff")).strokeColor(new MagickColor("#171914")).strokeWidth(7).roundRectangle(82, 172, 718, 943, 24, 24);
  draw.fillColor(new MagickColor("#078f45")).strokeColor(new MagickColor("#078f45")).strokeWidth(0).roundRectangle(48, 962, 752, 1060, 20, 20);
  drawBitmapText(draw, "PDT", 57, 45, 5, "#ffffff");
  drawBitmapText(draw, "BAYAR DENGAN QRIS", 136, 32, 3, "#171914");
  drawBitmapText(draw, brand, 136, 75, 6, "#171914");
  drawBitmapText(draw, modeLabel, 569, 44, 2, "#f4c400");
  drawBitmapText(draw, "SCAN SEBELUM 14 MENIT BERAKHIR", 50, 132, 3, "#3f453f");
  drawBitmapText(draw, product, 76, 977, 2, "#d7f5e4");
  drawBitmapText(draw, amount, 76, 1014, 4, "#ffffff");
  drawBitmapText(draw, orderNumber, 724 - bitmapTextWidth(orderNumber, 2), 1023, 2, "#d7f5e4");
  draw.draw(canvas);

  const qrImage = MagickImage.create(qrBytes);
  try {
    if (qrImage.width > 600 || qrImage.height > 755) qrImage.resize(600, 755);
    const qrX = Math.round((800 - qrImage.width) / 2);
    const qrY = 180 + Math.round((755 - qrImage.height) / 2);
    canvas.composite(qrImage, new Point(qrX, qrY));
    return canvas.write(MagickFormat.Png, (data) => data);
  } finally {
    qrImage.dispose();
    canvas.dispose();
  }
}

async function sendCheckoutQrisPhoto(
  token: string,
  chatId: number,
  order: PurchaseOrder,
  settings: CheckoutSettings,
  caption: string,
): Promise<SentMessage> {
  const replyMarkup = checkoutButtons(order, settings);
  try {
    const brandedPhoto = await createBrandedQrisPhoto(order, settings);
    return await telegramSendPhotoBytes(token, {
      chat_id: chatId,
      caption: sanitizeTelegramHtml(caption.slice(0, 1024)),
      reply_markup: replyMarkup,
      parse_mode: "HTML",
    }, brandedPhoto);
  } catch (error) {
    console.warn("QRIS_BRANDING_FALLBACK", error instanceof Error ? error.message : "UNKNOWN");
    return await telegramFormattedCall<SentMessage>(token, "sendPhoto", {
      chat_id: chatId,
      photo: order.gateway_qr_url,
      caption: caption.slice(0, 1024),
      reply_markup: replyMarkup,
    }, "caption");
  }
}

async function ensureBuatQrisTransaction(order: PurchaseOrder, settings: CheckoutSettings): Promise<PurchaseOrder> {
  if (!settings.buatqris_enabled) return order;

  const { data: configData, error: configError } = await supabase.rpc("internal_get_buatqris_configuration");
  if (configError || !configData || typeof configData !== "object") throw new Error("BUATQRIS_CONFIGURATION_READ_FAILED");
  const config = configData as BuatQrisRuntimeConfig;
  if (!config.enabled || !config.account_id || !config.secret_token) throw new Error("BUATQRIS_CONFIGURATION_INCOMPLETE");

  const requestedIsTest = config.mode === "SANDBOX";
  const existingTransactionMatchesMode = Boolean(
    order.gateway_transaction_id
    && order.gateway_payment_url
    && Boolean(order.gateway_is_test) === requestedIsTest
    && Number(order.gateway_requested_amount_idr ?? order.amount_idr) === Math.round(order.amount_idr)
  );
  if (existingTransactionMatchesMode) return order;

  const body = new URLSearchParams({
    action: "api_create_qris",
    account_id: config.account_id,
    secret_token: config.secret_token,
    amount: String(Math.max(1, Math.round(order.amount_idr))),
    description: `${order.product_label} · ${order.order_number}`.slice(0, 180),
    qris_method: config.qris_method,
    callback_url: `${supabaseUrl}/functions/v1/buatqris-webhook`,
  });
  if (config.umkm_name.trim()) body.set("umkm_name", config.umkm_name.trim().slice(0, 15));
  if (requestedIsTest) body.set("test", "1");

  const response = await fetch("https://api.buatqris.site", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  let result: BuatQrisCreateResponse;
  try { result = await response.json() as BuatQrisCreateResponse; }
  catch { throw new Error("BUATQRIS_INVALID_RESPONSE"); }
  const transactionId = String(result.data?.transaction_id ?? "").trim();
  const paymentUrl = String(result.data?.payment_url ?? "").trim();
  const qrUrl = String(result.data?.qr_url ?? "").trim();
  if (!response.ok || !result.success || !transactionId || !paymentUrl || !qrUrl) {
    throw new Error(`BUATQRIS_CREATE_FAILED:${String(result.message ?? response.status).slice(0, 120)}`);
  }

  const requestedAmount = Number(result.data?.amount ?? order.amount_idr);
  const totalAmount = Number(result.data?.total_amount ?? requestedAmount);
  const { data: saved, error: saveError } = await supabase.from("purchase_orders").update({
    payment_gateway: "BUATQRIS",
    gateway_transaction_id: transactionId,
    gateway_payment_url: paymentUrl,
    gateway_qr_url: qrUrl,
    gateway_status: String(result.data?.status ?? "pending").toLowerCase(),
    gateway_requested_amount_idr: Number.isSafeInteger(requestedAmount) ? requestedAmount : order.amount_idr,
    gateway_total_amount_idr: Number.isSafeInteger(totalAmount) ? totalAmount : order.amount_idr,
    gateway_is_test: requestedIsTest,
    gateway_failure_code: null,
  }).eq("id", order.id).select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test").single();
  if (saveError || !saved) throw new OutcomeUnknownError("BUATQRIS_CREATED_BUT_ORDER_SAVE_FAILED");
  return saved as PurchaseOrder;
}

async function getMemberIdentity(userId: string): Promise<MemberIdentity> {
  const { data, error } = await supabase.from("users")
    .select("telegram_user_id,username,first_name,last_name")
    .eq("id", userId).maybeSingle();
  if (error || !data) throw new Error("MEMBER_IDENTITY_NOT_FOUND");
  return data as MemberIdentity;
}

function renderPersonalizedText(
  template: string,
  identity: MemberIdentity,
  order?: Pick<PurchaseOrder, "order_number" | "product_label" | "amount_idr">,
): string {
  const rawUsername = String(identity.username ?? "").trim().replace(/^@+/, "");
  const firstName = String(identity.first_name ?? "").trim();
  const lastName = String(identity.last_name ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const friendlyName = firstName || fullName || rawUsername || "Kak";
  const username = rawUsername ? `@${rawUsername}` : fullName || "Kak";
  const values: Record<string, string> = {
    "{name}": friendlyName,
    "{first_name}": friendlyName,
    "{full_name}": fullName || friendlyName,
    "{username}": username,
    "{telegram_id}": identity.telegram_user_id == null ? "" : String(identity.telegram_user_id),
    "{order_number}": order?.order_number ?? "",
    "{product}": order?.product_label ?? "",
    "{amount}": order ? formatRupiah(order.amount_idr) : "",
  };
  return Object.entries(values)
    .reduce((message, [key, value]) => message.replaceAll(key, escapeTelegramHtml(value)), template)
    .slice(0, 4096);
}

function paymentProofCandidate(message?: TelegramMessage): PaymentProofCandidate | null {
  if (!message) return null;
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = [...message.photo].sort((a, b) => (a.file_size ?? 0) - (b.file_size ?? 0)).at(-1);
    if (!photo?.file_id) return null;
    return {
      mediaType: "PHOTO", fileId: photo.file_id, fileUniqueId: photo.file_unique_id ?? null,
      fileSize: photo.file_size ?? 0, mimeType: "image/jpeg", originalName: null,
    };
  }
  if (message.document?.file_id) {
    return {
      mediaType: "DOCUMENT", fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id ?? null,
      fileSize: message.document.file_size ?? 0,
      mimeType: message.document.mime_type?.toLowerCase() ?? "application/octet-stream",
      originalName: message.document.file_name ?? null,
    };
  }
  return null;
}

async function sendReservedText(token: string, chatId: number, deliveryId: string, text: string): Promise<void> {
  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 4096) });
    await finishResponse(deliveryId, "SENT", sent.message_id);
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    await finishResponse(deliveryId, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined,
      telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
    throw error;
  }
}

async function processPaymentProof(
  token: string,
  userId: string,
  chatId: number,
  message: TelegramMessage,
  candidate: PaymentProofCandidate,
  deliveryId: string,
): Promise<void> {
  if (typeof message.message_id !== "number") throw new Error("PAYMENT_PROOF_MESSAGE_ID_MISSING");
  const botNotifications = await getBotNotificationSettings();
  const { data: order, error: orderError } = await supabase.from("purchase_orders")
    .select("id,order_number,status")
    .eq("user_id", userId).in("status", ["PENDING_PAYMENT", "PENDING_VERIFICATION"])
    .maybeSingle();
  if (orderError) throw new Error("PAYMENT_PROOF_ORDER_READ_FAILED");
  if (!order) {
    await sendReservedText(token, chatId, deliveryId, botNotifications.no_pending_order_text);
    return;
  }

  const { data: existing, error: existingError } = await supabase.from("payment_proofs")
    .select("id,status").eq("order_id", order.id).eq("telegram_message_id", message.message_id).maybeSingle();
  if (existingError) throw new Error("PAYMENT_PROOF_DUPLICATE_CHECK_FAILED");
  if (existing) {
    await sendReservedText(token, chatId, deliveryId, botNotifications.proof_already_received_text.replaceAll("{order_number}", order.order_number));
    return;
  }

  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowedMimeTypes.has(candidate.mimeType)) {
    await sendReservedText(token, chatId, deliveryId, botNotifications.invalid_proof_format_text);
    return;
  }

  const telegramFile = await telegramCall<TelegramFile>(token, "getFile", { file_id: candidate.fileId });
  const fileSize = Number(telegramFile.file_size ?? candidate.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) {
    await sendReservedText(token, chatId, deliveryId, botNotifications.proof_too_large_text);
    return;
  }
  if (!telegramFile.file_path || telegramFile.file_path.includes("..") || /^https?:/i.test(telegramFile.file_path)) {
    throw new Error("PAYMENT_PROOF_FILE_PATH_INVALID");
  }

  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
  };
  const storagePath = `${order.id}/${crypto.randomUUID()}.${extensionByMime[candidate.mimeType]}`;
  const download = await fetch(`https://api.telegram.org/file/bot${token}/${telegramFile.file_path}`);
  if (!download.ok) throw new Error(`PAYMENT_PROOF_DOWNLOAD_FAILED:${download.status}`);
  const payload = await download.arrayBuffer();
  if (payload.byteLength <= 0 || payload.byteLength > 10 * 1024 * 1024) throw new Error("PAYMENT_PROOF_DOWNLOAD_SIZE_INVALID");
  const uploaded = await supabase.storage.from("payment-proofs").upload(storagePath, payload, {
    contentType: candidate.mimeType, upsert: false,
  });
  if (uploaded.error) throw new Error("PAYMENT_PROOF_STORAGE_UPLOAD_FAILED");

  const submitted = await supabase.rpc("submit_payment_proof", {
    p_user_id: userId,
    p_order_id: order.id,
    p_telegram_message_id: message.message_id,
    p_telegram_file_id: candidate.fileId,
    p_telegram_file_unique_id: candidate.fileUniqueId,
    p_storage_path: storagePath,
    p_media_type: candidate.mediaType,
    p_mime_type: candidate.mimeType,
    p_file_size: payload.byteLength,
    p_original_name: candidate.originalName,
  });
  if (submitted.error) {
    await supabase.storage.from("payment-proofs").remove([storagePath]);
    throw new Error("PAYMENT_PROOF_SAVE_FAILED");
  }
  await sendReservedText(token, chatId, deliveryId,
    `✅ Bukti transfer ${order.order_number} sudah diterima.\n\nStatus: MENUNGGU VERIFIKASI\nFollow-up pembayaran dihentikan sementara.`);
}

async function registerUser(workspaceId: string, identity: TelegramIdentity, chatId: number): Promise<string> {
  const { data, error } = await supabase.rpc("register_telegram_user", {
    p_workspace_id: workspaceId,
    p_telegram_user_id: identity.id,
    p_private_chat_id: chatId,
    p_username: identity.username ?? null,
    p_first_name: identity.first_name ?? null,
    p_last_name: identity.last_name ?? null,
    p_language_code: identity.language_code ?? null,
  });
  if (error || typeof data !== "string") throw new Error("TELEGRAM_USER_REGISTER_FAILED");
  return data;
}

async function reserveResponse(updateId: string, userId: string, responseKey: string) {
  const { data, error } = await supabase.rpc("reserve_bot_response", {
    p_telegram_update_id: updateId,
    p_user_id: userId,
    p_response_key: responseKey,
  });
  if (error) throw new Error("BOT_RESPONSE_RESERVE_FAILED");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.delivery_id) throw new Error("BOT_RESPONSE_RESERVE_EMPTY");
  return { id: String(row.delivery_id), shouldSend: row.should_send === true };
}

async function finishResponse(deliveryId: string, status: "SENT" | "FAILED" | "OUTCOME_UNKNOWN", messageId?: number, errorCode?: string) {
  const { error } = await supabase.rpc("finish_bot_response", {
    p_delivery_id: deliveryId,
    p_status: status,
    p_telegram_message_id: messageId ?? null,
    p_error_code: errorCode ?? null,
  });
  if (error) throw new Error("BOT_RESPONSE_FINISH_FAILED");
}

async function saveMembership(userId: string, result: Awaited<ReturnType<typeof checkMembership>>) {
  const active = result.channelJoined && result.discussionJoined;
  const { error } = await supabase.from("users").update({
    channel_member_status: result.channel.status,
    discussion_member_status: result.discussion.status,
    onboarding_status: active ? "ACTIVE" : "PENDING",
    membership_checked_at: new Date().toISOString(),
    onboarding_completed_at: active ? new Date().toISOString() : null,
  }).eq("id", userId);
  if (error) throw new Error("MEMBERSHIP_SAVE_FAILED");
}

async function processMembershipChange(
  updateRowId: string,
  workspaceId: string,
  change: TelegramChatMemberUpdated,
): Promise<void> {
  const identity = change.new_chat_member.user;
  if (!identity || identity.is_bot) return;

  const [channelSetting, discussionSetting] = await Promise.all([
    getSetting<unknown>("telegram.channel_id"),
    getSetting<unknown>("telegram.discussion_id"),
  ]);
  const channelId = Number(chatIdFromSetting(channelSetting));
  const discussionId = Number(chatIdFromSetting(discussionSetting));
  if (![channelId, discussionId].includes(change.chat.id)) return;

  const { data: user, error: userError } = await supabase.from("users")
    .select("id,private_chat_id")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", identity.id)
    .maybeSingle();
  if (userError) throw new Error("MEMBERSHIP_USER_READ_FAILED");
  if (!user?.id || !user.private_chat_id) return;

  const token = await getBotToken();
  const membership = await checkMembership(token, identity.id);
  await saveMembership(String(user.id), membership);

  const delivery = await reserveResponse(
    updateRowId,
    String(user.id),
    `membership-change:${change.chat.id}:${change.new_chat_member.status}`,
  );
  if (!delivery.shouldSend) return;

  const notifications = await getBotNotificationSettings();
  const phase: OnboardingPhase = joined(change.new_chat_member) ? "MEMBERSHIP_CHANGE" : "CHECK";
  const payload = onboardingMessage(membership, notifications, phase);
  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: Number(user.private_chat_id),
      text: payload.text,
      reply_markup: payload.reply_markup,
    });
    await finishResponse(delivery.id, "SENT", sent.message_id);
  } catch (sendError) {
    const telegramError = sendError instanceof TelegramApiError ? sendError : null;
    await finishResponse(
      delivery.id,
      telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED",
      undefined,
      telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED",
    );
    throw sendError;
  }
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");
}

function matchesRule(text: string, rule: CommentRule): boolean {
  const input = normalizeKeyword(text);
  return rule.keywords.some((value) => {
    const keyword = normalizeKeyword(value);
    if (rule.match_mode === "EXACT") return input === keyword;
    if (rule.match_mode === "CONTAINS") return input.includes(keyword);
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Z0-9_])${escaped}([^A-Z0-9_]|$)`, "i").test(input);
  });
}

function originChannelMessage(message: TelegramMessage): { chatId: number; messageId: number } | null {
  const origin = message.forward_origin;
  const chatId = origin?.chat?.id ?? message.sender_chat?.id;
  const messageId = origin?.message_id ?? message.forward_from_message_id;
  return typeof chatId === "number" && typeof messageId === "number" ? { chatId, messageId } : null;
}

async function recordDiscussionThread(message: TelegramMessage, discussionChatId: number): Promise<void> {
  if (!message.is_automatic_forward || typeof message.message_id !== "number") return;
  const origin = originChannelMessage(message);
  if (!origin) return;
  const { data: post, error: postError } = await supabase
    .from("channel_posts")
    .select("id")
    .eq("telegram_chat_id", origin.chatId)
    .eq("telegram_message_id", origin.messageId)
    .maybeSingle();
  if (postError) throw new Error("CHANNEL_POST_LOOKUP_FAILED");
  if (!post) return;
  const { error } = await supabase.from("channel_discussion_threads").upsert({
    channel_post_id: post.id,
    discussion_chat_id: discussionChatId,
    discussion_message_id: message.message_id,
    channel_chat_id: origin.chatId,
    channel_message_id: origin.messageId,
  }, { onConflict: "discussion_chat_id,discussion_message_id" });
  if (error) throw new Error("DISCUSSION_THREAD_SAVE_FAILED");
}

async function sendCommentReply(
  token: string,
  chatId: number,
  commentMessageId: number,
  text: string,
  botUsername?: string | null,
  buttonText = DEFAULT_BOT_NOTIFICATIONS.open_bot_button_text,
): Promise<SentMessage> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_parameters: { message_id: commentMessageId, allow_sending_without_reply: false },
  };
  if (botUsername) {
    body.reply_markup = { inline_keyboard: [[{
      text: buttonText.slice(0, 64),
      url: `https://t.me/${botUsername}?start=onboarding`,
    }]] };
  }
  return telegramFormattedCall<SentMessage>(token, "sendMessage", body);
}

async function findOrCreateClaim(input: {
  updateRowId: string;
  ruleId: string;
  channelPostId: string;
  userId: string | null;
  discussionChatId: number;
  commentMessageId: number;
  upsellMode: "NONE" | "PROMPT_VIRAL";
}): Promise<CommentClaim> {
  const inserted = await supabase.from("comment_claims").insert({
    telegram_update_id: input.updateRowId,
    rule_id: input.ruleId,
    channel_post_id: input.channelPostId,
    user_id: input.userId,
    discussion_chat_id: input.discussionChatId,
    comment_message_id: input.commentMessageId,
    upsell_mode: input.upsellMode,
  }).select("id,status,next_part_index,dm_message_ids,public_reply_message_id").maybeSingle();
  if (!inserted.error && inserted.data) return inserted.data as CommentClaim;
  if (inserted.error?.code !== "23505") throw new Error("COMMENT_CLAIM_RESERVE_FAILED");
  const existing = await supabase.from("comment_claims")
    .select("id,status,next_part_index,dm_message_ids,public_reply_message_id")
    .eq("telegram_update_id", input.updateRowId).maybeSingle();
  if (existing.error || !existing.data) throw new Error("COMMENT_CLAIM_READ_FAILED");
  return existing.data as CommentClaim;
}

async function processCommentUpdate(
  updateRowId: string,
  workspaceId: string,
  message: TelegramMessage,
  identity: TelegramIdentity,
  freeClaimEnabled = true,
): Promise<boolean> {
  const chat = message.chat;
  if (!chat || !["group", "supergroup"].includes(chat.type) || typeof message.message_id !== "number") return false;

  const discussionSetting = await getSetting<unknown>("telegram.discussion_id");
  const discussionChatId = Number(chatIdFromSetting(discussionSetting));
  if (chat.id !== discussionChatId) return false;
  if (message.is_automatic_forward) {
    await recordDiscussionThread(message, discussionChatId);
    return true;
  }
  if (!message.text?.trim()) return false;

  const threadMessageId = message.message_thread_id
    ?? (message.reply_to_message?.is_automatic_forward ? message.reply_to_message.message_id : undefined);
  if (typeof threadMessageId !== "number") return false;
  const { data: thread, error: threadError } = await supabase.from("channel_discussion_threads")
    .select("channel_post_id").eq("discussion_chat_id", discussionChatId)
    .eq("discussion_message_id", threadMessageId)
    .eq("workspace_id", workspaceId).maybeSingle();
  if (threadError) throw new Error("DISCUSSION_THREAD_READ_FAILED");
  if (!thread) return false;

  const [{ data: user, error: userError }, { data: claimPost, error: claimPostError }] = await Promise.all([
    supabase.from("users").select("id,private_chat_id").eq("telegram_user_id", identity.id)
      .eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("channel_posts").select("upsell_mode,comment_rule_id").eq("id", thread.channel_post_id)
      .eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (userError) throw new Error("COMMENT_USER_READ_FAILED");
  if (claimPostError || !claimPost) throw new Error("COMMENT_POST_READ_FAILED");
  let ruleQuery = supabase.from("comment_automation_rules")
    .select("id,keywords,match_mode,public_success_reply,start_required_reply,membership_required_reply")
    .eq("status", "ACTIVE").eq("workspace_id", workspaceId).order("priority").limit(20);
  if (claimPost.comment_rule_id) ruleQuery = ruleQuery.eq("id", claimPost.comment_rule_id);
  const { data: rules, error: ruleError } = await ruleQuery;
  if (ruleError) throw new Error("COMMENT_RULE_READ_FAILED");
  const rule = (rules as CommentRule[] | null)?.find((candidate) => matchesRule(message.text!, candidate));
  if (!rule) return false;
  const botNotifications = await getBotNotificationSettings();
  if (!freeClaimEnabled) {
    const runtime = await getRuntimeConfiguration();
    if (!runtime.bot_token) throw new Error("TELEGRAM_BOT_NOT_CONFIGURED");
    await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, botNotifications.free_claim_paused_reply);
    return true;
  }
  const claim = await findOrCreateClaim({
    updateRowId, ruleId: rule.id, channelPostId: thread.channel_post_id,
    userId: user?.id ?? null, discussionChatId, commentMessageId: message.message_id,
    upsellMode: claimPost.upsell_mode === "PROMPT_VIRAL" ? "PROMPT_VIRAL" : "NONE",
  });
  if (["DELIVERED", "OUTCOME_UNKNOWN", "USER_NOT_STARTED", "MEMBERSHIP_REQUIRED", "BLOCKED"].includes(claim.status)) return true;

  const runtime = await getRuntimeConfiguration();
  if (!runtime.bot_token) throw new Error("TELEGRAM_BOT_NOT_CONFIGURED");
  if (!user?.id || !user.private_chat_id) {
    const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.start_required_reply, runtime.bot_username, botNotifications.open_bot_button_text);
    await supabase.from("comment_claims").update({ status: "USER_NOT_STARTED", public_reply_message_id: reply.message_id }).eq("id", claim.id);
    return true;
  }

  const membership = await checkMembership(runtime.bot_token, identity.id);
  await saveMembership(user.id, membership);
  if (!membership.channelJoined || !membership.discussionJoined) {
    const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.membership_required_reply, runtime.bot_username, botNotifications.open_bot_button_text);
    await supabase.from("comment_claims").update({ status: "MEMBERSHIP_REQUIRED", public_reply_message_id: reply.message_id }).eq("id", claim.id);
    return true;
  }

  const [postResult, claimStartResult] = await Promise.all([
    supabase.from("channel_posts").select("prompt_version_id,image_path").eq("id", thread.channel_post_id)
      .eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("comment_claims").update({ status: "SENDING", user_id: user.id, failure_code: null }).eq("id", claim.id),
  ]);
  const { data: post, error: postError } = postResult;
  if (claimStartResult.error) throw new Error("COMMENT_CLAIM_START_FAILED");
  if (postError || !post) throw new Error("COMMENT_POST_READ_FAILED");
  const { data: version, error: versionError } = await supabase.from("prompt_versions")
    .select("parts").eq("id", post.prompt_version_id).maybeSingle();
  if (versionError || !version || !Array.isArray(version.parts)) throw new Error("COMMENT_PROMPT_READ_FAILED");
  const parts = version.parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).slice(0, 20);
  if (!parts.length) throw new Error("COMMENT_PROMPT_EMPTY");

  let nextPart = claim.next_part_index ?? 0;
  const messageIds = Array.isArray(claim.dm_message_ids) ? [...claim.dm_message_ids] : [];
  try {
    if (messageIds.length === 0 && post.image_path) {
      const signedImage = await supabase.storage.from("channel-post-images").createSignedUrl(post.image_path, 300);
      if (signedImage.error || !signedImage.data?.signedUrl) throw new Error("COMMENT_IMAGE_SIGN_FAILED");
      const imageMessage = await telegramFormattedCall<SentMessage>(runtime.bot_token, "sendPhoto", {
        chat_id: user.private_chat_id,
        photo: signedImage.data.signedUrl,
        caption: botNotifications.reference_image_caption.slice(0, 1024),
      }, "caption");
      messageIds.push(imageMessage.message_id);
      const imageProgress = await supabase.from("comment_claims").update({ dm_message_ids: messageIds }).eq("id", claim.id);
      if (imageProgress.error) throw new OutcomeUnknownError("PROMPT_IMAGE_SENT_BUT_PROGRESS_SAVE_FAILED");
    }
    for (; nextPart < parts.length; nextPart += 1) {
      const sent = await telegramFormattedCall<SentMessage>(runtime.bot_token, "sendMessage", {
        chat_id: user.private_chat_id,
        text: parts[nextPart].slice(0, 4096),
      });
      messageIds.push(sent.message_id);
      const progress = await supabase.from("comment_claims").update({
        next_part_index: nextPart + 1,
        dm_message_ids: messageIds,
      }).eq("id", claim.id);
      if (progress.error) throw new OutcomeUnknownError("PROMPT_SENT_BUT_PROGRESS_SAVE_FAILED");
    }
    const publicReply = claim.public_reply_message_id
      ? { message_id: claim.public_reply_message_id }
      : await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.public_success_reply);
    const completed = await supabase.from("comment_claims").update({
      status: "DELIVERED",
      public_reply_message_id: publicReply.message_id,
      delivered_at: new Date().toISOString(),
      failure_code: null,
    }).eq("id", claim.id);
    if (completed.error) throw new OutcomeUnknownError("COMMENT_DELIVERED_BUT_SAVE_FAILED");
    return true;
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: user.id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.start_required_reply, runtime.bot_username, botNotifications.open_bot_button_text);
      await supabase.from("comment_claims").update({ status: "BLOCKED", public_reply_message_id: reply.message_id, failure_code: `TELEGRAM_${telegramError.code}` }).eq("id", claim.id);
      return true;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("comment_claims").update({ status: "OUTCOME_UNKNOWN", failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", claim.id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "COMMENT_OUTCOME_UNKNOWN");
    }
    await supabase.from("comment_claims").update({ status: "FAILED", failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "COMMENT_DELIVERY_FAILED" }).eq("id", claim.id);
    throw error;
  }
}

async function processCheckoutRequest(
  token: string,
  userId: string,
  chatId: number,
  deliveryId: string,
  couponCode: string | null,
) {
  const savedSettings = await getSetting<Partial<CheckoutSettings>>("bot.checkout");
  const settings = { ...DEFAULT_CHECKOUT, ...(savedSettings ?? {}) };
  if (!settings.enabled) {
    const botNotifications = await getBotNotificationSettings();
    try {
      const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
        chat_id: chatId,
        text: botNotifications.checkout_closed_text.slice(0, 4096),
      });
      await finishResponse(deliveryId, "SENT", sent.message_id);
    } catch (sendError) {
      const telegramError = sendError instanceof TelegramApiError ? sendError : null;
      await finishResponse(deliveryId, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined, telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
      throw sendError;
    }
    return;
  }

  const manualReady = settings.manual_enabled && settings.bank_name.trim() && settings.account_number.trim() && settings.account_name.trim();
  const buatqrisReady = settings.buatqris_enabled;
  if (!settings.product_label.trim() || settings.amount_idr <= 0 || (!manualReady && !buatqrisReady)) {
    throw new Error("CHECKOUT_CONFIGURATION_INCOMPLETE");
  }

  const baseAmount = Math.round(settings.amount_idr);
  const validCoupon = Boolean(couponCode && settings.coupon_enabled && couponCode === settings.coupon_code.trim().toUpperCase());
  const discountAmount = validCoupon
    ? settings.coupon_discount_type === "PERCENT"
      ? Math.min(baseAmount, Math.floor(baseAmount * Math.max(0, settings.coupon_discount_value) / 100))
      : Math.min(baseAmount, Math.max(0, Math.round(settings.coupon_discount_value)))
    : 0;
  const uniqueMin = Math.max(0, Math.round(settings.unique_code_min));
  const uniqueMax = Math.max(uniqueMin, Math.min(9999, Math.round(settings.unique_code_max)));
  const randomUnique = settings.unique_code_enabled ? Math.floor(Math.random() * (uniqueMax - uniqueMin + 1)) + uniqueMin : 0;
  const uniqueAmount = settings.unique_code_direction === "SUBTRACT"
    ? -Math.min(randomUnique, Math.max(0, baseAmount - discountAmount - 1))
    : randomUnique;
  const finalAmount = Math.max(1, baseAmount - discountAmount + uniqueAmount);

  const pendingOrderResult = await supabase.from("purchase_orders")
    .select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test")
    .eq("user_id", userId).eq("status", "PENDING_PAYMENT").maybeSingle();
  if (pendingOrderResult.error) throw new Error("PENDING_ORDER_READ_FAILED");
  let orderData = pendingOrderResult.data;

  if (!orderData) {
    const created = await supabase.from("purchase_orders").insert({
      user_id: userId,
      product_label: settings.product_label.trim(),
      base_amount_idr: baseAmount,
      discount_amount_idr: discountAmount,
      unique_code_amount_idr: uniqueAmount,
      coupon_code: validCoupon ? couponCode : null,
      amount_idr: finalAmount,
      private_chat_id: chatId,
      status: "PENDING_PAYMENT",
      source: "BOT",
    }).select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test").single();
    if (created.error?.code === "23505") {
      const existing = await supabase.from("purchase_orders")
        .select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test")
        .eq("user_id", userId).eq("status", "PENDING_PAYMENT").maybeSingle();
      if (existing.error || !existing.data) throw new Error("PENDING_ORDER_RACE_RECOVERY_FAILED");
      orderData = existing.data;
    } else if (created.error || !created.data) {
      throw new Error("PENDING_ORDER_CREATE_FAILED");
    } else {
      orderData = created.data;
    }
  }

  if (orderData && Number(orderData.base_amount_idr ?? orderData.amount_idr) !== baseAmount) {
    const effectiveCouponCode = String(couponCode ?? orderData.coupon_code ?? "").trim().toUpperCase();
    const effectiveCouponValid = Boolean(
      effectiveCouponCode
      && settings.coupon_enabled
      && effectiveCouponCode === settings.coupon_code.trim().toUpperCase(),
    );
    const refreshedDiscount = effectiveCouponValid
      ? settings.coupon_discount_type === "PERCENT"
        ? Math.min(baseAmount, Math.floor(baseAmount * Math.max(0, settings.coupon_discount_value) / 100))
        : Math.min(baseAmount, Math.max(0, Math.round(settings.coupon_discount_value)))
      : 0;
    const previousUniqueAmount = Number(orderData.unique_code_amount_idr ?? 0);
    const refreshedUniqueAmount = settings.unique_code_enabled
      ? Number.isSafeInteger(previousUniqueAmount) && previousUniqueAmount !== 0 ? previousUniqueAmount : uniqueAmount
      : 0;
    const refreshedTotal = Math.max(1, baseAmount - refreshedDiscount + refreshedUniqueAmount);
    const refreshed = await supabase.from("purchase_orders").update({
      product_label: settings.product_label.trim(),
      base_amount_idr: baseAmount,
      discount_amount_idr: refreshedDiscount,
      unique_code_amount_idr: refreshedUniqueAmount,
      coupon_code: effectiveCouponValid ? effectiveCouponCode : null,
      amount_idr: refreshedTotal,
      gateway_failure_code: null,
    }).eq("id", orderData.id).eq("status", "PENDING_PAYMENT")
      .select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test").single();
    if (refreshed.error || !refreshed.data) throw new Error("PENDING_ORDER_PRICE_REFRESH_FAILED");
    orderData = refreshed.data;
  }

  let order = orderData as PurchaseOrder;
  if (settings.buatqris_enabled) {
    try {
      order = await ensureBuatQrisTransaction(order, settings);
    } catch (buatqrisError) {
      await supabase.from("purchase_orders").update({ gateway_failure_code: buatqrisError instanceof Error ? buatqrisError.message.slice(0, 160) : "BUATQRIS_CREATE_FAILED" }).eq("id", order.id);
      if (!manualReady) throw buatqrisError;
    }
  }
  const statusSettings = { ...DEFAULT_ADMIN_NOTIFICATIONS, ...((await getSetting<Partial<AdminNotificationSettings>>("bot.admin_notifications")) ?? {}) };
  const identity = await getMemberIdentity(order.user_id);
  const pendingText = renderPersonalizedText(statusSettings.pending_order_text, identity, order);
  try {
    const messageText = `${pendingText}\n\n${checkoutInstruction(order, settings)}`.slice(0, 4096);
    const sent = order.gateway_qr_url
      ? await sendCheckoutQrisPhoto(token, chatId, order, settings, messageText)
      : await telegramFormattedCall<SentMessage>(token, "sendMessage", {
          chat_id: chatId,
          text: messageText,
          reply_markup: checkoutButtons(order, settings),
        });
    await finishResponse(deliveryId, "SENT", sent.message_id);
  } catch (sendError) {
    const telegramError = sendError instanceof TelegramApiError ? sendError : null;
    await finishResponse(deliveryId, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined, telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
    throw sendError;
  }
}

async function processTelegramUpdate(job: Record<string, unknown>, controls: EmergencyControls) {
  const updateRowId = String(job.entity_id ?? "");
  const { data: row, error } = await supabase.from("telegram_updates")
    .select("payload,workspace_id").eq("id", updateRowId).maybeSingle();
  if (error || !row) throw new Error("TELEGRAM_UPDATE_NOT_FOUND");
  const workspaceId = String(row.workspace_id ?? "");
  if (!workspaceId) throw new Error("TELEGRAM_UPDATE_WORKSPACE_REQUIRED");

  const update = row.payload as TelegramUpdate;
  if (update.chat_member) {
    await processMembershipChange(updateRowId, workspaceId, update.chat_member);
    return;
  }
  const callback = update.callback_query;
  const message = callback?.message ?? update.message;
  const identity = callback?.from ?? update.message?.from;
  const chat = message?.chat;
  if (!chat) return;

  if (update.message && ["group", "supergroup"].includes(chat.type)) {
    if (update.message.is_automatic_forward) {
      const discussionSetting = await getSetting<unknown>("telegram.discussion_id");
      const discussionChatId = Number(chatIdFromSetting(discussionSetting));
      if (chat.id === discussionChatId) await recordDiscussionThread(update.message, discussionChatId);
      return;
    }
    if (!identity || identity.is_bot) return;
    await processCommentUpdate(updateRowId, workspaceId, update.message, identity, controls.free_claim_enabled);
    return;
  }

  if (!identity || identity.is_bot || chat.type !== "private") return;

  const start = parseStart(update.message?.text);
  const subscribe = isSubscribeCommand(update.message?.text);
  const buy = isBuyCommand(update.message?.text);
  const couponCode = buyCouponCode(update.message?.text);
  const proofCandidate = paymentProofCandidate(update.message);
  const callbackAction = callback?.data ?? null;
  const proofUploadOrderId = paymentProofUploadOrderId(callbackAction);
  const checkoutRequested = buy || callbackAction === "checkout:create";
  if (!start.isStart && !subscribe && !checkoutRequested && !proofCandidate && !proofUploadOrderId && callbackAction !== "onboarding:check" && callbackAction !== "broadcast:unsubscribe") return;

  const userId = await registerUser(workspaceId, identity, chat.id);
  const responseKey = start.isStart
    ? `start:${start.parameter ?? "home"}`
    : subscribe
      ? "command:subscribe"
      : proofCandidate
        ? `payment-proof:${update.message?.message_id ?? "unknown"}`
      : proofUploadOrderId
        ? `payment-proof-upload:${proofUploadOrderId}`
      : checkoutRequested
        ? `checkout:create:${couponCode ?? "none"}`
      : `callback:${callbackAction}`;
  const delivery = await reserveResponse(updateRowId, userId, responseKey);
  const token = await getBotToken();

  if (callback?.id) await telegramCall<true>(token, "answerCallbackQuery", { callback_query_id: callback.id });
  if (!delivery.shouldSend) return;

  if (proofCandidate && update.message) {
    await processPaymentProof(token, userId, chat.id, update.message, proofCandidate, delivery.id);
    return;
  }

  if (proofUploadOrderId) {
    const { data: order, error: orderError } = await supabase.from("purchase_orders")
      .select("id,order_number,status")
      .eq("id", proofUploadOrderId).eq("user_id", userId).maybeSingle();
    if (orderError) throw new Error("PAYMENT_PROOF_UPLOAD_ORDER_READ_FAILED");
    const botNotifications = await getBotNotificationSettings();
    const text = !order || !["PENDING_PAYMENT", "PENDING_VERIFICATION"].includes(order.status)
      ? botNotifications.inactive_order_text
      : botNotifications.proof_upload_instruction_text.replaceAll("{order_number}", order.order_number);
    await sendReservedText(token, chat.id, delivery.id, text);
    return;
  }

  if (checkoutRequested) {
    if (!controls.checkout_enabled) {
      const botNotifications = await getBotNotificationSettings();
      await sendReservedText(token, chat.id, delivery.id, botNotifications.checkout_paused_text);
      return;
    }
    await processCheckoutRequest(token, userId, chat.id, delivery.id, couponCode);
    return;
  }

  if (callbackAction === "broadcast:unsubscribe") {
    const preference = await supabase.from("broadcast_preferences").upsert({
      user_id: userId,
      subscribed: false,
      opted_out_at: new Date().toISOString(),
      source: "TELEGRAM_BUTTON",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (preference.error) throw new Error("BROADCAST_UNSUBSCRIBE_FAILED");
    try {
      const botNotifications = await getBotNotificationSettings();
      const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
        chat_id: chat.id,
        text: botNotifications.broadcast_unsubscribed_text.slice(0, 4096),
      });
      await finishResponse(delivery.id, "SENT", sent.message_id);
    } catch (sendError) {
      const telegramError = sendError instanceof TelegramApiError ? sendError : null;
      await finishResponse(delivery.id, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined, telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
      throw sendError;
    }
    return;
  }

  if (subscribe) {
    const preference = await supabase.from("broadcast_preferences").upsert({
      user_id: userId,
      subscribed: true,
      opted_out_at: null,
      source: "TELEGRAM_COMMAND",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (preference.error) throw new Error("BROADCAST_RESUBSCRIBE_FAILED");
    try {
      const botNotifications = await getBotNotificationSettings();
      const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
        chat_id: chat.id,
        text: botNotifications.broadcast_resubscribed_text.slice(0, 4096),
      });
      await finishResponse(delivery.id, "SENT", sent.message_id);
    } catch (sendError) {
      const telegramError = sendError instanceof TelegramApiError ? sendError : null;
      await finishResponse(delivery.id, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined, telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
      throw sendError;
    }
    return;
  }

  const membership = await checkMembership(token, identity.id);
  await saveMembership(userId, membership);
  const botNotifications = await getBotNotificationSettings();
  const payload = onboardingMessage(
    membership,
    botNotifications,
    callbackAction === "onboarding:check" ? "CHECK" : "START",
  );

  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: chat.id,
      text: payload.text,
      reply_markup: payload.reply_markup,
    });
    await finishResponse(delivery.id, "SENT", sent.message_id);
  } catch (sendError) {
    const telegramError = sendError instanceof TelegramApiError ? sendError : null;
    await finishResponse(delivery.id, telegramError?.outcomeUnknown ? "OUTCOME_UNKNOWN" : "FAILED", undefined, telegramError ? `TELEGRAM_${telegramError.code}` : "SEND_FAILED");
    if (telegramError?.code === 403 || /blocked/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: userId, p_contact_status: "BLOCKED" });
    }
    throw sendError;
  }
}

async function refreshBroadcastCampaign(campaignId: string) {
  const { data, error } = await supabase.from("broadcast_recipients").select("status").eq("campaign_id", campaignId);
  if (error) throw new Error("BROADCAST_COUNTS_READ_FAILED");
  const rows = data ?? [];
  const sent = rows.filter((row) => row.status === "SENT").length;
  const failed = rows.filter((row) => ["BLOCKED", "FAILED", "OUTCOME_UNKNOWN"].includes(row.status)).length;
  const skipped = rows.filter((row) => row.status === "SKIPPED_OPTED_OUT").length;
  const pending = rows.filter((row) => ["QUEUED", "SENDING"].includes(row.status)).length;
  const { error: updateError } = await supabase.from("broadcast_campaigns").update({
    sent_recipients: sent,
    failed_recipients: failed,
    skipped_recipients: skipped,
    status: pending === 0 ? "COMPLETED" : "SENDING",
    completed_at: pending === 0 ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
  if (updateError) throw new Error("BROADCAST_COUNTS_SAVE_FAILED");
}

async function processBroadcastRecipient(job: Record<string, unknown>) {
  const recipientId = String(job.entity_id ?? "");
  if (!recipientId) throw new Error("BROADCAST_RECIPIENT_ID_MISSING");
  const { data: recipientData, error: recipientError } = await supabase.from("broadcast_recipients")
    .select("id,campaign_id,user_id,private_chat_id,status,next_part_index,media_sent,telegram_message_ids")
    .eq("id", recipientId).maybeSingle();
  if (recipientError || !recipientData) throw new Error("BROADCAST_RECIPIENT_NOT_FOUND");
  const recipient = recipientData as BroadcastRecipient;
  if (["SENT", "SKIPPED_OPTED_OUT", "BLOCKED", "OUTCOME_UNKNOWN"].includes(recipient.status)) return;

  const [{ data: campaignData, error: campaignError }, { data: preference, error: preferenceError }] = await Promise.all([
    supabase.from("broadcast_campaigns").select("id,message_parts,media_type,media_url,button_text,button_url,status").eq("id", recipient.campaign_id).maybeSingle(),
    supabase.from("broadcast_preferences").select("subscribed").eq("user_id", recipient.user_id).maybeSingle(),
  ]);
  if (campaignError || !campaignData) throw new Error("BROADCAST_CAMPAIGN_NOT_FOUND");
  if (preferenceError) throw new Error("BROADCAST_PREFERENCE_READ_FAILED");
  const campaign = campaignData as BroadcastCampaign;
  if (["PAUSED", "CANCELLED"].includes(campaign.status)) return;
  if (preference?.subscribed === false) {
    await supabase.from("broadcast_recipients").update({ status: "SKIPPED_OPTED_OUT", updated_at: new Date().toISOString() }).eq("id", recipient.id);
    await refreshBroadcastCampaign(recipient.campaign_id);
    return;
  }

  const parts = Array.isArray(campaign.message_parts)
    ? campaign.message_parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).slice(0, 10)
    : [];
  if (!parts.length && !campaign.media_url) throw new Error("BROADCAST_MESSAGE_EMPTY");
  if ((campaign.media_type === "PHOTO" || campaign.media_type === "VIDEO") && campaign.media_url && !/^https:\/\//i.test(campaign.media_url)) throw new Error("BROADCAST_MEDIA_URL_INVALID");
  const identity = await getMemberIdentity(recipient.user_id);
  const token = await getBotToken();
  let nextPart = recipient.next_part_index ?? 0;
  const mediaSent = recipient.media_sent === true;
  const messageIds = Array.isArray(recipient.telegram_message_ids) ? [...recipient.telegram_message_ids] : [];
  await supabase.from("broadcast_recipients").update({ status: "SENDING", failure_code: null, updated_at: new Date().toISOString() }).eq("id", recipient.id);
  try {
    if (campaign.media_url && !mediaSent) {
      const method = campaign.media_type === "VIDEO" ? "sendVideo" : "sendPhoto";
      const sentMedia = await telegramCall<SentMessage>(token, method, {
        chat_id: recipient.private_chat_id,
        [campaign.media_type === "VIDEO" ? "video" : "photo"]: campaign.media_url,
      });
      messageIds.push(sentMedia.message_id);
      const progress = await supabase.from("broadcast_recipients").update({
        media_sent: true,
        telegram_message_ids: messageIds,
        updated_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      if (progress.error) throw new OutcomeUnknownError("BROADCAST_MEDIA_SENT_BUT_PROGRESS_SAVE_FAILED");
    }
    for (; nextPart < parts.length; nextPart += 1) {
      const body: Record<string, unknown> = {
        chat_id: recipient.private_chat_id,
        text: renderPersonalizedText(parts[nextPart], identity),
      };
      if (nextPart === parts.length - 1) {
        const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
        if (campaign.button_text && campaign.button_url) buttons.push([{ text: campaign.button_text, url: campaign.button_url }]);
        if (buttons.length) body.reply_markup = { inline_keyboard: buttons };
      }
      const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", body);
      messageIds.push(sent.message_id);
      const progress = await supabase.from("broadcast_recipients").update({
        next_part_index: nextPart + 1,
        telegram_message_ids: messageIds,
        updated_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      if (progress.error) throw new OutcomeUnknownError("BROADCAST_SENT_BUT_PROGRESS_SAVE_FAILED");
    }
    const completed = await supabase.from("broadcast_recipients").update({
      status: "SENT", sent_at: new Date().toISOString(), failure_code: null, updated_at: new Date().toISOString(),
    }).eq("id", recipient.id);
    if (completed.error) throw new OutcomeUnknownError("BROADCAST_SENT_BUT_COMPLETE_SAVE_FAILED");
    await refreshBroadcastCampaign(recipient.campaign_id);
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: recipient.user_id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      await supabase.from("broadcast_recipients").update({ status: "BLOCKED", failure_code: `TELEGRAM_${telegramError.code}`, updated_at: new Date().toISOString() }).eq("id", recipient.id);
      await refreshBroadcastCampaign(recipient.campaign_id);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("broadcast_recipients").update({ status: "OUTCOME_UNKNOWN", failure_code: "TELEGRAM_OUTCOME_UNKNOWN", updated_at: new Date().toISOString() }).eq("id", recipient.id);
      await refreshBroadcastCampaign(recipient.campaign_id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "BROADCAST_OUTCOME_UNKNOWN");
    }
    const finalAttempt = Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 4);
    await supabase.from("broadcast_recipients").update({
      status: finalAttempt ? "FAILED" : "QUEUED",
      failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "BROADCAST_SEND_FAILED",
      updated_at: new Date().toISOString(),
    }).eq("id", recipient.id);
    await refreshBroadcastCampaign(recipient.campaign_id);
    throw error;
  }
}

async function processFollowUpStep(job: Record<string, unknown>) {
  const enrollmentId = String(job.entity_id ?? "");
  if (!enrollmentId) throw new Error("FOLLOW_UP_ENROLLMENT_ID_MISSING");
  const { data: enrollmentData, error: enrollmentError } = await supabase.from("follow_up_enrollments")
    .select("id,automation_id,user_id,source_id,private_chat_id,status,current_step,telegram_message_ids")
    .eq("id", enrollmentId).maybeSingle();
  if (enrollmentError || !enrollmentData) throw new Error("FOLLOW_UP_ENROLLMENT_NOT_FOUND");
  const enrollment = enrollmentData as FollowUpEnrollment;
  if (["COMPLETED", "CANCELLED", "BLOCKED", "OUTCOME_UNKNOWN"].includes(enrollment.status)) return;

  const [{ data: automation, error: automationError }, { data: orderData, error: orderError }, savedCheckoutSettings] = await Promise.all([
    supabase.from("follow_up_automations").select("status").eq("id", enrollment.automation_id).maybeSingle(),
    supabase.from("purchase_orders").select("id,order_number,user_id,product_label,amount_idr,base_amount_idr,discount_amount_idr,unique_code_amount_idr,coupon_code,private_chat_id,status,proof_revision,access_delivery_status,access_message_id,payment_gateway,gateway_transaction_id,gateway_payment_url,gateway_qr_url,gateway_status,gateway_requested_amount_idr,gateway_total_amount_idr,gateway_is_test").eq("id", enrollment.source_id).maybeSingle(),
    getSetting<Partial<CheckoutSettings>>("bot.checkout"),
  ]);
  if (automationError || !automation) throw new Error("FOLLOW_UP_AUTOMATION_NOT_FOUND");
  if (orderError || !orderData) throw new Error("FOLLOW_UP_ORDER_NOT_FOUND");
  let order = orderData as PurchaseOrder;
  if (automation.status !== "ACTIVE" || order.status !== "PENDING_PAYMENT") {
    await supabase.from("follow_up_enrollments").update({
      status: "CANCELLED",
      failure_code: automation.status !== "ACTIVE" ? "AUTOMATION_NOT_ACTIVE" : `ORDER_${order.status}`,
      completed_at: new Date().toISOString(),
    }).eq("id", enrollment.id);
    return;
  }

  const { data: step, error: stepError } = await supabase.from("follow_up_steps")
    .select("position,message_text,button_text,button_url")
    .eq("automation_id", enrollment.automation_id).eq("position", enrollment.current_step).maybeSingle();
  if (stepError || !step) throw new Error("FOLLOW_UP_STEP_NOT_FOUND");
  const identity = await getMemberIdentity(enrollment.user_id);
  const token = await getBotToken();
  const checkoutSettings = { ...DEFAULT_CHECKOUT, ...(savedCheckoutSettings ?? {}) };
  if (checkoutSettings.buatqris_enabled) {
    try {
      order = await ensureBuatQrisTransaction(order, checkoutSettings);
    } catch (buatqrisError) {
      await supabase.from("purchase_orders").update({
        gateway_failure_code: buatqrisError instanceof Error ? buatqrisError.message.slice(0, 160) : "BUATQRIS_CREATE_FAILED",
      }).eq("id", order.id);
      if (!checkoutSettings.manual_enabled) throw buatqrisError;
    }
  }
  const personalizedMessage = renderPersonalizedText(String(step.message_text), identity, order);
  const paymentSummary = order.gateway_qr_url
    ? `\n\n🧾 ${order.order_number}\nTotal QRIS: ${formatRupiah(Number(order.gateway_total_amount_idr ?? order.amount_idr))}`
    : `\n\n🧾 ${order.order_number}\nTotal: ${formatRupiah(order.amount_idr)}`;
  const followUpText = `${personalizedMessage}${paymentSummary}`;
  const replyMarkup = checkoutButtons(order, checkoutSettings);

  await supabase.from("follow_up_enrollments").update({ status: "SENDING", failure_code: null }).eq("id", enrollment.id);
  try {
    const sent = order.gateway_qr_url
      ? await sendCheckoutQrisPhoto(token, enrollment.private_chat_id, order, checkoutSettings, followUpText)
      : await telegramFormattedCall<SentMessage>(token, "sendMessage", {
          chat_id: enrollment.private_chat_id,
          text: followUpText.slice(0, 4096),
          reply_markup: replyMarkup,
        });
    const messageIds = [...(Array.isArray(enrollment.telegram_message_ids) ? enrollment.telegram_message_ids : []), sent.message_id];
    const nextPosition = enrollment.current_step + 1;
    const { data: nextStep, error: nextStepError } = await supabase.from("follow_up_steps")
      .select("delay_minutes").eq("automation_id", enrollment.automation_id).eq("position", nextPosition).maybeSingle();
    if (nextStepError) throw new OutcomeUnknownError("FOLLOW_UP_SENT_BUT_NEXT_STEP_READ_FAILED");
    if (!nextStep) {
      const completed = await supabase.from("follow_up_enrollments").update({
        status: "COMPLETED", current_step: nextPosition, telegram_message_ids: messageIds, completed_at: new Date().toISOString(), failure_code: null,
      }).eq("id", enrollment.id);
      if (completed.error) throw new OutcomeUnknownError("FOLLOW_UP_SENT_BUT_COMPLETE_SAVE_FAILED");
      return;
    }
    const nextRunAt = new Date(Date.now() + Number(nextStep.delay_minutes) * 60_000).toISOString();
    const progress = await supabase.from("follow_up_enrollments").update({
      status: "SCHEDULED", current_step: nextPosition, telegram_message_ids: messageIds, next_run_at: nextRunAt, failure_code: null,
    }).eq("id", enrollment.id);
    if (progress.error) throw new OutcomeUnknownError("FOLLOW_UP_SENT_BUT_PROGRESS_SAVE_FAILED");
    const queued = await supabase.from("scheduled_jobs").insert({
      job_type: "FOLLOW_UP_STEP_SEND", entity_type: "FOLLOW_UP_ENROLLMENT", entity_id: enrollment.id,
      payload: { enrollment_id: enrollment.id, step: nextPosition, cycle: order.proof_revision ?? 0 },
      idempotency_key: `follow-up:${enrollment.id}:cycle:${order.proof_revision ?? 0}:step:${nextPosition}`, status: "QUEUED", priority: 95,
      run_at: nextRunAt, max_attempts: 4, correlation_id: crypto.randomUUID(),
    });
    if (queued.error && queued.error.code !== "23505") throw new OutcomeUnknownError("FOLLOW_UP_SENT_BUT_NEXT_JOB_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: enrollment.user_id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      await supabase.from("follow_up_enrollments").update({ status: "BLOCKED", failure_code: `TELEGRAM_${telegramError.code}` }).eq("id", enrollment.id);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("follow_up_enrollments").update({ status: "OUTCOME_UNKNOWN", failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", enrollment.id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "FOLLOW_UP_OUTCOME_UNKNOWN");
    }
    const finalAttempt = Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 4);
    await supabase.from("follow_up_enrollments").update({ status: finalAttempt ? "FAILED" : "SCHEDULED", failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "FOLLOW_UP_SEND_FAILED" }).eq("id", enrollment.id);
    throw error;
  }
}

async function processPurchaseAccess(job: Record<string, unknown>) {
  const orderId = String(job.entity_id ?? "");
  if (!orderId) throw new Error("PURCHASE_ORDER_ID_MISSING");
  const { data: orderData, error: orderError } = await supabase.from("purchase_orders")
    .select("id,order_number,user_id,product_label,amount_idr,private_chat_id,status,access_delivery_status,access_message_id")
    .eq("id", orderId).maybeSingle();
  if (orderError || !orderData) throw new Error("PURCHASE_ORDER_NOT_FOUND");
  const order = orderData as PurchaseOrder;
  if (order.status !== "PAID") return;
  if (order.access_delivery_status === "SENT" && order.access_message_id) return;
  if (order.access_delivery_status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("PURCHASE_ACCESS_REQUIRES_REVIEW");

  const settings = { ...DEFAULT_CHECKOUT, ...((await getSetting<Partial<CheckoutSettings>>("bot.checkout")) ?? {}) };
  const notificationSettings = { ...DEFAULT_ADMIN_NOTIFICATIONS, ...((await getSetting<Partial<AdminNotificationSettings>>("bot.admin_notifications")) ?? {}) };
  if (!notificationSettings.paid_order_text.trim()) throw new Error("PURCHASE_ACCESS_TEXT_MISSING");
  const identity = await getMemberIdentity(order.user_id);
  const token = await getBotToken();
  const body: Record<string, unknown> = {
    chat_id: order.private_chat_id,
    text: renderPersonalizedText(notificationSettings.paid_order_text.trim(), identity, order),
  };
  if (settings.access_button_text.trim() && /^https:\/\//i.test(settings.access_button_url.trim())) {
    body.reply_markup = { inline_keyboard: [[{
      text: settings.access_button_text.trim().slice(0, 64),
      url: settings.access_button_url.trim(),
    }]] };
  }

  await supabase.from("purchase_orders").update({ access_delivery_status: "SENDING", access_failure_code: null }).eq("id", order.id);
  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", body);
    const saved = await supabase.from("purchase_orders").update({
      access_delivery_status: "SENT",
      access_message_id: sent.message_id,
      access_sent_at: new Date().toISOString(),
      access_failure_code: null,
    }).eq("id", order.id);
    if (saved.error) throw new OutcomeUnknownError("PURCHASE_ACCESS_SENT_BUT_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: order.user_id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      await supabase.from("purchase_orders").update({ access_delivery_status: "BLOCKED", access_failure_code: `TELEGRAM_${telegramError.code}` }).eq("id", order.id);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("purchase_orders").update({ access_delivery_status: "OUTCOME_UNKNOWN", access_failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", order.id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "PURCHASE_ACCESS_OUTCOME_UNKNOWN");
    }
    const finalAttempt = Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 4);
    await supabase.from("purchase_orders").update({
      access_delivery_status: finalAttempt ? "FAILED" : "QUEUED",
      access_failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "PURCHASE_ACCESS_SEND_FAILED",
    }).eq("id", order.id);
    throw error;
  }
}

async function processPaymentProofRejection(job: Record<string, unknown>) {
  const proofId = String(job.entity_id ?? "");
  if (!proofId) throw new Error("PAYMENT_PROOF_ID_MISSING");
  const { data: proof, error } = await supabase.from("payment_proofs")
    .select("id,status,rejection_reason,review_notice_status,review_notice_message_id,order_id,purchase_orders!inner(user_id,private_chat_id,order_number,status)")
    .eq("id", proofId).maybeSingle();
  if (error || !proof) throw new Error("PAYMENT_PROOF_NOT_FOUND");
  if (proof.status !== "REJECTED") return;
  if (proof.review_notice_status === "SENT" && proof.review_notice_message_id) return;
  if (proof.review_notice_status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("PAYMENT_PROOF_NOTICE_REQUIRES_REVIEW");
  const order = Array.isArray(proof.purchase_orders) ? proof.purchase_orders[0] : proof.purchase_orders;
  if (!order?.private_chat_id) throw new Error("PAYMENT_PROOF_ORDER_CHAT_MISSING");
  const token = await getBotToken();
  await supabase.from("payment_proofs").update({ review_notice_status: "SENDING", review_notice_failure_code: null }).eq("id", proof.id);
  try {
    const botNotifications = await getBotNotificationSettings();
    const rejectionText = botNotifications.proof_rejected_text
      .replaceAll("{order_number}", escapeTelegramHtml(order.order_number))
      .replaceAll("{reason}", escapeTelegramHtml(String(proof.rejection_reason ?? "Bukti tidak valid").slice(0, 500)));
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: order.private_chat_id,
      text: rejectionText.slice(0, 4096),
      reply_markup: paymentProofUploadButton(proof.order_id),
    });
    const saved = await supabase.from("payment_proofs").update({
      review_notice_status: "SENT", review_notice_message_id: sent.message_id,
      review_notice_failure_code: null,
    }).eq("id", proof.id);
    if (saved.error) throw new OutcomeUnknownError("PAYMENT_PROOF_NOTICE_SENT_BUT_SAVE_FAILED");
  } catch (sendError) {
    const telegramError = sendError instanceof TelegramApiError ? sendError : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: order.user_id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      await supabase.from("payment_proofs").update({ review_notice_status: "BLOCKED", review_notice_failure_code: `TELEGRAM_${telegramError.code}` }).eq("id", proof.id);
      return;
    }
    if (sendError instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("payment_proofs").update({ review_notice_status: "OUTCOME_UNKNOWN", review_notice_failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", proof.id);
      throw new OutcomeUnknownError(sendError instanceof Error ? sendError.message : "PAYMENT_PROOF_NOTICE_OUTCOME_UNKNOWN");
    }
    const finalAttempt = Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 4);
    await supabase.from("payment_proofs").update({
      review_notice_status: finalAttempt ? "FAILED" : "QUEUED",
      review_notice_failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "PAYMENT_PROOF_NOTICE_FAILED",
    }).eq("id", proof.id);
    throw sendError;
  }
}

async function processPurchaseOrderExpiry(job: Record<string, unknown>) {
  const orderId = String(job.entity_id ?? "");
  const revision = Number((job.payload as Record<string, unknown> | undefined)?.expiry_revision ?? 0);
  if (!orderId || !Number.isInteger(revision) || revision < 1) throw new Error("PURCHASE_ORDER_EXPIRY_PAYLOAD_INVALID");

  const { data: order, error: orderError } = await supabase.from("purchase_orders")
    .select("id,order_number,user_id,private_chat_id,status,expires_at,expiry_revision,expiry_notice_status,expiry_notice_message_id")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error("PURCHASE_ORDER_NOT_FOUND");
  if (Number(order.expiry_revision) !== revision) return;
  if (order.status === "PENDING_VERIFICATION" || order.status === "PAID" || order.status === "CANCELLED") return;
  if (order.status === "PENDING_PAYMENT" && new Date(order.expires_at ?? 0).getTime() > Date.now()) return;
  if (order.status === "EXPIRED" && order.expiry_notice_status === "SENT") return;
  if (order.expiry_notice_status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("ORDER_EXPIRY_NOTICE_REQUIRES_REVIEW");

  if (order.status === "PENDING_PAYMENT") {
    const { data: expired, error: expireError } = await supabase.from("purchase_orders").update({
      status: "EXPIRED",
      expired_at: new Date().toISOString(),
      expiry_notice_status: "SENDING",
      expiry_failure_code: null,
    }).eq("id", orderId).eq("status", "PENDING_PAYMENT").eq("expiry_revision", revision).select("id").maybeSingle();
    if (expireError) throw new Error("PURCHASE_ORDER_EXPIRY_SAVE_FAILED");
    if (!expired) return;
  } else if (order.status !== "EXPIRED") {
    return;
  } else {
    const started = await supabase.from("purchase_orders").update({
      expiry_notice_status: "SENDING", expiry_failure_code: null,
    }).eq("id", orderId).eq("status", "EXPIRED").eq("expiry_revision", revision);
    if (started.error) throw new Error("PURCHASE_ORDER_EXPIRY_NOTICE_START_FAILED");
  }

  const [savedSettings, token, identity] = await Promise.all([
    getSetting<Partial<OrderExpirySettings>>("bot.order_expiry"),
    getBotToken(),
    getMemberIdentity(order.user_id),
  ]);
  const settings = { ...DEFAULT_ORDER_EXPIRY, ...(savedSettings ?? {}) };

  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: order.private_chat_id,
      text: renderPersonalizedText(settings.expiry_notice, identity),
      reply_markup: { inline_keyboard: [[{ text: "BUAT ORDER BARU", callback_data: "checkout:create" }]] },
    });
    const saved = await supabase.from("purchase_orders").update({
      expiry_notice_status: "SENT",
      expiry_notice_message_id: sent.message_id,
      expiry_failure_code: null,
    }).eq("id", orderId).eq("expiry_revision", revision);
    if (saved.error) throw new OutcomeUnknownError("ORDER_EXPIRY_NOTICE_SENT_BUT_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", {
        p_user_id: order.user_id,
        p_contact_status: telegramError?.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND",
      });
      await supabase.from("purchase_orders").update({
        expiry_notice_status: "BLOCKED", expiry_failure_code: `TELEGRAM_${telegramError?.code ?? 0}`,
      }).eq("id", orderId).eq("expiry_revision", revision);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("purchase_orders").update({
        expiry_notice_status: "OUTCOME_UNKNOWN", expiry_failure_code: "TELEGRAM_OUTCOME_UNKNOWN",
      }).eq("id", orderId).eq("expiry_revision", revision);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "ORDER_EXPIRY_NOTICE_OUTCOME_UNKNOWN");
    }
    await supabase.from("purchase_orders").update({
      expiry_notice_status: "FAILED",
      expiry_failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "ORDER_EXPIRY_NOTICE_FAILED",
    }).eq("id", orderId).eq("expiry_revision", revision);
    throw error;
  }
}

async function processChannelPost(job: Record<string, unknown>) {
  const postId = String(job.entity_id ?? "");
  if (!postId) throw new Error("CHANNEL_POST_ID_MISSING");

  const { data: post, error: postError } = await supabase
    .from("channel_posts")
    .select("id,image_path,caption,status")
    .eq("id", postId)
    .maybeSingle();
  if (postError || !post) throw new Error("CHANNEL_POST_NOT_FOUND");
  const channelPost = post as ChannelPost;
  if (channelPost.status === "SENT" || channelPost.status === "CANCELLED") return;
  if (channelPost.status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("CHANNEL_POST_REQUIRES_REVIEW");
  if (!["SCHEDULED", "FAILED", "PUBLISHING"].includes(channelPost.status)) {
    throw new Error(`CHANNEL_POST_INVALID_STATUS:${channelPost.status}`);
  }

  const { error: publishingError } = await supabase
    .from("channel_posts")
    .update({ status: "PUBLISHING", failure_code: null, failure_message: null })
    .eq("id", postId)
    .in("status", ["SCHEDULED", "FAILED", "PUBLISHING"]);
  if (publishingError) throw new Error("CHANNEL_POST_LOCK_FAILED");

  const [token, channelSetting] = await Promise.all([
    getBotToken(),
    getSetting<unknown>("telegram.channel_id"),
  ]);
  let signedImageUrl: string | null = null;
  if (channelPost.image_path) {
    const signedImage = await supabase.storage.from("channel-post-images").createSignedUrl(channelPost.image_path, 300);
    if (signedImage.error || !signedImage.data?.signedUrl) throw new Error("CHANNEL_POST_IMAGE_SIGN_FAILED");
    signedImageUrl = signedImage.data.signedUrl;
  }
  const channelId = chatIdFromSetting(channelSetting);

  try {
    const sent = signedImageUrl
      ? await telegramFormattedCall<SentMessage>(token, "sendPhoto", {
          chat_id: channelId,
          photo: signedImageUrl,
          caption: channelPost.caption,
        }, "caption")
      : await telegramFormattedCall<SentMessage>(token, "sendMessage", {
          chat_id: channelId,
          text: channelPost.caption,
        });
    const numericChannelId = /^-?\d+$/.test(channelId) ? Number(channelId) : null;
    const { error: sentError } = await supabase.from("channel_posts").update({
      status: "SENT",
      telegram_chat_id: numericChannelId,
      telegram_message_id: sent.message_id,
      published_at: new Date().toISOString(),
      failure_code: null,
      failure_message: null,
    }).eq("id", postId);
    if (sentError) throw new OutcomeUnknownError("CHANNEL_POST_SENT_BUT_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("channel_posts").update({
        status: "OUTCOME_UNKNOWN",
        failure_code: "TELEGRAM_OUTCOME_UNKNOWN",
        failure_message: error instanceof Error ? error.message : "Unknown delivery outcome",
      }).eq("id", postId);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "CHANNEL_POST_OUTCOME_UNKNOWN");
    }
    await supabase.from("channel_posts").update({
      status: "FAILED",
      failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "CHANNEL_POST_FAILED",
      failure_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown channel post error",
    }).eq("id", postId);
    throw error;
  }
}

async function processCommentClaimExpiry(job: Record<string, unknown>) {
  const claimId = String(job.entity_id ?? "");
  if (!claimId) throw new Error("COMMENT_CLAIM_ID_MISSING");

  const { data: claimData, error: claimError } = await supabase.from("comment_claims")
    .select("id,user_id,status,expiry_status,dm_message_ids,deleted_message_ids,expiry_notice_message_id,offer_message_id,upsell_mode")
    .eq("id", claimId).maybeSingle();
  if (claimError || !claimData) throw new Error("COMMENT_CLAIM_NOT_FOUND");
  const claim = claimData as ExpiringClaim;
  if (claim.status !== "DELIVERED") throw new Error(`COMMENT_CLAIM_NOT_DELIVERED:${claim.status}`);
  if (claim.expiry_status === "COMPLETED") return;
  if (claim.expiry_status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("COMMENT_CLAIM_EXPIRY_REQUIRES_REVIEW");

  const [{ data: user, error: userError }, savedSettings, token] = await Promise.all([
    supabase.from("users").select("private_chat_id").eq("id", claim.user_id).maybeSingle(),
    getSetting<Partial<PromptExpirySettings>>("bot.prompt_expiry"),
    getBotToken(),
  ]);
  if (userError || !user?.private_chat_id) throw new Error("COMMENT_CLAIM_PRIVATE_CHAT_NOT_FOUND");
  const settings = { ...DEFAULT_PROMPT_EXPIRY, ...(savedSettings ?? {}) };
  const dmMessageIds = Array.isArray(claim.dm_message_ids) ? claim.dm_message_ids.map(Number).filter(Number.isFinite) : [];
  const deletedMessageIds = Array.isArray(claim.deleted_message_ids) ? claim.deleted_message_ids.map(Number).filter(Number.isFinite) : [];
  const deletedSet = new Set(deletedMessageIds);

  try {
    const start = await supabase.from("comment_claims").update({
      expiry_status: "DELETING", deletion_started_at: new Date().toISOString(), expiry_failure_code: null,
    }).eq("id", claimId).neq("expiry_status", "OUTCOME_UNKNOWN");
    if (start.error) throw new Error("COMMENT_EXPIRY_START_SAVE_FAILED");

    for (const messageId of dmMessageIds) {
      if (deletedSet.has(messageId)) continue;
      try {
        await telegramCall<true>(token, "deleteMessage", { chat_id: user.private_chat_id, message_id: messageId });
      } catch (deleteError) {
        const telegramError = deleteError instanceof TelegramApiError ? deleteError : null;
        if (!(telegramError?.code === 400 && /message to delete not found/i.test(telegramError.description))) {
          if (telegramError?.outcomeUnknown) throw new Error("COMMENT_DELETE_OUTCOME_UNKNOWN_RETRY_SAFE");
          throw deleteError;
        }
      }
      deletedSet.add(messageId);
      const progress = await supabase.from("comment_claims").update({
        deleted_message_ids: [...deletedSet],
      }).eq("id", claimId);
      if (progress.error) throw new Error("COMMENT_DELETE_PROGRESS_SAVE_FAILED");
    }

    const deleted = await supabase.from("comment_claims").update({
      expiry_status: "DELETED", deleted_at: new Date().toISOString(), expiry_failure_code: null,
    }).eq("id", claimId);
    if (deleted.error) throw new Error("COMMENT_DELETE_COMPLETE_SAVE_FAILED");

    let noticeMessageId = claim.expiry_notice_message_id;
    if (!noticeMessageId) {
      const notice = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
        chat_id: user.private_chat_id,
        text: settings.expiry_notice.slice(0, 4096),
      });
      noticeMessageId = notice.message_id;
      const noticeSaved = await supabase.from("comment_claims").update({
        expiry_status: "NOTIFYING", expiry_notice_message_id: noticeMessageId,
      }).eq("id", claimId);
      if (noticeSaved.error) throw new OutcomeUnknownError("EXPIRY_NOTICE_SENT_BUT_SAVE_FAILED");
    }

    let offerMessageId = claim.offer_message_id;
    if (claim.upsell_mode === "PROMPT_VIRAL" && !offerMessageId) {
      const body: Record<string, unknown> = {
        chat_id: user.private_chat_id,
        text: settings.offer_text.slice(0, 4096),
      };
      if (settings.offer_button_text.trim() && /^https:\/\/t[.]me\//i.test(settings.offer_button_url.trim())) {
        body.reply_markup = { inline_keyboard: [[{
          text: settings.offer_button_text.trim().slice(0, 64),
          url: settings.offer_button_url.trim(),
        }]] };
      } else if (settings.offer_button_text.trim()) {
        body.reply_markup = { inline_keyboard: [[{
          text: settings.offer_button_text.trim().slice(0, 64),
          callback_data: "checkout:create",
        }]] };
      }
      const offer = await telegramFormattedCall<SentMessage>(token, "sendMessage", body);
      offerMessageId = offer.message_id;
      const offerSaved = await supabase.from("comment_claims").update({
        offer_message_id: offerMessageId,
      }).eq("id", claimId);
      if (offerSaved.error) throw new OutcomeUnknownError("EXPIRY_OFFER_SENT_BUT_SAVE_FAILED");
    }

    const completed = await supabase.from("comment_claims").update({
      expiry_status: "COMPLETED", offer_sent_at: claim.upsell_mode === "PROMPT_VIRAL" ? new Date().toISOString() : null, expiry_failure_code: null,
    }).eq("id", claimId);
    if (completed.error) throw new Error("COMMENT_EXPIRY_COMPLETE_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", {
        p_user_id: claim.user_id,
        p_contact_status: telegramError?.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND",
      });
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("comment_claims").update({
        expiry_status: "OUTCOME_UNKNOWN", expiry_failure_code: "TELEGRAM_OUTCOME_UNKNOWN",
      }).eq("id", claimId);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "COMMENT_EXPIRY_OUTCOME_UNKNOWN");
    }
    await supabase.from("comment_claims").update({
      expiry_status: "FAILED",
      expiry_failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : (error instanceof Error ? error.message.slice(0, 120) : "COMMENT_EXPIRY_FAILED"),
    }).eq("id", claimId);
    throw error;
  }
}

async function processCustomerOrderStatusNotification(job: Record<string, unknown>) {
  const deliveryId = String(job.entity_id ?? "");
  if (!deliveryId) throw new Error("CUSTOMER_ORDER_NOTIFICATION_ID_MISSING");
  const { data: delivery, error: deliveryError } = await supabase.from("customer_order_notification_deliveries")
    .select("id,order_id,order_status,status,telegram_message_id").eq("id", deliveryId).maybeSingle();
  if (deliveryError || !delivery) throw new Error("CUSTOMER_ORDER_NOTIFICATION_NOT_FOUND");
  if (["SENT", "SKIPPED", "BLOCKED"].includes(delivery.status)) return;
  if (delivery.status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("CUSTOMER_ORDER_NOTIFICATION_REQUIRES_REVIEW");

  const { data: orderData, error: orderError } = await supabase.from("purchase_orders")
    .select("id,order_number,user_id,product_label,amount_idr,private_chat_id,status")
    .eq("id", delivery.order_id).maybeSingle();
  if (orderError || !orderData) throw new Error("CUSTOMER_ORDER_NOTIFICATION_ORDER_NOT_FOUND");
  const order = orderData as PurchaseOrder;
  if (order.status !== delivery.order_status) {
    await supabase.from("customer_order_notification_deliveries").update({ status: "SKIPPED", failure_code: "ORDER_STATUS_CHANGED" }).eq("id", delivery.id);
    return;
  }

  const settings = { ...DEFAULT_ADMIN_NOTIFICATIONS, ...((await getSetting<Partial<AdminNotificationSettings>>("bot.admin_notifications")) ?? {}) };
  const template = delivery.order_status === "CANCELLED" ? settings.cancelled_order_text : settings.pending_order_text;
  const identity = await getMemberIdentity(order.user_id);
  const token = await getBotToken();
  await supabase.from("customer_order_notification_deliveries").update({ status: "SENDING", failure_code: null }).eq("id", delivery.id);
  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: order.private_chat_id,
      text: renderPersonalizedText(template.trim(), identity, order),
    });
    const saved = await supabase.from("customer_order_notification_deliveries").update({
      status: "SENT", telegram_message_id: sent.message_id, sent_at: new Date().toISOString(), failure_code: null,
    }).eq("id", delivery.id);
    if (saved.error) throw new OutcomeUnknownError("CUSTOMER_ORDER_NOTIFICATION_SENT_BUT_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.rpc("set_telegram_contact_status", { p_user_id: order.user_id, p_contact_status: telegramError.code === 403 ? "BLOCKED" : "CHAT_NOT_FOUND" });
      await supabase.from("customer_order_notification_deliveries").update({ status: "BLOCKED", failure_code: `TELEGRAM_${telegramError.code}` }).eq("id", delivery.id);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("customer_order_notification_deliveries").update({ status: "OUTCOME_UNKNOWN", failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", delivery.id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "CUSTOMER_ORDER_NOTIFICATION_OUTCOME_UNKNOWN");
    }
    await supabase.from("customer_order_notification_deliveries").update({ status: "FAILED", failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "CUSTOMER_ORDER_NOTIFICATION_FAILED" }).eq("id", delivery.id);
    throw error;
  }
}

async function processAdminNotification(job: Record<string, unknown>) {
  const deliveryId = String(job.entity_id ?? "");
  if (!deliveryId) throw new Error("ADMIN_NOTIFICATION_ID_MISSING");

  const { data: delivery, error: deliveryError } = await supabase.from("admin_notification_deliveries")
    .select("id,notification_type,entity_type,entity_id,status,telegram_message_id")
    .eq("id", deliveryId).maybeSingle();
  if (deliveryError || !delivery) throw new Error("ADMIN_NOTIFICATION_NOT_FOUND");
  if (delivery.status === "SENT" || delivery.status === "SKIPPED") return;
  if (delivery.status === "OUTCOME_UNKNOWN") throw new OutcomeUnknownError("ADMIN_NOTIFICATION_REQUIRES_REVIEW");

  const savedSettings = await getSetting<Partial<AdminNotificationSettings>>("bot.admin_notifications");
  const settings = { ...DEFAULT_ADMIN_NOTIFICATIONS, ...(savedSettings ?? {}) };
  if (!settings.enabled || !settings.recipient_user_id) {
    await supabase.from("admin_notification_deliveries").update({ status: "SKIPPED", failure_code: "NOTIFICATIONS_DISABLED" }).eq("id", delivery.id);
    return;
  }

  const { data: recipient, error: recipientError } = await supabase.from("users")
    .select("private_chat_id,contact_status").eq("id", settings.recipient_user_id).maybeSingle();
  if (recipientError || !recipient?.private_chat_id || recipient.contact_status !== "CONTACTABLE") {
    await supabase.from("admin_notification_deliveries").update({ status: "SKIPPED", failure_code: "RECIPIENT_NOT_CONTACTABLE" }).eq("id", delivery.id);
    return;
  }

  let order: Record<string, unknown> | null = null;
  let proof: Record<string, unknown> | null = null;
  if (delivery.entity_type === "PAYMENT_PROOF") {
    const proofResult = await supabase.from("payment_proofs")
      .select("id,status,revision,submitted_at,order_id,purchase_orders!payment_proofs_order_id_fkey!inner(id,order_number,status,product_label,amount_idr,users(username,first_name))")
      .eq("id", delivery.entity_id).maybeSingle();
    if (proofResult.error || !proofResult.data) throw new Error("ADMIN_NOTIFICATION_PROOF_NOT_FOUND");
    proof = proofResult.data as Record<string, unknown>;
    order = (Array.isArray(proof.purchase_orders) ? proof.purchase_orders[0] : proof.purchase_orders) as Record<string, unknown> | null;
    if (!order || proof.status !== "PENDING_REVIEW" || order.status !== "PENDING_VERIFICATION") {
      await supabase.from("admin_notification_deliveries").update({ status: "SKIPPED", failure_code: "PAYMENT_ALREADY_REVIEWED" }).eq("id", delivery.id);
      return;
    }
  } else {
    const orderResult = await supabase.from("purchase_orders")
      .select("id,order_number,status,product_label,amount_idr,created_at,users(username,first_name)")
      .eq("id", delivery.entity_id).maybeSingle();
    if (orderResult.error || !orderResult.data) throw new Error("ADMIN_NOTIFICATION_ORDER_NOT_FOUND");
    order = orderResult.data as Record<string, unknown>;
    if (delivery.notification_type === "ORDER_EXPIRED" && order.status !== "EXPIRED") {
      await supabase.from("admin_notification_deliveries").update({ status: "SKIPPED", failure_code: "ORDER_NOT_EXPIRED" }).eq("id", delivery.id);
      return;
    }
  }

  const buyer = (Array.isArray(order?.users) ? order?.users[0] : order?.users) as Record<string, unknown> | null;
  const buyerLabel = buyer?.username ? `@${buyer.username}` : String(buyer?.first_name ?? "Member");
  const orderNumber = String(order?.order_number ?? "Pesanan");
  const amount = formatRupiah(Number(order?.amount_idr ?? 0));
  const botNotifications = await getBotNotificationSettings();
  const renderAdminText = (template: string) => template
    .replaceAll("{order_number}", escapeTelegramHtml(orderNumber))
    .replaceAll("{buyer}", escapeTelegramHtml(buyerLabel))
    .replaceAll("{product}", escapeTelegramHtml(String(order?.product_label ?? "PEBISNIS DIGITAL TELEGRAM")))
    .replaceAll("{amount}", escapeTelegramHtml(amount));
  const texts: Record<string, string> = {
    NEW_ORDER: renderAdminText(botNotifications.admin_new_order_text),
    PAYMENT_PROOF: renderAdminText(botNotifications.admin_payment_proof_text),
    PAYMENT_REVIEW_REMINDER: renderAdminText(botNotifications.admin_payment_reminder_text),
    ORDER_EXPIRED: renderAdminText(botNotifications.admin_order_expired_text),
  };
  const text = texts[String(delivery.notification_type)] ?? "Ada aktivitas baru di pesanan PEBISNIS DIGITAL TELEGRAM.";
  const adminUrl = settings.admin_url.replace(/\/$/, "");
  const targetUrl = `${adminUrl}?order=${encodeURIComponent(String(order?.id ?? ""))}#pesanan-pembayaran`;
  const token = await getBotToken();

  await supabase.from("admin_notification_deliveries").update({ status: "SENDING", failure_code: null }).eq("id", delivery.id);
  try {
    const sent = await telegramFormattedCall<SentMessage>(token, "sendMessage", {
      chat_id: recipient.private_chat_id,
      text,
      reply_markup: { inline_keyboard: [[{ text: botNotifications.admin_open_orders_button_text.slice(0, 64), url: targetUrl }]] },
    });
    const saved = await supabase.from("admin_notification_deliveries").update({
      status: "SENT", telegram_message_id: sent.message_id, sent_at: new Date().toISOString(), failure_code: null,
    }).eq("id", delivery.id);
    if (saved.error) throw new OutcomeUnknownError("ADMIN_NOTIFICATION_SENT_BUT_SAVE_FAILED");
  } catch (error) {
    const telegramError = error instanceof TelegramApiError ? error : null;
    if (telegramError?.code === 403 || /blocked|chat not found/i.test(telegramError?.description ?? "")) {
      await supabase.from("admin_notification_deliveries").update({ status: "BLOCKED", failure_code: `TELEGRAM_${telegramError?.code ?? 0}` }).eq("id", delivery.id);
      return;
    }
    if (error instanceof OutcomeUnknownError || telegramError?.outcomeUnknown) {
      await supabase.from("admin_notification_deliveries").update({ status: "OUTCOME_UNKNOWN", failure_code: "TELEGRAM_OUTCOME_UNKNOWN" }).eq("id", delivery.id);
      throw new OutcomeUnknownError(error instanceof Error ? error.message : "ADMIN_NOTIFICATION_OUTCOME_UNKNOWN");
    }
    await supabase.from("admin_notification_deliveries").update({
      status: "FAILED", failure_code: telegramError ? `TELEGRAM_${telegramError.code}` : "ADMIN_NOTIFICATION_FAILED",
    }).eq("id", delivery.id);
    throw error;
  }
}

async function recordRun(workerId: string, leased: number, succeeded: number, failed: number, errorCode: string | null = null) {
  await supabase.rpc("record_job_worker_run", { p_worker_id: workerId, p_leased: leased, p_succeeded: succeeded, p_failed: failed, p_error_code: errorCode });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, { allow: "POST" });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!supplied) return jsonResponse({ error: "UNAUTHORIZED" }, 401);

  const { data: authorized, error: authorizationError } = await supabase.rpc("job_worker_verify_secret", { p_secret: supplied });
  if (authorizationError) return jsonResponse({ error: "AUTHORIZATION_FAILED" }, 503);
  if (authorized !== true) return jsonResponse({ error: "UNAUTHORIZED" }, 401);

  const workerId = `edge-${crypto.randomUUID()}`;
  const emergencySetting = await getSetting<Partial<EmergencyControls>>("system.emergency_controls");
  const emergencyControls = { ...DEFAULT_EMERGENCY_CONTROLS, ...(emergencySetting ?? {}) };
  const { data: jobs, error: leaseError } = await supabase.rpc("lease_scheduled_jobs", { p_worker_id: workerId, p_limit: 20, p_lease_seconds: 60 });
  if (leaseError) {
    await recordRun(workerId, 0, 0, 1, "LEASE_FAILED");
    return jsonResponse({ error: "LEASE_FAILED" }, 503);
  }

  let succeeded = 0;
  let failed = 0;
  let deferred = 0;
  for (const job of jobs ?? []) {
    try {
      const pausedControl = job.job_type === "CHANNEL_POST_PUBLISH" && !emergencyControls.channel_posting_enabled
        ? "CHANNEL_POSTING"
        : job.job_type === "BROADCAST_RECIPIENT_SEND" && !emergencyControls.broadcast_enabled
          ? "BROADCAST"
          : job.job_type === "FOLLOW_UP_STEP_SEND" && !emergencyControls.follow_up_enabled
            ? "FOLLOW_UP"
            : null;
      if (pausedControl) {
        const { data, error } = await supabase.rpc("defer_scheduled_job_for_emergency_control", {
          p_job_id: job.id, p_worker_id: workerId, p_control: pausedControl, p_delay_seconds: 60,
        });
        if (error || data !== true) throw error ?? new Error("EMERGENCY_CONTROL_DEFER_FAILED");
        deferred += 1;
        continue;
      }
      if (job.job_type === "TELEGRAM_UPDATE_SPIKE") {
        await processTelegramUpdate(job, emergencyControls);
        const { error } = await supabase.rpc("complete_telegram_update_job", { p_job_id: job.id, p_worker_id: workerId });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "CHANNEL_POST_PUBLISH") {
        await processChannelPost(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "COMMENT_CLAIM_EXPIRE") {
        await processCommentClaimExpiry(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "BROADCAST_RECIPIENT_SEND") {
        await processBroadcastRecipient(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "FOLLOW_UP_STEP_SEND") {
        await processFollowUpStep(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "PURCHASE_ACCESS_SEND") {
        await processPurchaseAccess(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "PAYMENT_PROOF_REJECT_NOTIFY") {
        await processPaymentProofRejection(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "PURCHASE_ORDER_EXPIRE") {
        await processPurchaseOrderExpiry(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "CUSTOMER_ORDER_STATUS_NOTIFY") {
        await processCustomerOrderStatusNotification(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      if (job.job_type === "ADMIN_TELEGRAM_NOTIFY") {
        await processAdminNotification(job);
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: true,
          p_retry_at: null, p_error_code: null, p_error_message: null,
        });
        if (error) throw error;
        succeeded += 1;
        continue;
      }

      {
        const { error } = await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: false,
          p_retry_at: retryAt(job.attempt_count), p_error_code: "UNSUPPORTED_JOB_TYPE",
          p_error_message: `Worker does not implement ${job.job_type}`,
        });
        if (error) throw error;
        failed += 1;
        continue;
      }
    } catch (error) {
      failed += 1;
      if (error instanceof OutcomeUnknownError) {
        await supabase.rpc("mark_scheduled_job_outcome_unknown", {
          p_job_id: job.id, p_worker_id: workerId,
          p_error_code: "DELIVERY_OUTCOME_UNKNOWN",
          p_error_message: error.message,
        });
      } else {
        await supabase.rpc("complete_scheduled_job", {
          p_job_id: job.id, p_worker_id: workerId, p_success: false,
          p_retry_at: retryAt(job.attempt_count), p_error_code: "JOB_EXECUTION_FAILED",
          p_error_message: error instanceof Error ? error.message : "Unknown worker error",
        });
      }
    }
  }

  await recordRun(workerId, jobs?.length ?? 0, succeeded, failed);
  return jsonResponse({ ok: failed === 0, leased: jobs?.length ?? 0, succeeded, failed, deferred }, failed ? 207 : 200);
});
