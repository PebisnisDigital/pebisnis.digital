import { createClient } from "npm:@supabase/supabase-js@2.112.2";
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
type TelegramMessage = {
  message_id?: number;
  message_thread_id?: number;
  chat?: TelegramChat;
  from?: TelegramIdentity;
  sender_chat?: TelegramChat;
  text?: string;
  is_automatic_forward?: boolean;
  forward_origin?: TelegramForwardOrigin;
  forward_from_message_id?: number;
  reply_to_message?: TelegramMessage;
};
type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: { id?: string; from?: TelegramIdentity; data?: string; message?: TelegramMessage };
};
type RuntimeConfig = { bot_token?: string | null; bot_username?: string | null };
type SentMessage = { message_id: number };
type ChannelPost = {
  id: string;
  image_path: string;
  caption: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHING" | "SENT" | "FAILED" | "OUTCOME_UNKNOWN" | "CANCELLED";
};
type TelegramApiEnvelope<T> = { ok?: boolean; result?: T; error_code?: number; description?: string };
type ChatMember = { status: string; is_member?: boolean };
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
  telegram_message_ids: number[];
};
type FollowUpEnrollment = {
  id: string;
  automation_id: string;
  user_id: string;
  private_chat_id: number;
  status: string;
  current_step: number;
  telegram_message_ids: number[];
};

class TelegramApiError extends Error {
  constructor(readonly code: number, readonly description: string, readonly outcomeUnknown = false) {
    super(`TELEGRAM_API_${code}:${description}`);
  }
}

class OutcomeUnknownError extends Error {}

const DEFAULT_ONBOARDING: OnboardingSettings = {
  welcome_title: "Selamat datang di Kumpulan Prompt",
  welcome_body: "Sebelum berburu prompt gratis, gabung dulu ke Channel dan Grup Diskusi. Setelah itu tekan CEK KEANGGOTAAN.",
  success_text: "Akses aktif. Sekarang kamu sudah bisa meminta prompt gratis dari postingan Channel.",
  channel_button: "GABUNG CHANNEL",
  discussion_button: "GABUNG GRUP",
  channel_url: "",
  discussion_url: "",
};

const DEFAULT_PROMPT_EXPIRY: PromptExpirySettings = {
  delete_after_seconds: 21_600,
  expiry_notice: "⏰ Prompt gratis tadi sudah dihapus otomatis.",
  offer_text: "Jangan berburu prompt satu-satu terus.\n\nPROMPT VIRAL berisi kumpulan prompt lengkap yang bisa dibuka kapan saja.\n\nKetik BELI untuk lanjut.",
  offer_button_text: "BELI PROMPT VIRAL",
  offer_button_url: "",
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

function onboardingMessage(result: Awaited<ReturnType<typeof checkMembership>>): MenuPayload {
  if (result.channelJoined && result.discussionJoined) {
    return {
      text: `✅ AKSES AKTIF\n\n${result.settings.success_text}\n\nKalau melihat posting prompt di Channel, ketik MAU di komentarnya. Bot akan mengirim prompt yang tepat ke japri ini.`,
      reply_markup: { inline_keyboard: [[{ text: "🔄 CEK LAGI", callback_data: "onboarding:check" }]] },
    };
  }

  const rows: MenuPayload["reply_markup"]["inline_keyboard"] = [];
  if (!result.channelJoined && result.channelUrl) rows.push([{ text: `📣 ${result.settings.channel_button}`.slice(0, 58), url: result.channelUrl }]);
  if (!result.discussionJoined && result.discussionUrl) rows.push([{ text: `💬 ${result.settings.discussion_button}`.slice(0, 58), url: result.discussionUrl }]);
  rows.push([{ text: "✅ CEK KEANGGOTAAN", callback_data: "onboarding:check" }]);

  const checklist = [
    `${result.channelJoined ? "✅" : "⬜"} Channel Kumpulan Prompt`,
    `${result.discussionJoined ? "✅" : "⬜"} Grup Diskusi`,
  ].join("\n");
  const linkWarning = (!result.channelJoined && !result.channelUrl) || (!result.discussionJoined && !result.discussionUrl)
    ? "\n\n⚠️ Tautan join belum diatur Admin."
    : "";
  return {
    text: `👋 ${result.settings.welcome_title}\n\n${result.settings.welcome_body}\n\n${checklist}${linkWarning}`,
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
): Promise<SentMessage> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_parameters: { message_id: commentMessageId, allow_sending_without_reply: false },
  };
  if (botUsername) {
    body.reply_markup = { inline_keyboard: [[{
      text: "BUKA BOT",
      url: `https://t.me/${botUsername}?start=onboarding`,
    }]] };
  }
  return telegramCall<SentMessage>(token, "sendMessage", body);
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

async function processCommentUpdate(updateRowId: string, message: TelegramMessage, identity: TelegramIdentity): Promise<boolean> {
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
    .eq("discussion_message_id", threadMessageId).maybeSingle();
  if (threadError) throw new Error("DISCUSSION_THREAD_READ_FAILED");
  if (!thread) return false;

  const [{ data: user, error: userError }, { data: claimPost, error: claimPostError }] = await Promise.all([
    supabase.from("users").select("id,private_chat_id").eq("telegram_user_id", identity.id).maybeSingle(),
    supabase.from("channel_posts").select("upsell_mode,comment_rule_id").eq("id", thread.channel_post_id).maybeSingle(),
  ]);
  if (userError) throw new Error("COMMENT_USER_READ_FAILED");
  if (claimPostError || !claimPost) throw new Error("COMMENT_POST_READ_FAILED");
  let ruleQuery = supabase.from("comment_automation_rules")
    .select("id,keywords,match_mode,public_success_reply,start_required_reply,membership_required_reply")
    .eq("status", "ACTIVE").order("priority").limit(20);
  if (claimPost.comment_rule_id) ruleQuery = ruleQuery.eq("id", claimPost.comment_rule_id);
  const { data: rules, error: ruleError } = await ruleQuery;
  if (ruleError) throw new Error("COMMENT_RULE_READ_FAILED");
  const rule = (rules as CommentRule[] | null)?.find((candidate) => matchesRule(message.text!, candidate));
  if (!rule) return false;
  const claim = await findOrCreateClaim({
    updateRowId, ruleId: rule.id, channelPostId: thread.channel_post_id,
    userId: user?.id ?? null, discussionChatId, commentMessageId: message.message_id,
    upsellMode: claimPost.upsell_mode === "PROMPT_VIRAL" ? "PROMPT_VIRAL" : "NONE",
  });
  if (["DELIVERED", "OUTCOME_UNKNOWN", "USER_NOT_STARTED", "MEMBERSHIP_REQUIRED", "BLOCKED"].includes(claim.status)) return true;

  const runtime = await getRuntimeConfiguration();
  if (!runtime.bot_token) throw new Error("TELEGRAM_BOT_NOT_CONFIGURED");
  if (!user?.id || !user.private_chat_id) {
    const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.start_required_reply, runtime.bot_username);
    await supabase.from("comment_claims").update({ status: "USER_NOT_STARTED", public_reply_message_id: reply.message_id }).eq("id", claim.id);
    return true;
  }

  const membership = await checkMembership(runtime.bot_token, identity.id);
  await saveMembership(user.id, membership);
  if (!membership.channelJoined || !membership.discussionJoined) {
    const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.membership_required_reply, runtime.bot_username);
    await supabase.from("comment_claims").update({ status: "MEMBERSHIP_REQUIRED", public_reply_message_id: reply.message_id }).eq("id", claim.id);
    return true;
  }

  const [postResult, claimStartResult] = await Promise.all([
    supabase.from("channel_posts").select("prompt_version_id").eq("id", thread.channel_post_id).maybeSingle(),
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
    for (; nextPart < parts.length; nextPart += 1) {
      const sent = await telegramCall<SentMessage>(runtime.bot_token, "sendMessage", {
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
      const reply = await sendCommentReply(runtime.bot_token, discussionChatId, message.message_id, rule.start_required_reply, runtime.bot_username);
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

async function processTelegramUpdate(job: Record<string, unknown>) {
  const updateRowId = String(job.entity_id ?? "");
  const { data: row, error } = await supabase.from("telegram_updates").select("payload").eq("id", updateRowId).maybeSingle();
  if (error || !row) throw new Error("TELEGRAM_UPDATE_NOT_FOUND");

  const update = row.payload as TelegramUpdate;
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
    await processCommentUpdate(updateRowId, update.message, identity);
    return;
  }

  if (!identity || identity.is_bot || chat.type !== "private") return;

  const start = parseStart(update.message?.text);
  const subscribe = isSubscribeCommand(update.message?.text);
  const callbackAction = callback?.data ?? null;
  if (!start.isStart && !subscribe && callbackAction !== "onboarding:check" && callbackAction !== "broadcast:unsubscribe") return;

  const userId = await registerUser(workspaceId, identity, chat.id);
  const responseKey = start.isStart
    ? `start:${start.parameter ?? "home"}`
    : subscribe
      ? "command:subscribe"
      : `callback:${callbackAction}`;
  const delivery = await reserveResponse(updateRowId, userId, responseKey);
  const token = await getBotToken();

  if (callback?.id) await telegramCall<true>(token, "answerCallbackQuery", { callback_query_id: callback.id });
  if (!delivery.shouldSend) return;

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
      const sent = await telegramCall<SentMessage>(token, "sendMessage", {
        chat_id: chat.id,
        text: "✅ Broadcast PROMPT VIRAL sudah dihentikan. Pesan penting dari bot dan prompt yang kamu minta tetap bisa masuk.",
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
      const sent = await telegramCall<SentMessage>(token, "sendMessage", {
        chat_id: chat.id,
        text: "✅ Broadcast PROMPT VIRAL aktif kembali. Kamu bisa menerima info dan penawaran terbaru dari bot ini.",
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
  const payload = onboardingMessage(membership);

  try {
    const sent = await telegramCall<SentMessage>(token, "sendMessage", {
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
    .select("id,campaign_id,user_id,private_chat_id,status,next_part_index,telegram_message_ids")
    .eq("id", recipientId).maybeSingle();
  if (recipientError || !recipientData) throw new Error("BROADCAST_RECIPIENT_NOT_FOUND");
  const recipient = recipientData as BroadcastRecipient;
  if (["SENT", "SKIPPED_OPTED_OUT", "BLOCKED", "OUTCOME_UNKNOWN"].includes(recipient.status)) return;

  const [{ data: campaignData, error: campaignError }, { data: preference, error: preferenceError }] = await Promise.all([
    supabase.from("broadcast_campaigns").select("id,message_parts,button_text,button_url,status").eq("id", recipient.campaign_id).maybeSingle(),
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
  if (!parts.length) throw new Error("BROADCAST_MESSAGE_EMPTY");
  const token = await getBotToken();
  let nextPart = recipient.next_part_index ?? 0;
  const messageIds = Array.isArray(recipient.telegram_message_ids) ? [...recipient.telegram_message_ids] : [];
  await supabase.from("broadcast_recipients").update({ status: "SENDING", failure_code: null, updated_at: new Date().toISOString() }).eq("id", recipient.id);
  try {
    for (; nextPart < parts.length; nextPart += 1) {
      const body: Record<string, unknown> = {
        chat_id: recipient.private_chat_id,
        text: parts[nextPart].slice(0, 4096),
      };
      if (nextPart === parts.length - 1) {
        const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
        if (campaign.button_text && campaign.button_url) buttons.push([{ text: campaign.button_text, url: campaign.button_url }]);
        if (buttons.length) body.reply_markup = { inline_keyboard: buttons };
      }
      const sent = await telegramCall<SentMessage>(token, "sendMessage", body);
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
    .select("id,automation_id,user_id,private_chat_id,status,current_step,telegram_message_ids")
    .eq("id", enrollmentId).maybeSingle();
  if (enrollmentError || !enrollmentData) throw new Error("FOLLOW_UP_ENROLLMENT_NOT_FOUND");
  const enrollment = enrollmentData as FollowUpEnrollment;
  if (["COMPLETED", "CANCELLED", "BLOCKED", "OUTCOME_UNKNOWN"].includes(enrollment.status)) return;

  const [{ data: automation, error: automationError }, { data: preference, error: preferenceError }] = await Promise.all([
    supabase.from("follow_up_automations").select("status").eq("id", enrollment.automation_id).maybeSingle(),
    supabase.from("broadcast_preferences").select("subscribed").eq("user_id", enrollment.user_id).maybeSingle(),
  ]);
  if (automationError || !automation) throw new Error("FOLLOW_UP_AUTOMATION_NOT_FOUND");
  if (preferenceError) throw new Error("FOLLOW_UP_PREFERENCE_READ_FAILED");
  if (automation.status !== "ACTIVE" || preference?.subscribed === false) {
    await supabase.from("follow_up_enrollments").update({ status: "CANCELLED", failure_code: automation.status !== "ACTIVE" ? "AUTOMATION_NOT_ACTIVE" : "BROADCAST_DISABLED" }).eq("id", enrollment.id);
    return;
  }

  const { data: step, error: stepError } = await supabase.from("follow_up_steps")
    .select("position,message_text,button_text,button_url")
    .eq("automation_id", enrollment.automation_id).eq("position", enrollment.current_step).maybeSingle();
  if (stepError || !step) throw new Error("FOLLOW_UP_STEP_NOT_FOUND");
  const token = await getBotToken();
  const body: Record<string, unknown> = { chat_id: enrollment.private_chat_id, text: String(step.message_text).slice(0, 4096) };
  if (step.button_text && step.button_url) body.reply_markup = { inline_keyboard: [[{ text: step.button_text, url: step.button_url }]] };

  await supabase.from("follow_up_enrollments").update({ status: "SENDING", failure_code: null }).eq("id", enrollment.id);
  try {
    const sent = await telegramCall<SentMessage>(token, "sendMessage", body);
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
      payload: { enrollment_id: enrollment.id, step: nextPosition },
      idempotency_key: `follow-up:${enrollment.id}:step:${nextPosition}`, status: "QUEUED", priority: 95,
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

  const [token, channelSetting, signedImage] = await Promise.all([
    getBotToken(),
    getSetting<unknown>("telegram.channel_id"),
    supabase.storage.from("channel-post-images").createSignedUrl(channelPost.image_path, 300),
  ]);
  if (signedImage.error || !signedImage.data?.signedUrl) throw new Error("CHANNEL_POST_IMAGE_SIGN_FAILED");
  const channelId = chatIdFromSetting(channelSetting);

  try {
    const sent = await telegramCall<SentMessage>(token, "sendPhoto", {
      chat_id: channelId,
      photo: signedImage.data.signedUrl,
      caption: channelPost.caption,
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
      const notice = await telegramCall<SentMessage>(token, "sendMessage", {
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
      }
      const offer = await telegramCall<SentMessage>(token, "sendMessage", body);
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
  const { data: jobs, error: leaseError } = await supabase.rpc("lease_scheduled_jobs", { p_worker_id: workerId, p_limit: 20, p_lease_seconds: 60 });
  if (leaseError) {
    await recordRun(workerId, 0, 0, 1, "LEASE_FAILED");
    return jsonResponse({ error: "LEASE_FAILED" }, 503);
  }

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    try {
      if (job.job_type === "TELEGRAM_UPDATE_SPIKE") {
        await processTelegramUpdate(job);
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
  return jsonResponse({ ok: failed === 0, leased: jobs?.length ?? 0, succeeded, failed }, failed ? 207 : 200);
});
