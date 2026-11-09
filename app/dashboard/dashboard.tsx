"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabase } from "../lib/supabase";
import batch08 from "./batch08.json";
import batch09 from "./batch09.json";
import batch10 from "./batch10.json";
import { makeEpisodeDoodleCard, type EpisodeVisual } from "./episode-visual";

type BatchEpisode = EpisodeVisual & { caption: string; material: string };
const BATCH_08_EPISODES = batch08.episodes as BatchEpisode[];
const BATCH_09_EPISODES = batch09.episodes as BatchEpisode[];
const BATCH_10_EPISODES = batch10.episodes as BatchEpisode[];

type Profile = { role: string; status: string; display_name: string | null };
type Health = { status: string; job_count: number };
type WorkerRuntime = {
  last_run_at?: string;
  leased?: number;
  succeeded?: number;
  failed?: number;
  error_code?: string | null;
};
type Gate1HResult = {
  passed?: boolean;
  completed_at?: string;
  stress_jobs?: number;
  stress_succeeded?: number;
  stress_failed?: number;
  duplicate_attempts?: number;
  concurrent_workers?: number;
  lease_recovered?: boolean;
  lease_recovery_attempt_count?: number;
  load_updates?: number;
  load_http_200?: number;
  load_transport_errors?: number;
};
type TelegramSetupResult = {
  ok?: boolean;
  configured?: boolean;
  connected?: boolean;
  error?: string;
  detail?: string;
  bot_username?: string | null;
  configured_at?: string | null;
  pending_update_count?: number | null;
  last_error_message?: string | null;
  replaced?: boolean;
  previous_bot_username?: string | null;
};

type ContractProbeResult = {
  ok?: boolean;
  action?: "member_delivery_delete" | "non_member";
  error?: string;
  detail?: string;
  member_status?: string;
  channel_bot_status?: string;
  discussion_bot_status?: string;
  sent_count?: number;
  deleted_count?: number;
};

type CatalogCategory = {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  sort_order: number;
};

type OnboardingSettings = {
  welcome_title: string;
  welcome_body: string;
  success_text: string;
  channel_button: string;
  discussion_button: string;
  channel_url: string;
  discussion_url: string;
};

type MemberStatus = {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  status: "ACTIVE" | "BLOCKED" | "DELETED_REQUESTED";
  contact_status: "CONTACTABLE" | "BLOCKED" | "CHAT_NOT_FOUND" | "UNKNOWN";
  onboarding_status: "PENDING" | "ACTIVE" | "REVOKED";
  channel_member_status: string;
  discussion_member_status: string;
  first_seen_at: string;
  last_seen_at: string;
  membership_checked_at: string | null;
};

type AudienceSegment = "ALL" | "ACTIVE" | "PENDING" | "CONTACTABLE" | "BLOCKED" | "CLAIMED" | "NEVER_CLAIMED";
type BroadcastSegment = "ALL" | "ACTIVE" | "PENDING" | "CLAIMED" | "NEVER_CLAIMED";
type BroadcastMediaType = "NONE" | "PHOTO" | "VIDEO";

type BroadcastCampaignRow = {
  id: string;
  name: string;
  audience_segment: BroadcastSegment;
  status: "SCHEDULED" | "SENDING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELLED";
  scheduled_at: string;
  total_recipients: number;
  sent_recipients: number;
  failed_recipients: number;
  skipped_recipients: number;
  created_at: string;
};

type BroadcastPreference = {
  user_id: string;
  subscribed: boolean;
  source: "DEFAULT" | "TELEGRAM_BUTTON" | "TELEGRAM_COMMAND" | "ADMIN";
  updated_at: string;
};

type FollowUpStep = { position: number; delay_minutes: number; message_text: string; button_text: string; button_url: string };
type FollowUpAutomationRow = {
  id: string;
  name: string;
  trigger_event: "ORDER_PENDING_PAYMENT";
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  created_at: string;
  follow_up_steps: FollowUpStep[];
};
type FollowUpEnrollmentRow = { id: string; automation_id: string; source_id: string; status: string; current_step: number; created_at: string };
type PaymentProofRow = {
  id: string;
  revision: number;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  storage_path: string;
  media_type: "PHOTO" | "DOCUMENT";
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  file_size: number;
  original_name: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_notice_status: string;
};
type PurchaseOrderRow = {
  id: string;
  order_number: string;
  user_id: string;
  product_label: string;
  amount_idr: number;
  is_test: boolean;
  status: "PENDING_PAYMENT" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED" | "EXPIRED";
  payment_reference: string | null;
  paid_at: string | null;
  access_delivery_status: "NOT_READY" | "QUEUED" | "SENDING" | "SENT" | "FAILED" | "BLOCKED" | "OUTCOME_UNKNOWN";
  access_sent_at: string | null;
  expires_at: string | null;
  expired_at: string | null;
  expiry_notice_status: "NOT_READY" | "QUEUED" | "SENDING" | "SENT" | "FAILED" | "BLOCKED" | "OUTCOME_UNKNOWN";
  created_at: string;
  users: { username: string | null; first_name: string | null } | null;
  payment_proofs: PaymentProofRow[];
};

type SalesPeriod = "TODAY" | "7D" | "30D" | "ALL";
type AdminWorkspace = "home" | "orders" | "content" | "members" | "settings";
type SalesReportOrder = {
  id: string;
  order_number: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  product_label: string;
  amount_idr: number;
  status: PurchaseOrderRow["status"];
  payment_reference: string | null;
  paid_at: string | null;
  access_delivery_status: PurchaseOrderRow["access_delivery_status"];
  created_at: string;
};
type SalesReport = {
  from: string | null;
  to: string | null;
  generated_at: string;
  summary: {
    total_orders: number;
    pending_payment: number;
    pending_verification: number;
    paid_orders: number;
    cancelled_orders: number;
    expired_orders: number;
    revenue_idr: number;
    conversion_rate: number;
  };
  orders: SalesReportOrder[];
};

type CheckoutSettings = {
  enabled: boolean;
  product_label: string;
  amount_idr: number;
  manual_enabled: boolean;
  bank_name: string;
  account_number: string;
  account_name: string;
  buatqris_enabled: boolean;
  buatqris_account_id: string;
  buatqris_secret_token_configured: boolean;
  buatqris_signing_secret_configured: boolean;
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
  checkout_paused_text: string;
  broadcast_unsubscribed_text: string;
  broadcast_resubscribed_text: string;
  no_pending_order_text: string;
  proof_already_received_text: string;
  invalid_proof_format_text: string;
  proof_too_large_text: string;
  inactive_order_text: string;
  proof_upload_instruction_text: string;
  proof_rejected_text: string;
  admin_new_order_text: string;
  admin_payment_proof_text: string;
  admin_payment_reminder_text: string;
  admin_order_expired_text: string;
  admin_open_orders_button_text: string;
};
type AdminProfileRow = {
  auth_user_id: string;
  email: string;
  display_name: string | null;
  role: "OPERATOR" | "ANALYST" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  created_at: string;
};
type ActivityScope = "ALL" | "PAYMENT" | "SETTINGS" | "MESSAGE" | "SYSTEM";
type ActivityEvent = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  category: ActivityScope;
  entity_type: string | null;
  entity_id: string | null;
  summary: Record<string, unknown>;
  reason: string | null;
  created_at: string;
};
type ActivityReport = {
  scope: ActivityScope;
  role: string;
  generated_at: string;
  summary: { total: number; last_24h: number; admin_actions: number; actors: number };
  events: ActivityEvent[];
};
type BackupPreview = {
  valid: boolean;
  schema_version: number;
  generated_at: string;
  restore_mode: string;
  warning: string;
  counts: Record<string, number>;
};
type SystemHealthStatus = "HEALTHY" | "ATTENTION" | "INCIDENT";
type SystemHealthCheck = {
  key: string;
  label: string;
  status: SystemHealthStatus;
  detail: string;
  last_seen_at: string | null;
  metric?: Record<string, string | number | boolean | null>;
};
type SystemHealthReport = {
  overall_status: SystemHealthStatus;
  generated_at: string;
  checks: SystemHealthCheck[];
  queue: { due: number; retry: number; processing: number; stuck: number; dead: number; outcome_unknown: number; succeeded: number };
  recent_failures: Array<{ id: string; job_type: string; status: string; attempt_count: number; last_error_code: string | null; updated_at: string }>;
  read_only: boolean;
};
type FailureCenterJob = {
  id: string;
  job_type: string;
  entity_type: string | null;
  entity_id: string | null;
  status: "DEAD" | "OUTCOME_UNKNOWN";
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  manual_retry_count: number;
  last_manual_retry_at: string | null;
};
type FailureCenterHistory = {
  id: string;
  job_id: string;
  job_type: string;
  previous_status: string;
  previous_attempt_count: number;
  previous_error_code: string | null;
  reason: string;
  actor_name: string;
  retried_at: string;
};
type FailureCenterReport = {
  summary: { dead: number; outcome_unknown: number; retryable: number; manual_retries: number };
  jobs: FailureCenterJob[];
  history: FailureCenterHistory[];
  generated_at: string;
};
type LaunchReadinessCheck = { key: string; label: string; ready: boolean; detail: string; action: string };
type LaunchReadinessReport = {
  status: "BLOCKED" | "READY_FOR_TEST" | "READY_TO_LAUNCH";
  ready_count: number;
  required_count: number;
  preflight_ready: boolean;
  final_test_started_at: string | null;
  final_test_passed: boolean;
  checks: LaunchReadinessCheck[];
  generated_at: string;
};
type EmergencyControls = {
  channel_posting_enabled: boolean;
  free_claim_enabled: boolean;
  checkout_enabled: boolean;
  follow_up_enabled: boolean;
  broadcast_enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
  reason: string;
};
type IncidentAlertSettings = { enabled: boolean; recipient_user_id: string | null; admin_url: string };
type SystemIncident = { id: string; incident_key: string; severity: "ATTENTION" | "INCIDENT"; status: "OPEN" | "RESOLVED"; detail: string; opened_at: string; resolved_at: string | null; updated_at: string };
type IncidentAlertReport = {
  settings: IncidentAlertSettings;
  open_count: number;
  incidents: SystemIncident[];
  deliveries: Array<{ id: string; incident_id: string; alert_kind: "INCIDENT" | "RECOVERY"; status: string; attempt_count: number; failure_code: string | null; created_at: string; sent_at: string | null }>;
  generated_at: string;
};

type ChannelPostRow = {
  id: string;
  caption: string;
  scheduled_at: string | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHING" | "SENT" | "FAILED" | "OUTCOME_UNKNOWN" | "CANCELLED";
  telegram_message_id: number | null;
  published_at: string | null;
  created_at: string;
  upsell_mode: "NONE" | "PROMPT_VIRAL";
  prompts: { title: string } | null;
  comment_automation_rules: { name: string } | null;
};

type ChannelPostEditorData = {
  id: string;
  status: ChannelPostRow["status"];
  scheduled_at: string | null;
  image_path: string | null;
  caption: string;
  upsell_mode: "NONE" | "PROMPT_VIRAL";
  category_id: string;
  title: string;
  parts: string[];
  automation: CommentAutomationRule;
};

type Content365Settings = {
  workspace_id: string;
  enabled: boolean;
  timezone: string;
  send_time: string;
  current_day: number;
  total_days: number;
  start_date: string | null;
  loop_enabled: boolean;
  next_run_at: string | null;
  pending_post_id: string | null;
  last_sent_at: string | null;
  last_post_id: string | null;
  last_error: string | null;
  updated_at: string;
};

type Content365Item = {
  id: string;
  day_number: number;
  source_post_id: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  created_at: string;
  updated_at: string;
};

type Content365Run = {
  id: string;
  item_id: string;
  day_number: number;
  source_post_id: string;
  channel_post_id: string;
  scheduled_for: string;
  status: "QUEUED" | "SENT" | "FAILED" | "CANCELLED";
  error_code: string | null;
  sent_at: string | null;
  created_at: string;
};

type Content365Filter = "ALL" | "EMPTY" | "ACTIVE" | "DRAFT" | "PAUSED";

type CommentAutomationRule = {
  id: string | null;
  name: string;
  keywords: string[];
  match_mode: "EXACT" | "WORD" | "CONTAINS";
  public_success_reply: string;
  start_required_reply: string;
  membership_required_reply: string;
  status: "ACTIVE" | "INACTIVE";
  priority: number;
};

const DEFAULT_POST_COMMENT_RULE: CommentAutomationRule = {
  id: null,
  name: "Automasi posting",
  keywords: ["MAU"],
  match_mode: "EXACT",
  public_success_reply: "Materi sudah dikirim ke japri ✅",
  start_required_reply: "Buka bot dan tekan START dulu agar materi bisa dikirim ke japri.",
  membership_required_reply: "Syarat join belum lengkap. Buka bot lalu cek keanggotaan.",
  status: "ACTIVE",
  priority: 100,
};

type CommentClaimStatus = {
  user_id: string | null;
  status: "RECEIVED" | "USER_NOT_STARTED" | "MEMBERSHIP_REQUIRED" | "SENDING" | "DELIVERED" | "BLOCKED" | "FAILED" | "OUTCOME_UNKNOWN";
  expiry_status: "NOT_SCHEDULED" | "SCHEDULED" | "DELETING" | "DELETED" | "NOTIFYING" | "COMPLETED" | "FAILED" | "OUTCOME_UNKNOWN";
  expires_at: string | null;
  created_at: string;
};

type PromptExpirySettings = {
  delete_after_seconds: number;
  expiry_notice: string;
  offer_text: string;
  offer_button_text: string;
  offer_button_url: string;
};

const DEFAULT_PROMPT_EXPIRY_SETTINGS: PromptExpirySettings = {
  delete_after_seconds: 21_600,
  expiry_notice: "⏰ Materi gratis tadi sudah dihapus otomatis.",
  offer_text: "Ingin belajar bisnis digital lebih lengkap?\n\nPEBISNIS DIGITAL TELEGRAM menyediakan kumpulan materi yang bisa dibuka kapan saja.\n\nKetik BELI untuk lanjut.",
  offer_button_text: "BELI SEKARANG",
  offer_button_url: "",
};

const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  enabled: false,
  product_label: "PEBISNIS DIGITAL TELEGRAM",
  amount_idr: 0,
  manual_enabled: true,
  bank_name: "",
  account_number: "",
  account_name: "",
  buatqris_enabled: false,
  buatqris_account_id: "",
  buatqris_secret_token_configured: false,
  buatqris_signing_secret_configured: false,
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

const DEFAULT_ORDER_EXPIRY_SETTINGS: OrderExpirySettings = {
  enabled: true,
  expire_after_seconds: 840,
  expiry_notice: "⏰ Waktu pembayaran untuk pesanan ini sudah habis. Pesanan ditutup otomatis. Tekan tombol di bawah jika masih ingin membeli.",
};
const DEFAULT_ADMIN_NOTIFICATION_SETTINGS: AdminNotificationSettings = {
  enabled: false,
  recipient_user_id: null,
  review_reminder_minutes: 15,
  admin_url: "https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/dashboard",
  pending_order_text: "Halo {name}, ⏳ pesanan {order_number} dibuat dan sedang menunggu pembayaran.",
  cancelled_order_text: "Halo {name}, ❌ pesanan {order_number} sudah dibatalkan. Jika masih ingin membeli, silakan buat pesanan baru.",
  paid_order_text: "Halo {name}, ✅ pembayaran {order_number} sudah dikonfirmasi. Akses PEBISNIS DIGITAL TELEGRAM kamu sudah aktif.",
};
const DEFAULT_BOT_NOTIFICATION_SETTINGS: BotNotificationSettings = {
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
  checkout_paused_text: "⏸️ Checkout sedang dijeda sementara oleh Admin. Pesanan lama dan bukti transfer tetap aman.",
  broadcast_unsubscribed_text: "✅ Broadcast PEBISNIS DIGITAL TELEGRAM sudah dihentikan. Pesan penting dari bot dan materi yang kamu minta tetap bisa masuk.",
  broadcast_resubscribed_text: "✅ Broadcast PEBISNIS DIGITAL TELEGRAM aktif kembali. Kamu bisa menerima info dan penawaran terbaru dari bot ini.",
  no_pending_order_text: "Belum ada pesanan yang menunggu pembayaran. Ketik BELI dulu, lalu kirim bukti transfer di chat ini.",
  proof_already_received_text: "✅ Bukti untuk {order_number} sudah diterima dan menunggu verifikasi Admin.",
  invalid_proof_format_text: "Format bukti belum diterima. Kirim sebagai foto, JPG, PNG, WEBP, atau PDF.",
  proof_too_large_text: "Ukuran bukti maksimal 10 MB. Kompres gambarnya, lalu kirim ulang.",
  inactive_order_text: "Pesanan ini sudah tidak menunggu pembayaran. Ketik BELI untuk melihat pesanan yang aktif.",
  proof_upload_instruction_text: "📤 UPLOAD BUKTI TRANSFER\n\nPesanan: {order_number}\n\nSekarang kirim foto bukti transfer atau file JPG, PNG, WEBP, atau PDF ke chat ini. Maksimal 10 MB.",
  proof_rejected_text: "❌ Bukti transfer {order_number} belum bisa diterima.\n\nAlasan: {reason}\n\nKirim ulang foto bukti transfer langsung ke chat ini.",
  admin_new_order_text: "🛒 ORDER BARU\n\n{order_number} · {buyer}\n{product} · {amount}\n\nStatus: MENUNGGU TRANSFER",
  admin_payment_proof_text: "🧾 BUKTI TRANSFER MASUK\n\n{order_number} · {buyer}\nNominal order: {amount}\n\nBukti menunggu ACC atau penolakan Admin.",
  admin_payment_reminder_text: "⏰ BUKTI BELUM DIPERIKSA\n\n{order_number} · {buyer}\nBukti transfer masih menunggu keputusan Admin.",
  admin_order_expired_text: "⌛ ORDER KEDALUWARSA\n\n{order_number} · {buyer}\n{amount}\n\nFollow-up sudah dihentikan otomatis.",
  admin_open_orders_button_text: "BUKA PESANAN",
};
const DEFAULT_EMERGENCY_CONTROLS: EmergencyControls = {
  channel_posting_enabled: true,
  free_claim_enabled: true,
  checkout_enabled: true,
  follow_up_enabled: true,
  broadcast_enabled: true,
  updated_at: null,
  updated_by: null,
  reason: "Pengaturan awal",
};
const DEFAULT_INCIDENT_ALERT_SETTINGS: IncidentAlertSettings = {
  enabled: false,
  recipient_user_id: null,
  admin_url: "https://prompt-viral-admin-staging.pebisnisdigital.chatgpt.site/dashboard#kesehatan-sistem",
};

const DASHBOARD_TIMEOUT_MS = 15_000;

function dateInputValueInTimeZone(date = new Date(), timeZone = "Asia/Jakarta"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localDateTimeInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function reportStart(period: SalesPeriod): string | null {
  if (period === "ALL") return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const todayWib = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+07:00`);
  const daysBack = period === "TODAY" ? 0 : period === "7D" ? 6 : 29;
  todayWib.setUTCDate(todayWib.getUTCDate() - daysBack);
  return todayWib.toISOString();
}

function csvCell(value: string | number | null): string {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    ORDER_MARKED_PAID: "Pesanan ditandai lunas",
    PAYMENT_PROOF_APPROVE: "Bukti transfer di-ACC",
    PAYMENT_PROOF_REJECT: "Bukti transfer ditolak",
    PENDING_ORDER_CREATED: "Pesanan manual dibuat",
    CHECKOUT_SETTINGS_UPDATED: "Pengaturan checkout diubah",
    ADMIN_PROFILE_GRANTED: "Admin Pembayaran ditambahkan",
    PAYMENT_ADMIN_STATUS_UPDATED: "Status Admin diubah",
    BROADCAST_CAMPAIGN_CREATED: "Broadcast dibuat",
    CHANNEL_POST_CREATED: "Posting Channel dibuat",
    FOLLOW_UP_AUTOMATION_SAVED: "Automasi follow-up disimpan",
    COMMENT_AUTOMATION_RULE_SAVED: "Automasi keyword disimpan",
    PROMPT_EXPIRY_SETTINGS_UPDATED: "Waktu hapus materi diubah",
    BACKUP_EXPORTED: "Backup data diunduh",
    BACKUP_RESTORED: "Backup data dipulihkan",
    EMERGENCY_CONTROLS_UPDATED: "Mode darurat diubah",
    INCIDENT_ALERT_SETTINGS_UPDATED: "Alarm gangguan diubah",
    JOB_MANUAL_RETRY: "Job gagal dicoba ulang",
    LAUNCH_FINAL_TEST_STARTED: "Uji transaksi final dimulai",
    TELEGRAM_BOT_REPLACED: "Bot Telegram diganti",
    TELEGRAM_BOT_CREDENTIAL_STORED: "Token bot disimpan",
    TELEGRAM_WEBHOOK_CONFIGURED: "Webhook bot dihubungkan",
  };
  return labels[action] ?? action.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function activityDetail(event: ActivityEvent): string {
  const values = Object.entries(event.summary ?? {})
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return values.join(" · ") || event.entity_type || "Tanpa detail tambahan";
}

async function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), DASHBOARD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type TelegramTag = { name: string; closing: boolean; preview: string };

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseTelegramTag(raw: string): TelegramTag | null {
  const simple = raw.match(/^<\s*(\/?)\s*(b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)\s*>$/i);
  if (simple) {
    const closing = Boolean(simple[1]);
    const originalName = simple[2].toLowerCase();
    const previewName = originalName === "tg-spoiler" ? "span" : originalName;
    const preview = originalName === "tg-spoiler"
      ? closing ? "</span>" : '<span class="telegram-spoiler">'
      : `<${closing ? "/" : ""}${previewName}>`;
    return { name: originalName, closing, preview };
  }
  const quote = raw.match(/^<\s*(\/?)\s*blockquote(?:\s+expandable)?\s*>$/i);
  if (quote) return { name: "blockquote", closing: Boolean(quote[1]), preview: quote[1] ? "</blockquote>" : "<blockquote>" };
  if (/^<\s*\/\s*a\s*>$/i.test(raw)) return { name: "a", closing: true, preview: "</a>" };
  const link = raw.match(/^<\s*a\s+href\s*=\s*(["'])(.*?)\1\s*>$/i);
  if (link) {
    try {
      const url = new URL(link[2]);
      if (!["http:", "https:", "tg:"].includes(url.protocol)) return null;
      const href = escapeHtml(url.toString()).replaceAll('"', "&quot;");
      return { name: "a", closing: false, preview: `<a href="${href}" target="_blank" rel="noreferrer">` };
    } catch { return null; }
  }
  return null;
}

function telegramPreviewHtml(value: string): string {
  const tokens: string[] = [];
  const protectedValue = value.replace(/<[^>]*>/g, (raw) => {
    const tag = parseTelegramTag(raw);
    if (!tag) return raw;
    const token = `\uE000${tokens.length}\uE001`;
    tokens.push(tag.preview);
    return token;
  });
  return tokens.reduce((html, tag, index) => html.replace(`\uE000${index}\uE001`, tag), escapeHtml(protectedValue));
}

function validateTelegramHtml(value: string): string | null {
  const stack: string[] = [];
  for (const match of value.matchAll(/<[^>]*>/g)) {
    const tag = parseTelegramTag(match[0]);
    if (!tag) {
      const looksLikeFormatting = /^<\s*\/?\s*(b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler|blockquote|a)\b/i.test(match[0]);
      if (looksLikeFormatting) return `Format Telegram tidak dikenali: ${match[0]}`;
      continue;
    }
    if (!tag.closing) stack.push(tag.name);
    else if (stack.pop() !== tag.name) return `Urutan tag ${match[0]} belum benar.`;
  }
  return stack.length ? `Tag <${stack.at(-1)}> belum ditutup.` : null;
}

function channelPostErrorText(error: unknown, isEditing: boolean): string {
  const source = typeof error === "object" && error !== null ? error as Record<string, unknown> : null;
  const message = error instanceof Error
    ? error.message
    : typeof source?.message === "string"
      ? source.message
      : "";
  const details = typeof source?.details === "string" ? source.details : "";
  const hint = typeof source?.hint === "string" ? source.hint : "";
  const code = typeof source?.code === "string" ? source.code : "";
  const diagnostic = [message, details, hint, code].filter(Boolean).join(" · ");

  const known: Array<[string, string]> = [
    ["ADMIN_ACCESS_REQUIRED", "Sesi Admin tidak memiliki izin menyimpan. Muat ulang halaman atau login kembali."],
    ["POST_NOT_EDITABLE", "Konten ini tidak bisa diedit lagi karena sudah diproses atau dipublikasikan."],
    ["POST_ALREADY_PROCESSING", "Konten sedang diproses untuk dikirim. Tunggu proses selesai sebelum mengeditnya."],
    ["ACTIVE_PROMPT_CATEGORY_REQUIRED", "Kategori konten sudah tidak aktif. Pilih kategori aktif lalu simpan kembali."],
    ["INVALID_TITLE", "Judul konten belum valid."],
    ["INVALID_PROMPT_PARTS", "Isi materi belum valid. Pastikan setiap bubble berisi teks."],
    ["INVALID_CAPTION", "Caption harus berisi 10–1.024 karakter."],
    ["INVALID_UPSELL_MODE", "Pilihan penawaran tambahan belum valid."],
    ["SCHEDULE_MUST_BE_FUTURE", "Jadwal harus dipilih minimal 30 detik dari waktu sekarang."],
    ["INVALID_IMAGE_PATH", "Lokasi gambar tidak valid. Pilih ulang gambarnya lalu simpan kembali."],
    ["INVALID_RULE_NAME", "Nama automasi keyword harus berisi 3–80 karakter."],
    ["INVALID_KEYWORDS", "Keyword belum valid. Isi minimal satu keyword yang berbeda."],
    ["INVALID_MATCH_MODE", "Cara mencocokkan keyword belum valid."],
    ["INVALID_SUCCESS_REPLY", "Balasan sukses harus berisi 3–500 karakter."],
    ["INVALID_START_REPLY", "Balasan wajib START harus berisi 3–500 karakter."],
    ["INVALID_MEMBERSHIP_REPLY", "Balasan syarat join harus berisi 3–500 karakter."],
    ["RULE_NOT_FOUND", "Aturan keyword untuk konten ini tidak ditemukan. Muat ulang halaman lalu coba kembali."],
    ["Approved prompt versions are immutable", "Materi lama sudah dikunci. Muat ulang halaman lalu simpan kembali agar sistem membuat versi baru."],
    ["permission denied for function actor_workspace_id_core", "Hak akses workspace Admin belum tersinkron. Muat ulang halaman atau login kembali."],
    ["row-level security", "Gambar tidak bisa disimpan karena akses penyimpanan ditolak. Pilih ulang gambar atau login kembali."],
  ];
  const match = known.find(([needle]) => diagnostic.toLowerCase().includes(needle.toLowerCase()));
  if (match) return match[1];
  if (diagnostic) return `${isEditing ? "Perubahan konten" : "Posting"} gagal disimpan: ${diagnostic}`;
  return isEditing ? "Perubahan konten gagal disimpan. Muat ulang halaman lalu coba kembali." : "Posting gagal dibuat. Muat ulang halaman lalu coba kembali.";
}

function TelegramFormatEditor({
  label, value, onChange, maxLength = 4000, hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  hint?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(openTag: string, closeTag: string, fallback = "teks") {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${openTag}${selected}${closeTag}${value.slice(end)}`;
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + openTag.length, start + openTag.length + selected.length);
    });
  }

  function addLink() {
    const url = window.prompt("Tempel link HTTPS:", "https://");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "tg:"].includes(parsed.protocol)) throw new Error();
      wrapSelection(`<a href="${parsed.toString().replaceAll('"', "%22")}">`, "</a>", "Buka link");
    } catch { window.alert("Link harus memakai HTTPS, HTTP, atau tg://"); }
  }

  const formatError = validateTelegramHtml(value);
  return <div className="telegram-format-editor">
    <div className="telegram-editor-label"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</div>
    <div className="telegram-format-toolbar" aria-label={`Format untuk ${label}`}>
      <button type="button" onClick={() => wrapSelection("<b>", "</b>")} title="Tebal"><b>B</b></button>
      <button type="button" onClick={() => wrapSelection("<i>", "</i>")} title="Miring"><i>I</i></button>
      <button type="button" onClick={() => wrapSelection("<u>", "</u>")} title="Garis bawah"><u>U</u></button>
      <button type="button" onClick={() => wrapSelection("<s>", "</s>")} title="Coret"><s>S</s></button>
      <button type="button" onClick={() => wrapSelection("<code>", "</code>")} title="Monospace"><code>{"<>"}</code></button>
      <button type="button" onClick={() => wrapSelection("<pre>", "</pre>")} title="Blok kode">▤</button>
      <button type="button" onClick={() => wrapSelection("<tg-spoiler>", "</tg-spoiler>")} title="Spoiler">◧</button>
      <button type="button" onClick={() => wrapSelection("<blockquote>", "</blockquote>")} title="Quote">❝</button>
      <button type="button" onClick={addLink} title="Link">🔗</button>
    </div>
    <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required spellCheck />
    {formatError ? <small className="telegram-format-error">{formatError}</small> : null}
    <details className="telegram-format-preview">
      <summary>Pratinjau Telegram</summary>
      <div dangerouslySetInnerHTML={{ __html: telegramPreviewHtml(value) }} />
    </details>
  </div>;
}

function TelegramPhonePreview({
  value,
  imageUrl,
  splitBubbles = false,
  outgoingFirst = false,
  title,
  subtitle,
}: {
  value: string;
  imageUrl?: string | null;
  splitBubbles?: boolean;
  outgoingFirst?: boolean;
  title: string;
  subtitle: string;
}) {
  const parts = (splitBubbles ? value.split(/\n\s*---\s*\n/g) : [value])
    .map((part) => part.trim())
    .filter(Boolean);

  return <div className="telegram-phone" aria-label={`Preview Telegram ${title}`}>
    <div className="telegram-phone-notch" aria-hidden="true" />
    <div className="telegram-phone-screen">
      <div className="telegram-phone-status"><span>14:23</span><span>●●● ︿ ▰</span></div>
      <header className="telegram-phone-header">
        <span className="telegram-phone-back" aria-hidden="true">‹</span>
        <span className="telegram-phone-avatar">PV</span>
        <div><strong>{title}</strong><small>{subtitle}</small></div>
        <span className="telegram-phone-menu" aria-hidden="true">⋮</span>
      </header>
      <div className="telegram-phone-chat">
        <div className="telegram-phone-date">HARI INI</div>
        {imageUrl ? <article className="telegram-phone-bubble telegram-phone-image-bubble"><img src={imageUrl} alt="Gambar yang akan dikirim ke Telegram" /><time>14:23 ✓✓</time></article> : null}
        {parts.length ? parts.map((part, index) => <article className={`telegram-phone-bubble${outgoingFirst && index === 0 ? " outgoing" : ""}`} key={`${index}-${part.slice(0, 18)}`}>
          <div dangerouslySetInnerHTML={{ __html: telegramPreviewHtml(part) }} />
          <time>14:{String(23 + index).padStart(2, "0")} ✓✓</time>
        </article>) : <article className="telegram-phone-empty">Mulai mengetik. Preview akan berubah langsung di sini.</article>}
      </div>
      <div className="telegram-phone-composer"><span>⌕</span><span className="telegram-phone-input">Pesan</span><span>⌕</span><b>➤</b></div>
    </div>
  </div>;
}

export function Dashboard({ config }: { config: SupabasePublicConfig }) {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [activeWorkspace, setActiveWorkspace] = useState<AdminWorkspace>("home");
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState<Record<Exclude<AdminWorkspace, "home">, string>>({
    orders: "pesanan-pembayaran",
    content: "buat-postingan",
    members: "daftar-member",
    settings: "pengaturan-checkout",
  });
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [health, setHealth] = useState<Health[]>([]);
  const [workerRuntime, setWorkerRuntime] = useState<WorkerRuntime | null>(null);
  const [gate1HResult, setGate1HResult] = useState<Gate1HResult | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectingBot, setConnectingBot] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [loadingBotStatus, setLoadingBotStatus] = useState(false);
  const [telegramResult, setTelegramResult] = useState<TelegramSetupResult | null>(null);
  const [runningProbe, setRunningProbe] = useState<"member_delivery_delete" | "non_member" | null>(null);
  const [probeResult, setProbeResult] = useState<ContractProbeResult | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [memberStatuses, setMemberStatuses] = useState<MemberStatus[]>([]);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [audienceSegment, setAudienceSegment] = useState<AudienceSegment>("ALL");
  const [broadcastCampaigns, setBroadcastCampaigns] = useState<BroadcastCampaignRow[]>([]);
  const [broadcastOptOutCount, setBroadcastOptOutCount] = useState(0);
  const [broadcastPreferences, setBroadcastPreferences] = useState<BroadcastPreference[]>([]);
  const [broadcastResubscribeBusy, setBroadcastResubscribeBusy] = useState<string | null>(null);
  const [broadcastName, setBroadcastName] = useState("Follow-up member aktif");
  const [broadcastSegment, setBroadcastSegment] = useState<BroadcastSegment>("ACTIVE");
  const [broadcastParts, setBroadcastParts] = useState("");
  const [broadcastMediaType, setBroadcastMediaType] = useState<BroadcastMediaType>("NONE");
  const [broadcastMediaUrl, setBroadcastMediaUrl] = useState("");
  const [broadcastButtonText, setBroadcastButtonText] = useState("");
  const [broadcastButtonUrl, setBroadcastButtonUrl] = useState("");
  const [broadcastInterval, setBroadcastInterval] = useState(10);
  const [broadcastAction, setBroadcastAction] = useState<"NOW" | "SCHEDULE">("SCHEDULE");
  const [broadcastSchedule, setBroadcastSchedule] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpAutomationRow[]>([]);
  const [followUpEnrollments, setFollowUpEnrollments] = useState<FollowUpEnrollmentRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("30D");
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [salesReportBusy, setSalesReportBusy] = useState(false);
  const [salesReportError, setSalesReportError] = useState<string | null>(null);
  const [salesRefreshKey, setSalesRefreshKey] = useState(0);
  const [orderPageSize, setOrderPageSize] = useState<10 | 50 | 100 | 200>(10);
  const [orderPage, setOrderPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderManualOpen, setOrderManualOpen] = useState(false);
  const [orderUserId, setOrderUserId] = useState("");
  const [orderProductLabel, setOrderProductLabel] = useState("PEBISNIS DIGITAL TELEGRAM");
  const [orderAmount, setOrderAmount] = useState(0);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [orderControlId, setOrderControlId] = useState<string | null>(null);
  const [orderDeleteConfirmations, setOrderDeleteConfirmations] = useState<Record<string, string>>({});
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [proofRejectionReasons, setProofRejectionReasons] = useState<Record<string, string>>({});
  const [checkoutSettings, setCheckoutSettings] = useState<CheckoutSettings>(DEFAULT_CHECKOUT_SETTINGS);
  const [buatqrisSecretToken, setBuatqrisSecretToken] = useState("");
  const [buatqrisSigningSecret, setBuatqrisSigningSecret] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [orderExpirySettings, setOrderExpirySettings] = useState<OrderExpirySettings>(DEFAULT_ORDER_EXPIRY_SETTINGS);
  const [orderExpiryDuration, setOrderExpiryDuration] = useState(14);
  const [orderExpiryUnit, setOrderExpiryUnit] = useState<"MINUTES" | "HOURS" | "DAYS">("MINUTES");
  const [orderExpiryBusy, setOrderExpiryBusy] = useState(false);
  const [orderExpiryMessage, setOrderExpiryMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminNotificationSettings, setAdminNotificationSettings] = useState<AdminNotificationSettings>(DEFAULT_ADMIN_NOTIFICATION_SETTINGS);
  const [adminNotificationBusy, setAdminNotificationBusy] = useState(false);
  const [adminNotificationMessage, setAdminNotificationMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [botNotificationSettings, setBotNotificationSettings] = useState<BotNotificationSettings>(DEFAULT_BOT_NOTIFICATION_SETTINGS);
  const [botNotificationBusy, setBotNotificationBusy] = useState(false);
  const [botNotificationMessage, setBotNotificationMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminProfiles, setAdminProfiles] = useState<AdminProfileRow[]>([]);
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [adminInviteName, setAdminInviteName] = useState("");
  const [adminAccessBusy, setAdminAccessBusy] = useState<string | null>(null);
  const [adminAccessMessage, setAdminAccessMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activityScope, setActivityScope] = useState<ActivityScope>("PAYMENT");
  const [activityReport, setActivityReport] = useState<ActivityReport | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [backupBusy, setBackupBusy] = useState<"export" | "preview" | "restore" | null>(null);
  const [backupPayload, setBackupPayload] = useState<Record<string, unknown> | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupConfirmation, setBackupConfirmation] = useState("");
  const [backupMessage, setBackupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthReport | null>(null);
  const [systemHealthBusy, setSystemHealthBusy] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [emergencyControls, setEmergencyControls] = useState<EmergencyControls>(DEFAULT_EMERGENCY_CONTROLS);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [incidentAlertReport, setIncidentAlertReport] = useState<IncidentAlertReport | null>(null);
  const [incidentAlertSettings, setIncidentAlertSettings] = useState<IncidentAlertSettings>(DEFAULT_INCIDENT_ALERT_SETTINGS);
  const [incidentAlertBusy, setIncidentAlertBusy] = useState(false);
  const [incidentAlertMessage, setIncidentAlertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [failureCenter, setFailureCenter] = useState<FailureCenterReport | null>(null);
  const [failureCenterBusy, setFailureCenterBusy] = useState<string | null>(null);
  const [failureRetryReasons, setFailureRetryReasons] = useState<Record<string, string>>({});
  const [failureCenterMessage, setFailureCenterMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [launchReadiness, setLaunchReadiness] = useState<LaunchReadinessReport | null>(null);
  const [launchReadinessBusy, setLaunchReadinessBusy] = useState(false);
  const [launchReadinessMessage, setLaunchReadinessMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [followUpName, setFollowUpName] = useState("Follow-up pembayaran belum transfer");
  const [followUpStatus, setFollowUpStatus] = useState<"DRAFT" | "ACTIVE" | "PAUSED">("DRAFT");
  const [followUpSteps, setFollowUpSteps] = useState<FollowUpStep[]>([{ position: 1, delay_minutes: 60, message_text: "", button_text: "", button_url: "" }]);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingSettings>({
    welcome_title: "Selamat datang di PEBISNIS DIGITAL TELEGRAM",
    welcome_body: "Sebelum mengambil materi gratis, gabung dulu ke Channel dan Grup Diskusi. Setelah itu tekan CEK KEANGGOTAAN.",
    success_text: "Akses aktif. Sekarang kamu sudah bisa meminta materi gratis dari postingan Channel.",
    channel_button: "GABUNG CHANNEL",
    discussion_button: "GABUNG GRUP",
    channel_url: "",
    discussion_url: "",
  });
  const [productionDestinationBusy, setProductionDestinationBusy] = useState(false);
  const [productionDestinationMessage, setProductionDestinationMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [postEditingId, setPostEditingId] = useState<string | null>(null);
  const [postReuseSourceId, setPostReuseSourceId] = useState<string | null>(null);
  const [postExistingImagePath, setPostExistingImagePath] = useState<string | null>(null);
  const [postExistingImageUrl, setPostExistingImageUrl] = useState<string | null>(null);
  const [postImageRemoved, setPostImageRemoved] = useState(false);
  const [content365Settings, setContent365Settings] = useState<Content365Settings | null>(null);
  const [content365Items, setContent365Items] = useState<Content365Item[]>([]);
  const [content365Runs, setContent365Runs] = useState<Content365Run[]>([]);
  const [content365SourcePosts, setContent365SourcePosts] = useState<ChannelPostRow[]>([]);
  const [content365Enabled, setContent365Enabled] = useState(false);
  const [content365LoopEnabled, setContent365LoopEnabled] = useState(true);
  const [content365SendTime, setContent365SendTime] = useState("06:00");
  const [content365Timezone, setContent365Timezone] = useState("Asia/Jakarta");
  const [content365TotalDays, setContent365TotalDays] = useState(365);
  const [content365SelectedDay, setContent365SelectedDay] = useState(1);
  const [content365SelectedPostId, setContent365SelectedPostId] = useState("");
  const [content365SelectedStatus, setContent365SelectedStatus] = useState<Content365Item["status"]>("ACTIVE");
  const [content365Filter, setContent365Filter] = useState<Content365Filter>("ALL");
  const [content365Page, setContent365Page] = useState(0);
  const [content365SourceSearch, setContent365SourceSearch] = useState("");
  const [content365DraggingPostId, setContent365DraggingPostId] = useState<string | null>(null);
  const [content365DraggingOrigin, setContent365DraggingOrigin] = useState<"calendar" | "library" | null>(null);
  const [content365DropDay, setContent365DropDay] = useState<number | null>(null);
  const [content365LibraryDropActive, setContent365LibraryDropActive] = useState(false);
  const [content365StartDate, setContent365StartDate] = useState(() => dateInputValueInTimeZone());
  const [content365Busy, setContent365Busy] = useState<string | null>(null);
  const [content365Message, setContent365Message] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [batchImportBusy, setBatchImportBusy] = useState<number | null>(null);
  const [batchImportProgress, setBatchImportProgress] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [postMessage, setPostMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [postCategoryId, setPostCategoryId] = useState("");
  const [postPromptParts, setPostPromptParts] = useState("");
  const [postCaption, setPostCaption] = useState("Mau materi ini? Ketik MAU di kolom komentar 👇");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postAction, setPostAction] = useState<"DRAFT" | "NOW" | "SCHEDULE">("NOW");
  const [postUpsellMode, setPostUpsellMode] = useState<"NONE" | "PROMPT_VIRAL">("NONE");
  const [postSchedule, setPostSchedule] = useState("");
  const [postActiveStep, setPostActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [commentRule, setCommentRule] = useState<CommentAutomationRule | null>(DEFAULT_POST_COMMENT_RULE);
  const [commentClaims, setCommentClaims] = useState<CommentClaimStatus[]>([]);
  const [expirySettings, setExpirySettings] = useState<PromptExpirySettings>(DEFAULT_PROMPT_EXPIRY_SETTINGS);
  const [expiryDuration, setExpiryDuration] = useState(6);
  const [expiryUnit, setExpiryUnit] = useState<"MINUTES" | "HOURS">("HOURS");
  const [expiryBusy, setExpiryBusy] = useState(false);
  const [expiryMessage, setExpiryMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const postImagePreviewUrl = useMemo(() => postImage ? URL.createObjectURL(postImage) : null, [postImage]);
  useEffect(() => () => {
    if (postImagePreviewUrl) URL.revokeObjectURL(postImagePreviewUrl);
  }, [postImagePreviewUrl]);

  async function refreshSystemHealth() {
    if (profile?.role !== "SUPER_ADMIN") return;
    if (window.location.hostname === "terminal.local" && new URLSearchParams(window.location.search).get("visual") === "onboarding") {
      const now = new Date().toISOString();
      setSystemHealth({ overall_status: "HEALTHY", generated_at: now, read_only: true,
        queue: { due: 0, retry: 0, processing: 0, stuck: 0, dead: 0, outcome_unknown: 0, succeeded: 68 }, recent_failures: [],
        checks: [
          { key: "database", label: "Database", status: "HEALTHY", detail: "Database merespons pemeriksaan Owner.", last_seen_at: now },
          { key: "telegram", label: "Bot Telegram", status: "HEALTHY", detail: "Webhook pernah terhubung dan aktivitas Telegram terakhir berhasil.", last_seen_at: now },
          { key: "worker", label: "Worker Otomatis", status: "HEALTHY", detail: "Worker berdetak normal dan batch terakhir tidak mencatat error.", last_seen_at: now },
          { key: "scheduler", label: "Jadwal Worker", status: "HEALTHY", detail: "Jadwal aktif dan pemanggilan terakhir berhasil.", last_seen_at: now },
          { key: "queue", label: "Antrean Pesan", status: "HEALTHY", detail: "Antrean bersih; tidak ada job macet atau gagal.", last_seen_at: now },
          { key: "storage", label: "Bukti Transfer", status: "HEALTHY", detail: "Ruang bukti transfer tersedia dan tetap privat.", last_seen_at: now },
        ],
      });
      return;
    }
    setSystemHealthBusy(true); setSystemHealthError(null);
    try {
      const { data, error } = await withTimeout(
        getSupabase(config).rpc("admin_system_health"),
        "Pemeriksaan sistem terlalu lama. Coba segarkan lagi.",
      );
      if (error) throw error;
      setSystemHealth(data as SystemHealthReport);
    } catch (error) {
      setSystemHealthError(error instanceof Error ? error.message : "Kesehatan sistem gagal diperiksa.");
    } finally { setSystemHealthBusy(false); }
  }

  async function refreshFailureCenter() {
    if (profile?.role !== "SUPER_ADMIN") return;
    if (window.location.hostname === "terminal.local" && new URLSearchParams(window.location.search).get("visual") === "onboarding") {
      setFailureCenter({ summary: { dead: 0, outcome_unknown: 0, retryable: 0, manual_retries: 0 }, jobs: [], history: [], generated_at: new Date().toISOString() });
      return;
    }
    setFailureCenterBusy("refresh");
    setFailureCenterMessage(null);
    try {
      const { data, error } = await withTimeout(
        getSupabase(config).rpc("admin_failure_center_report"),
        "Pusat kegagalan terlalu lama dimuat.",
      );
      if (error) throw error;
      setFailureCenter(data as FailureCenterReport);
    } catch (error) {
      setFailureCenterMessage({ type: "error", text: error instanceof Error ? error.message : "Pusat kegagalan gagal dimuat." });
    } finally { setFailureCenterBusy(null); }
  }

  useEffect(() => {
    async function load() {
      try {
        if (window.location.hostname === "terminal.local" && new URLSearchParams(window.location.search).get("visual") === "onboarding") {
          setEmail("admin@promptviral.test");
          setProfile({ role: "SUPER_ADMIN", status: "ACTIVE", display_name: "Teh Vini" });
          setMemberStatuses([
            { id: "member-vini", telegram_user_id: 11880011, username: "tehvini", first_name: "Vini", last_name: null, status: "ACTIVE", contact_status: "CONTACTABLE", onboarding_status: "ACTIVE", channel_member_status: "member", discussion_member_status: "member", first_seen_at: new Date(Date.now() - 86_400_000).toISOString(), last_seen_at: new Date().toISOString(), membership_checked_at: new Date().toISOString() },
            { id: "member-maju", telegram_user_id: 11880012, username: "maumaju", first_name: "Mau", last_name: "Maju", status: "ACTIVE", contact_status: "CONTACTABLE", onboarding_status: "PENDING", channel_member_status: "member", discussion_member_status: "left", first_seen_at: new Date(Date.now() - 43_200_000).toISOString(), last_seen_at: new Date(Date.now() - 3_600_000).toISOString(), membership_checked_at: new Date(Date.now() - 3_600_000).toISOString() },
          ]);
          setCategories([{ id: "visual-category", name: "Foto Produk AI", emoji: "📸", description: null, status: "ACTIVE", sort_order: 1 }]);
          setPostCategoryId("visual-category");
          setContent365SourcePosts([{
            id: "visual-post", caption: "Mau materi ini? Ketik MAU di kolom komentar 👇",
            scheduled_at: new Date().toISOString(), status: "SENT", telegram_message_id: 128,
            published_at: new Date().toISOString(), created_at: new Date().toISOString(), upsell_mode: "NONE",
            prompts: { title: "Foto Produk Melayang" }, comment_automation_rules: { name: "Ambil materi gratis" },
          }]);
          const visualRule: CommentAutomationRule = {
            id: "visual-rule", name: "Ambil materi gratis", keywords: ["MAU", "MAU MATERI"], match_mode: "EXACT", status: "ACTIVE", priority: 100,
            public_success_reply: "Materi sudah dikirim ke japri ✅",
            start_required_reply: "Buka bot dan tekan START dulu agar materi bisa dikirim ke japri.",
            membership_required_reply: "Syarat join belum lengkap. Buka bot lalu cek keanggotaan.",
          };
          setCommentRule(visualRule);
          setCommentClaims([{ user_id: "member-vini", status: "DELIVERED", expiry_status: "SCHEDULED", expires_at: new Date(Date.now() + 21_600_000).toISOString(), created_at: new Date().toISOString() }]);
          setBroadcastCampaigns([{ id: "visual-campaign", name: "Follow-up member aktif", audience_segment: "ACTIVE", status: "SCHEDULED", scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), total_recipients: 1, sent_recipients: 0, failed_recipients: 0, skipped_recipients: 0, created_at: new Date().toISOString() }]);
          setBroadcastPreferences([{ user_id: "member-maju", subscribed: false, source: "TELEGRAM_BUTTON", updated_at: new Date().toISOString() }]);
          setBroadcastOptOutCount(1);
          setPurchaseOrders([
            { id: "order-2", order_number: "PV-260811-003", user_id: "member-vini", product_label: "PEBISNIS DIGITAL TELEGRAM", amount_idr: 100000, is_test: true, status: "PENDING_PAYMENT", payment_reference: null, paid_at: null, access_delivery_status: "NOT_READY", access_sent_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString(), expired_at: null, expiry_notice_status: "QUEUED", created_at: new Date(Date.now() - 3_600_000).toISOString(), users: { username: "tehvini", first_name: "Vini" }, payment_proofs: [] },
            { id: "order-1", order_number: "PV-260811-004", user_id: "member-maju", product_label: "PEBISNIS DIGITAL TELEGRAM", amount_idr: 100000, is_test: false, status: "PAID", payment_reference: "BUKTI-1", paid_at: new Date().toISOString(), access_delivery_status: "SENT", access_sent_at: new Date().toISOString(), expires_at: null, expired_at: null, expiry_notice_status: "NOT_READY", created_at: new Date().toISOString(), users: { username: "maumaju", first_name: "Mau" }, payment_proofs: [] },
          ]);
          setSalesReport({
            from: reportStart("30D"), to: null, generated_at: new Date().toISOString(),
            summary: { total_orders: 12, pending_payment: 3, pending_verification: 1, paid_orders: 8, cancelled_orders: 0, expired_orders: 0, revenue_idr: 800000, conversion_rate: 66.7 },
            orders: [
              { id: "order-1", order_number: "PV-260811-004", telegram_user_id: 11880011, username: "maumaju", first_name: "Mau", product_label: "PEBISNIS DIGITAL TELEGRAM", amount_idr: 100000, status: "PAID", payment_reference: "BUKTI-1", paid_at: new Date().toISOString(), access_delivery_status: "SENT", created_at: new Date().toISOString() },
              { id: "order-2", order_number: "PV-260811-003", telegram_user_id: 11880012, username: "tehvini", first_name: "Vini", product_label: "PEBISNIS DIGITAL TELEGRAM", amount_idr: 100000, status: "PENDING_PAYMENT", payment_reference: null, paid_at: null, access_delivery_status: "NOT_READY", created_at: new Date(Date.now() - 3_600_000).toISOString() },
            ],
          });
          setActivityReport({
            scope: "PAYMENT", role: "SUPER_ADMIN", generated_at: new Date().toISOString(),
            summary: { total: 4, last_24h: 4, admin_actions: 4, actors: 1 },
            events: [
              { id: "activity-1", actor_type: "ADMIN", actor_id: "owner", actor_name: "Teh Vini", actor_role: "SUPER_ADMIN", action: "PAYMENT_PROOF_APPROVE", category: "PAYMENT", entity_type: "PURCHASE_ORDER", entity_id: "order-1", summary: { order_number: "PV-260811-004", proof_id: "BKT-004" }, reason: null, created_at: new Date().toISOString() },
              { id: "activity-2", actor_type: "ADMIN", actor_id: "owner", actor_name: "Teh Vini", actor_role: "SUPER_ADMIN", action: "ORDER_MARKED_PAID", category: "PAYMENT", entity_type: "PURCHASE_ORDER", entity_id: "order-2", summary: { order_number: "PV-260811-003" }, reason: null, created_at: new Date(Date.now() - 3_600_000).toISOString() },
            ],
          });
          const visualHealthAt = new Date().toISOString();
          setSystemHealth({ overall_status: "HEALTHY", generated_at: visualHealthAt, read_only: true,
            queue: { due: 0, retry: 0, processing: 0, stuck: 0, dead: 0, outcome_unknown: 0, succeeded: 68 }, recent_failures: [],
            checks: [
              { key: "database", label: "Database", status: "HEALTHY", detail: "Database merespons pemeriksaan Owner.", last_seen_at: visualHealthAt },
              { key: "telegram", label: "Bot Telegram", status: "HEALTHY", detail: "Webhook pernah terhubung dan aktivitas Telegram terakhir berhasil.", last_seen_at: visualHealthAt },
              { key: "worker", label: "Worker Otomatis", status: "HEALTHY", detail: "Worker berdetak normal dan batch terakhir tidak mencatat error.", last_seen_at: visualHealthAt },
              { key: "scheduler", label: "Jadwal Worker", status: "HEALTHY", detail: "Jadwal aktif dan pemanggilan terakhir berhasil.", last_seen_at: visualHealthAt },
              { key: "queue", label: "Antrean Pesan", status: "HEALTHY", detail: "Antrean bersih; tidak ada job macet atau gagal.", last_seen_at: visualHealthAt },
              { key: "storage", label: "Bukti Transfer", status: "HEALTHY", detail: "Ruang bukti transfer tersedia dan tetap privat.", last_seen_at: visualHealthAt },
            ],
          });
          setFailureCenter({ summary: { dead: 0, outcome_unknown: 0, retryable: 0, manual_retries: 0 }, jobs: [], history: [], generated_at: visualHealthAt });
          setLaunchReadiness({ status: "BLOCKED", ready_count: 6, required_count: 12, preflight_ready: false, final_test_started_at: null, final_test_passed: false, generated_at: visualHealthAt, checks: [
            { key: "bot_production", label: "Bot Produksi", ready: false, detail: "@PromptViralStagingBot masih bot pengujian.", action: "Hubungkan token bot produksi dari Pengaturan Bot." },
            { key: "channel_production", label: "Channel Produksi", ready: false, detail: "Channel masih memakai nama staging.", action: "Ganti link Channel pada Onboarding Member." },
            { key: "discussion_production", label: "Grup Produksi", ready: false, detail: "Grup masih memakai nama staging.", action: "Ganti link Grup pada Onboarding Member." },
            { key: "content_ready", label: "Konten & Keyword", ready: true, detail: "6 materi aktif · 1 automasi keyword aktif.", action: "Aktifkan minimal satu materi dan automasi keyword." },
            { key: "checkout_ready", label: "Checkout", ready: true, detail: "Status aktif · harga Rp100.000.", action: "Aktifkan checkout dan tetapkan harga jual." },
            { key: "payment_ready", label: "Rekening Pembayaran", ready: true, detail: "Rekening pembayaran sudah lengkap.", action: "Lengkapi rekening pada Tombol BELI." },
            { key: "access_ready", label: "Akses Produk", ready: true, detail: "Link akses produk sudah tersedia.", action: "Isi link akses setelah pembayaran lunas." },
            { key: "expiry_normal", label: "Batas Pembayaran", ready: true, detail: "Batas saat ini 24 jam.", action: "Kembalikan batas pembayaran ke 24 jam." },
            { key: "admin_notifications", label: "Notifikasi Admin", ready: false, detail: "Notifikasi transaksi masih OFF.", action: "Aktifkan Gate 3H." },
            { key: "incident_alerts", label: "Alarm Gangguan", ready: false, detail: "Alarm gangguan masih OFF.", action: "Aktifkan Gate 3N." },
            { key: "system_healthy", label: "Mesin Sistem", ready: true, detail: "0 job bermasalah · seluruh alur berjalan.", action: "Selesaikan gangguan sistem." },
            { key: "final_transaction", label: "Transaksi Final", ready: false, detail: "Uji final belum dimulai.", action: "Lakukan satu transaksi final." },
          ] });
          setLoadedAt(Date.now());
          setLoading(false);
          return;
        }
        const supabase = getSupabase(config);
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          "Sesi login terlalu lama diperiksa.",
        );
        const activeSession = session ?? (await withTimeout(
          supabase.auth.refreshSession(),
          "Sesi sedang dipulihkan.",
        )).data.session;
        if (!activeSession?.user) { window.location.replace("/login"); return; }
        const user = activeSession.user;
        const { data: admin, error: adminError } = await withTimeout(
          supabase.from("admin_profiles").select("role,status,display_name").eq("auth_user_id", user.id).maybeSingle(),
          "Profil admin terlalu lama diperiksa.",
        );
        if (adminError) throw adminError;
        if (!admin || admin.status !== "ACTIVE") {
          await supabase.auth.signOut();
          window.location.replace("/login");
          return;
        }
        setEmail(user.email ?? "");
        setProfile(admin);
        setErrorMessage(null);
        if (admin.role === "OPERATOR") {
          const { data: operatorOrders, error: operatorOrdersError } = await withTimeout(
            supabase.from("purchase_orders").select("id,order_number,user_id,product_label,amount_idr,is_test,status,payment_reference,paid_at,access_delivery_status,access_sent_at,expires_at,expired_at,expiry_notice_status,created_at,users(username,first_name),payment_proofs!payment_proofs_order_id_fkey(id,revision,status,storage_path,media_type,mime_type,file_size,original_name,rejection_reason,submitted_at,reviewed_at,review_notice_status)").order("created_at", { ascending: false }).limit(100),
            "Data pembayaran terlalu lama dimuat.",
          );
          if (operatorOrdersError) throw operatorOrdersError;
          setEmail(user.email ?? "");
          setProfile(admin);
          setPurchaseOrders((operatorOrders ?? []) as unknown as PurchaseOrderRow[]);
          setLoadedAt(Date.now());
          setLoading(false);
          return;
        }
        const [{ data: queue }, { data: operationSettings }, categoryResult, onboardingResult, memberResult, commentRuleResult, commentClaimResult, expirySettingsResult, checkoutSettingsResult, orderExpirySettingsResult, adminNotificationSettingsResult, botNotificationSettingsResult, broadcastResult, broadcastPreferenceResult, followUpResult, followUpEnrollmentResult, purchaseOrderResult, systemHealthResult, emergencyControlsResult, incidentAlertResult, failureCenterResult, launchReadinessResult, content365SettingsResult, content365ItemsResult, content365RunsResult, content365SourcePostsResult] = await Promise.all([
          withTimeout(
            supabase.from("ops_job_health").select("status,job_count"),
            "Data operasi terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("key,value").in("key", ["worker.runtime", "gate1h.result"]),
            "Status worker terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("categories").select("id,name,emoji,description,status,sort_order").eq("kind", "PROMPT").order("sort_order").order("name"),
            "Kategori terlalu lama dimuat.",
          ),
          withTimeout(supabase.from("system_settings").select("value").eq("key", "bot.onboarding").maybeSingle(), "Pengaturan onboarding terlalu lama dimuat."),
          withTimeout(
            supabase.from("users").select("id,telegram_user_id,username,first_name,last_name,status,contact_status,onboarding_status,channel_member_status,discussion_member_status,first_seen_at,last_seen_at,membership_checked_at").order("last_seen_at", { ascending: false }).limit(500),
            "Data member terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("comment_automation_rules").select("id,name,keywords,match_mode,public_success_reply,start_required_reply,membership_required_reply,status,priority").order("priority").order("created_at"),
            "Aturan komentar terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("comment_claims").select("user_id,status,expiry_status,expires_at,created_at").order("created_at", { ascending: false }).limit(1000),
            "Riwayat komentar terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", "bot.prompt_expiry").maybeSingle(),
            "Pengaturan hapus materi terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", "bot.checkout").maybeSingle(),
            "Pengaturan checkout terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", "bot.order_expiry").maybeSingle(),
            "Pengaturan batas pembayaran terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", "bot.admin_notifications").maybeSingle(),
            "Pengaturan notifikasi Admin terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("system_settings").select("value").eq("key", "bot.notifications").maybeSingle(),
            "Pengaturan redaksi bot terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("broadcast_campaigns").select("id,name,audience_segment,status,scheduled_at,total_recipients,sent_recipients,failed_recipients,skipped_recipients,created_at").order("created_at", { ascending: false }).limit(20),
            "Riwayat broadcast terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("broadcast_preferences").select("user_id,subscribed,source,updated_at"),
            "Data berhenti broadcast terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("follow_up_automations").select("id,name,trigger_event,status,created_at,follow_up_steps(position,delay_minutes,message_text,button_text,button_url)").order("created_at", { ascending: false }),
            "Automasi follow-up terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("follow_up_enrollments").select("id,automation_id,source_id,status,current_step,created_at").order("created_at", { ascending: false }).limit(100),
            "Riwayat follow-up terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("purchase_orders").select("id,order_number,user_id,product_label,amount_idr,is_test,status,payment_reference,paid_at,access_delivery_status,access_sent_at,expires_at,expired_at,expiry_notice_status,created_at,users(username,first_name),payment_proofs!payment_proofs_order_id_fkey(id,revision,status,storage_path,media_type,mime_type,file_size,original_name,rejection_reason,submitted_at,reviewed_at,review_notice_status)").order("created_at", { ascending: false }).limit(100),
            "Data pesanan terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.rpc("admin_system_health"),
            "Kesehatan sistem terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.rpc("admin_get_emergency_controls"),
            "Mode darurat terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.rpc("admin_incident_alert_report"),
            "Alarm gangguan terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.rpc("admin_failure_center_report"),
            "Pusat kegagalan terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.rpc("admin_launch_readiness_report"),
            "Kesiapan launch terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("content_365_settings").select("workspace_id,enabled,timezone,send_time,current_day,total_days,start_date,loop_enabled,next_run_at,pending_post_id,last_sent_at,last_post_id,last_error,updated_at").maybeSingle(),
            "Pengaturan Konten 365 terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("content_365_items").select("id,day_number,source_post_id,status,created_at,updated_at").order("day_number"),
            "Kalender Konten 365 terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("content_365_runs").select("id,item_id,day_number,source_post_id,channel_post_id,scheduled_for,status,error_code,sent_at,created_at").order("created_at", { ascending: false }).limit(50),
            "Riwayat Konten 365 terlalu lama dimuat.",
          ),
          withTimeout(
            supabase.from("channel_posts").select("id,caption,scheduled_at,status,telegram_message_id,published_at,created_at,upsell_mode,prompts(title),comment_automation_rules(name)").order("created_at", { ascending: false }).limit(500),
            "Sumber posting Konten 365 terlalu lama dimuat.",
          ),
        ]);
        if (categoryResult.error) throw categoryResult.error;
        if (onboardingResult.error) throw onboardingResult.error;
        if (memberResult.error) throw memberResult.error;
        if (commentRuleResult.error) throw commentRuleResult.error;
        if (commentClaimResult.error) throw commentClaimResult.error;
        if (expirySettingsResult.error) throw expirySettingsResult.error;
        if (checkoutSettingsResult.error) throw checkoutSettingsResult.error;
        if (orderExpirySettingsResult.error) throw orderExpirySettingsResult.error;
        if (adminNotificationSettingsResult.error) throw adminNotificationSettingsResult.error;
        if (botNotificationSettingsResult.error) throw botNotificationSettingsResult.error;
        if (broadcastResult.error) throw broadcastResult.error;
        if (broadcastPreferenceResult.error) throw broadcastPreferenceResult.error;
        if (followUpResult.error) throw followUpResult.error;
        if (followUpEnrollmentResult.error) throw followUpEnrollmentResult.error;
        if (purchaseOrderResult.error) throw purchaseOrderResult.error;
        if (systemHealthResult.error) setSystemHealthError(systemHealthResult.error.message);
        if (failureCenterResult.error) setFailureCenterMessage({ type: "error", text: failureCenterResult.error.message });
        if (launchReadinessResult.error) setLaunchReadinessMessage({ type: "error", text: launchReadinessResult.error.message });
        const content365LoadError = content365SettingsResult.error
          ?? content365ItemsResult.error
          ?? content365RunsResult.error
          ?? content365SourcePostsResult.error;
        if (content365LoadError) setContent365Message({ type: "error", text: content365LoadError.message });
        const workerSetting = operationSettings?.find((item) => item.key === "worker.runtime");
        const gate1HSetting = operationSettings?.find((item) => item.key === "gate1h.result");
        setEmail(user.email ?? ""); setProfile(admin); setHealth((queue ?? []) as Health[]); setLoading(false);
        setWorkerRuntime(
          workerSetting?.value && typeof workerSetting.value === "object"
            ? workerSetting.value as WorkerRuntime
            : null,
        );
        setGate1HResult(
          gate1HSetting?.value && typeof gate1HSetting.value === "object"
            ? gate1HSetting.value as Gate1HResult
            : null,
        );
        setCategories((categoryResult.data ?? []) as CatalogCategory[]);
        setPostCategoryId(categoryResult.data?.[0]?.id ?? "");
        const onboardingValue = onboardingResult.data?.value;
        if (onboardingValue && typeof onboardingValue === "object") {
          setOnboarding((current) => ({ ...current, ...(onboardingValue as Partial<OnboardingSettings>) }));
        }
        setMemberStatuses((memberResult.data ?? []) as MemberStatus[]);
        setOrderUserId(((memberResult.data ?? []) as MemberStatus[]).find((member) => member.contact_status === "CONTACTABLE")?.id ?? "");
        if (content365SettingsResult.data) {
          const loadedContent365Settings = content365SettingsResult.data as Content365Settings;
          setContent365Settings(loadedContent365Settings);
          setContent365Enabled(loadedContent365Settings.enabled);
          setContent365LoopEnabled(loadedContent365Settings.loop_enabled);
          setContent365SendTime(String(loadedContent365Settings.send_time).slice(0, 5));
          setContent365Timezone(loadedContent365Settings.timezone);
          setContent365TotalDays(loadedContent365Settings.total_days);
          setContent365SelectedDay(loadedContent365Settings.current_day);
          setContent365Page(Math.floor((loadedContent365Settings.current_day - 1) / 30));
          setContent365StartDate(loadedContent365Settings.start_date ?? dateInputValueInTimeZone(new Date(), loadedContent365Settings.timezone));
        }
        const loadedContent365Items = (content365ItemsResult.data ?? []) as Content365Item[];
        setContent365Items(loadedContent365Items);
        const initialContent365Day = (content365SettingsResult.data as Content365Settings | null)?.current_day ?? 1;
        const initialContent365Item = loadedContent365Items.find((item) => item.day_number === initialContent365Day);
        setContent365SelectedPostId(initialContent365Item?.source_post_id ?? "");
        setContent365SelectedStatus(initialContent365Item?.status ?? "ACTIVE");
        setContent365Runs((content365RunsResult.data ?? []) as Content365Run[]);
        setContent365SourcePosts((content365SourcePostsResult.data ?? []) as unknown as ChannelPostRow[]);
        const loadedRules = (commentRuleResult.data ?? []) as CommentAutomationRule[];
        setCommentRule(loadedRules.find((rule) => rule.status === "ACTIVE") ?? loadedRules[0] ?? DEFAULT_POST_COMMENT_RULE);
        setCommentClaims((commentClaimResult.data ?? []) as CommentClaimStatus[]);
        setBroadcastCampaigns((broadcastResult.data ?? []) as BroadcastCampaignRow[]);
        const loadedBroadcastPreferences = (broadcastPreferenceResult.data ?? []) as BroadcastPreference[];
        setBroadcastPreferences(loadedBroadcastPreferences);
        setBroadcastOptOutCount(loadedBroadcastPreferences.filter((item) => !item.subscribed).length);
        setFollowUps(((followUpResult.data ?? []) as unknown as FollowUpAutomationRow[]).map((automation) => ({
          ...automation,
          follow_up_steps: [...(automation.follow_up_steps ?? [])].sort((a, b) => a.position - b.position),
        })));
        setFollowUpEnrollments((followUpEnrollmentResult.data ?? []) as FollowUpEnrollmentRow[]);
        setPurchaseOrders((purchaseOrderResult.data ?? []) as unknown as PurchaseOrderRow[]);
        if (systemHealthResult.data) setSystemHealth(systemHealthResult.data as SystemHealthReport);
        if (emergencyControlsResult.data) setEmergencyControls({ ...DEFAULT_EMERGENCY_CONTROLS, ...(emergencyControlsResult.data as Partial<EmergencyControls>) });
        if (incidentAlertResult.data) {
          const loadedIncidentAlerts = incidentAlertResult.data as IncidentAlertReport;
          setIncidentAlertReport(loadedIncidentAlerts);
          setIncidentAlertSettings({ ...DEFAULT_INCIDENT_ALERT_SETTINGS, ...(loadedIncidentAlerts?.settings ?? {}) });
        }
        if (failureCenterResult.data) setFailureCenter(failureCenterResult.data as FailureCenterReport);
        if (launchReadinessResult.data) setLaunchReadiness(launchReadinessResult.data as LaunchReadinessReport);
        const expiryValue = expirySettingsResult.data?.value;
        if (expiryValue && typeof expiryValue === "object") {
          const normalized = { ...DEFAULT_PROMPT_EXPIRY_SETTINGS, ...(expiryValue as Partial<PromptExpirySettings>) };
          setExpirySettings(normalized);
          if (normalized.delete_after_seconds % 3600 === 0) {
            setExpiryDuration(normalized.delete_after_seconds / 3600);
            setExpiryUnit("HOURS");
          } else {
            setExpiryDuration(Math.max(1, Math.round(normalized.delete_after_seconds / 60)));
            setExpiryUnit("MINUTES");
          }
        }
        const checkoutValue = checkoutSettingsResult.data?.value;
        if (checkoutValue && typeof checkoutValue === "object") {
          const normalizedCheckout = { ...DEFAULT_CHECKOUT_SETTINGS, ...(checkoutValue as Partial<CheckoutSettings>) };
          setCheckoutSettings(normalizedCheckout);
          setOrderProductLabel(normalizedCheckout.product_label);
          setOrderAmount(normalizedCheckout.amount_idr);
        }
        const orderExpiryValue = orderExpirySettingsResult.data?.value;
        if (orderExpiryValue && typeof orderExpiryValue === "object") {
          const normalizedOrderExpiry = { ...DEFAULT_ORDER_EXPIRY_SETTINGS, ...(orderExpiryValue as Partial<OrderExpirySettings>) };
          setOrderExpirySettings(normalizedOrderExpiry);
          if (normalizedOrderExpiry.expire_after_seconds % 86400 === 0) {
            setOrderExpiryDuration(normalizedOrderExpiry.expire_after_seconds / 86400);
            setOrderExpiryUnit("DAYS");
          } else if (normalizedOrderExpiry.expire_after_seconds % 3600 === 0) {
            setOrderExpiryDuration(normalizedOrderExpiry.expire_after_seconds / 3600);
            setOrderExpiryUnit("HOURS");
          } else {
            setOrderExpiryDuration(Math.max(1, Math.round(normalizedOrderExpiry.expire_after_seconds / 60)));
            setOrderExpiryUnit("MINUTES");
          }
        }
        const adminNotificationValue = adminNotificationSettingsResult.data?.value;
        if (adminNotificationValue && typeof adminNotificationValue === "object") {
          setAdminNotificationSettings({ ...DEFAULT_ADMIN_NOTIFICATION_SETTINGS, ...(adminNotificationValue as Partial<AdminNotificationSettings>) });
        }
        const botNotificationValue = botNotificationSettingsResult.data?.value;
        if (botNotificationValue && typeof botNotificationValue === "object") {
          setBotNotificationSettings({ ...DEFAULT_BOT_NOTIFICATION_SETTINGS, ...(botNotificationValue as Partial<BotNotificationSettings>) });
        }
        setLoadedAt(Date.now());
        if (admin.role === "SUPER_ADMIN") {
          const { data: profiles, error: profilesError } = await supabase.rpc("admin_list_profiles");
          if (!profilesError) setAdminProfiles((profiles ?? []) as AdminProfileRow[]);
          setLoadingBotStatus(true);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const response = await withTimeout(
                fetch(`${config.url}/functions/v1/telegram-webhook`, {
                  method: "GET",
                  headers: {
                    authorization: `Bearer ${session.access_token}`,
                    apikey: config.publishableKey,
                  },
                }),
                "Status bot terlalu lama diperiksa.",
              );
              const result = await response.json() as TelegramSetupResult;
              setTelegramResult(response.ok ? result : { error: result.detail || result.error || "Status bot gagal diperiksa." });
            }
          } catch (error) {
            setTelegramResult({ error: error instanceof Error ? error.message : "Status bot gagal diperiksa." });
          } finally {
            setLoadingBotStatus(false);
          }
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Dashboard gagal dimuat.");
        setLoading(false);
      }
    }
    load();
  }, [config, dashboardRefreshKey]);

  useEffect(() => {
    if (!categoryModalOpen || window.matchMedia("(min-width: 900px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoryModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryModalOpen]);

  useEffect(() => {
    const refresh = () => setDashboardRefreshKey((value) => value + 1);
    const interval = window.setInterval(refresh, 60_000);
    const onFocus = () => {
      if (Date.now() - loadedAt > 30_000) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadedAt]);

  useEffect(() => {
    if (!profile) return;
    if (window.location.hostname === "terminal.local" && new URLSearchParams(window.location.search).get("visual") === "onboarding") return;
    let cancelled = false;
    async function loadSalesReport() {
      setSalesReportBusy(true);
      setSalesReportError(null);
      try {
        const { data, error } = await withTimeout(
          getSupabase(config).rpc("admin_sales_report", { p_from: reportStart(salesPeriod), p_to: null }),
          "Laporan penjualan terlalu lama dimuat.",
        );
        if (error) throw error;
        if (!cancelled) setSalesReport(data as SalesReport);
      } catch (error) {
        if (!cancelled) setSalesReportError(error instanceof Error ? error.message : "Laporan penjualan gagal dimuat.");
      } finally {
        if (!cancelled) setSalesReportBusy(false);
      }
    }
    loadSalesReport();
    return () => { cancelled = true; };
  }, [config, profile, salesPeriod, salesRefreshKey]);

  useEffect(() => {
    if (!profile) return;
    if (window.location.hostname === "terminal.local" && new URLSearchParams(window.location.search).get("visual") === "onboarding") return;
    let cancelled = false;
    async function loadActivity() {
      setActivityBusy(true);
      setActivityError(null);
      try {
        const requestedScope = profile?.role === "OPERATOR" ? "PAYMENT" : activityScope;
        const { data, error } = await withTimeout(
          getSupabase(config).rpc("admin_activity_report", { p_scope: requestedScope, p_limit: 100 }),
          "Riwayat aktivitas terlalu lama dimuat.",
        );
        if (error) throw error;
        if (!cancelled) setActivityReport(data as ActivityReport);
      } catch (error) {
        if (!cancelled) setActivityError(error instanceof Error ? error.message : "Riwayat aktivitas gagal dimuat.");
      } finally {
        if (!cancelled) setActivityBusy(false);
      }
    }
    loadActivity();
    return () => { cancelled = true; };
  }, [activityRefreshKey, activityScope, config, profile]);

  async function connectTelegramBot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectingBot(true);
    setTelegramResult(null);
    const submittedToken = botToken.trim();
    try {
      const supabase = getSupabase(config);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sesi admin tidak ditemukan. Silakan login ulang.");

      const response = await withTimeout(
        fetch(`${config.url}/functions/v1/telegram-webhook`, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: config.publishableKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(submittedToken ? { bot_token: submittedToken } : {}),
        }),
        "Pemasangan webhook terlalu lama. Coba lagi sebentar.",
      );
      const result = await response.json() as TelegramSetupResult;
      if (!response.ok) {
        if (result.error === "SERVICE_NOT_CONFIGURED") {
          throw new Error("Secret bot staging belum lengkap di Supabase.");
        }
        throw new Error(result.detail || result.error || "Webhook Telegram gagal dipasang.");
      }
      setBotToken("");
      setTelegramResult(result);
    } catch (error) {
      setTelegramResult({ error: error instanceof Error ? error.message : "Webhook Telegram gagal dipasang." });
    } finally {
      setConnectingBot(false);
    }
  }

  async function signOut() {
    await getSupabase(config).auth.signOut();
    window.location.replace("/login");
  }

  async function refreshAdminProfiles() {
    const { data, error } = await getSupabase(config).rpc("admin_list_profiles");
    if (error) throw error;
    setAdminProfiles((data ?? []) as AdminProfileRow[]);
  }

  async function invitePaymentAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminAccessBusy("invite");
    setAdminAccessMessage(null);
    try {
      const supabase = getSupabase(config);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sesi Owner tidak ditemukan.");
      const response = await fetch(`${config.url}/functions/v1/admin-invite`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.publishableKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: adminInviteEmail.trim(), display_name: adminInviteName.trim() }),
      });
      const result = await response.json() as { ok?: boolean; invited?: boolean; error?: string; detail?: string };
      if (!response.ok) throw new Error(result.detail || result.error || "Undangan Admin gagal dikirim.");
      await refreshAdminProfiles();
      setAdminInviteEmail("");
      setAdminInviteName("");
      setAdminAccessMessage({
        type: "success",
        text: result.invited ? "Undangan dikirim. Admin hanya mendapat akses pembayaran." : "Akun lama diaktifkan sebagai Admin Pembayaran.",
      });
    } catch (error) {
      setAdminAccessMessage({ type: "error", text: error instanceof Error ? error.message : "Admin gagal ditambahkan." });
    } finally {
      setAdminAccessBusy(null);
    }
  }

  async function togglePaymentAdmin(admin: AdminProfileRow) {
    const nextStatus = admin.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setAdminAccessBusy(admin.auth_user_id);
    setAdminAccessMessage(null);
    try {
      const { error } = await getSupabase(config).rpc("admin_set_payment_admin_status", {
        p_auth_user_id: admin.auth_user_id,
        p_status: nextStatus,
      });
      if (error) throw error;
      setAdminProfiles((current) => current.map((item) => item.auth_user_id === admin.auth_user_id ? { ...item, status: nextStatus } : item));
      setAdminAccessMessage({ type: "success", text: nextStatus === "ACTIVE" ? "Akses Admin diaktifkan kembali." : "Akses Admin dihentikan." });
    } catch (error) {
      setAdminAccessMessage({ type: "error", text: error instanceof Error ? error.message : "Status Admin gagal diubah." });
    } finally {
      setAdminAccessBusy(null);
    }
  }

  async function saveProductionDestinations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductionDestinationBusy(true);
    setProductionDestinationMessage(null);
    try {
      if (!onboarding.channel_url.trim() || !onboarding.discussion_url.trim()) {
        throw new Error("Link Channel dan Grup wajib diisi.");
      }
      const supabase = getSupabase(config);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sesi Owner tidak ditemukan.");
      const response = await fetch(`${config.url}/functions/v1/admin-telegram-destinations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.publishableKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channel_url: onboarding.channel_url.trim(),
          discussion_url: onboarding.discussion_url.trim(),
        }),
      });
      const result = await response.json() as {
        ok?: boolean;
        error?: string;
        detail?: string;
        channel?: { title: string; url: string };
        discussion?: { title: string; url: string };
      };
      if (!response.ok || !result.ok || !result.channel || !result.discussion) {
        throw new Error(result.detail || result.error || "Tujuan Telegram gagal diperbarui.");
      }
      setOnboarding((current) => ({
        ...current,
        channel_url: result.channel?.url ?? current.channel_url,
        discussion_url: result.discussion?.url ?? current.discussion_url,
      }));
      setProductionDestinationMessage({
        type: "success",
        text: `${result.channel.title} dan ${result.discussion.title} sudah menjadi tujuan produksi bot.`,
      });
      void refreshLaunchReadiness();
    } catch (error) {
      setProductionDestinationMessage({ type: "error", text: error instanceof Error ? error.message : "Tujuan Telegram gagal diperbarui." });
    } finally {
      setProductionDestinationBusy(false);
    }
  }

  async function saveExpirySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpiryBusy(true);
    setExpiryMessage(null);
    try {
      const seconds = Math.round(expiryDuration * (expiryUnit === "HOURS" ? 3600 : 60));
      if (!Number.isFinite(seconds) || seconds < 60 || seconds > 604_800) throw new Error("Durasi harus antara 1 menit dan 7 hari.");
      if (expirySettings.expiry_notice.trim().length < 3) throw new Error("Pesan penghapusan terlalu pendek.");
      if (expirySettings.offer_text.trim().length < 3) throw new Error("Pesan penawaran terlalu pendek.");
      const expiryFormatError = [expirySettings.expiry_notice, expirySettings.offer_text].map(validateTelegramHtml).find(Boolean);
      if (expiryFormatError) throw new Error(expiryFormatError);
      if (expirySettings.offer_button_url && !/^https:\/\/t[.]me\//i.test(expirySettings.offer_button_url)) {
        throw new Error("Link tombol harus memakai format https://t.me/...");
      }
      const { data, error } = await getSupabase(config).rpc("admin_update_prompt_expiry_settings", {
        p_delete_after_seconds: seconds,
        p_expiry_notice: expirySettings.expiry_notice.trim(),
        p_offer_text: expirySettings.offer_text.trim(),
        p_offer_button_text: expirySettings.offer_button_text.trim(),
        p_offer_button_url: expirySettings.offer_button_url.trim(),
      });
      if (error) throw error;
      setExpirySettings(data as PromptExpirySettings);
      setExpiryMessage({ type: "success", text: "Aturan penghapusan tersimpan. Klaim baru langsung memakai durasi ini." });
    } catch (error) {
      setExpiryMessage({ type: "error", text: error instanceof Error ? error.message : "Aturan penghapusan gagal disimpan." });
    } finally {
      setExpiryBusy(false);
    }
  }

  async function refreshBroadcastCampaigns() {
    const { data, error } = await getSupabase(config).from("broadcast_campaigns")
      .select("id,name,audience_segment,status,scheduled_at,total_recipients,sent_recipients,failed_recipients,skipped_recipients,created_at")
      .order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    setBroadcastCampaigns((data ?? []) as BroadcastCampaignRow[]);
  }

  async function resubscribeBroadcast(userId: string) {
    setBroadcastResubscribeBusy(userId);
    setBroadcastMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_resubscribe_broadcast", { p_user_id: userId });
      if (error) throw error;
      const preference = data as BroadcastPreference;
      setBroadcastPreferences((current) => {
        const remaining = current.filter((item) => item.user_id !== userId);
        return [...remaining, preference];
      });
      setBroadcastOptOutCount((current) => Math.max(0, current - 1));
      setBroadcastMessage({ type: "success", text: "Broadcast member aktif kembali. Kampanye berikutnya bisa memasukkan akun ini." });
    } catch (error) {
      setBroadcastMessage({ type: "error", text: error instanceof Error ? error.message : "Broadcast member gagal diaktifkan." });
    } finally {
      setBroadcastResubscribeBusy(null);
    }
  }

  async function createBroadcastCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBroadcastBusy(true);
    setBroadcastMessage(null);
    try {
      const parts = broadcastParts.split(/\n\s*---\s*\n/g).map((part) => part.trim()).filter(Boolean);
      if (broadcastName.trim().length < 3) throw new Error("Nama kampanye terlalu pendek.");
      if (!parts.length || parts.length > 10) throw new Error("Isi 1–10 bubble broadcast.");
      if (parts.some((part) => part.length > 4096)) throw new Error("Setiap bubble maksimal 4.096 karakter.");
      if (broadcastMediaType !== "NONE" && !/^https:\/\//i.test(broadcastMediaUrl.trim())) throw new Error("Link gambar atau video harus URL publik yang diawali https://");
      if (broadcastMediaType === "NONE" && broadcastMediaUrl.trim()) throw new Error("Pilih jenis media atau kosongkan link medianya.");
      if (!Number.isFinite(broadcastInterval) || broadcastInterval < 10 || broadcastInterval > 60) throw new Error("Jeda kirim harus 10–60 detik.");
      if ((broadcastButtonText.trim() && !broadcastButtonUrl.trim()) || (!broadcastButtonText.trim() && broadcastButtonUrl.trim())) throw new Error("Teks dan link tombol harus diisi berpasangan.");
      if (broadcastButtonUrl && !/^https:\/\//i.test(broadcastButtonUrl)) throw new Error("Link tombol harus diawali https://");
      let scheduledAt = new Date().toISOString();
      if (broadcastAction === "SCHEDULE") {
        const selected = new Date(broadcastSchedule);
        if (!broadcastSchedule || !Number.isFinite(selected.getTime())) throw new Error("Pilih tanggal dan jam broadcast.");
        if (selected.getTime() < Date.now() + 30_000) throw new Error("Jadwal minimal 30 detik dari sekarang.");
        scheduledAt = selected.toISOString();
      }
      const { data, error } = await getSupabase(config).rpc("admin_create_broadcast_campaign_with_media", {
        p_name: broadcastName.trim(),
        p_audience_segment: broadcastSegment,
        p_message_parts: parts,
        p_button_text: broadcastButtonText.trim(),
        p_button_url: broadcastButtonUrl.trim(),
        p_opt_out_button_text: "DISABLED",
        p_send_interval_seconds: Math.round(broadcastInterval),
        p_scheduled_at: scheduledAt,
        p_media_type: broadcastMediaType === "NONE" ? null : broadcastMediaType,
        p_media_url: broadcastMediaType === "NONE" ? null : broadcastMediaUrl.trim(),
      });
      if (error) throw error;
      const created = data as BroadcastCampaignRow;
      await refreshBroadcastCampaigns();
      setBroadcastParts("");
      setBroadcastMediaType("NONE");
      setBroadcastMediaUrl("");
      setBroadcastSchedule("");
      setBroadcastMessage({
        type: "success",
        text: created.total_recipients > 0
          ? `${created.total_recipients} penerima dikunci. ${broadcastAction === "NOW" ? "Pengiriman masuk antrean." : "Jadwal tersimpan."}`
          : "Kampanye tersimpan, tetapi segmen ini tidak memiliki penerima yang bisa dijapri.",
      });
    } catch (error) {
      setBroadcastMessage({ type: "error", text: error instanceof Error ? error.message : "Broadcast gagal dibuat." });
    } finally {
      setBroadcastBusy(false);
    }
  }

  function resetFollowUpForm() {
    setFollowUpId(null);
    setFollowUpName("Follow-up pembayaran belum transfer");
    setFollowUpStatus("DRAFT");
    setFollowUpSteps([{ position: 1, delay_minutes: 60, message_text: "", button_text: "", button_url: "" }]);
    setFollowUpMessage(null);
  }

  function readableCheckoutError(error: unknown): string {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
    if (message.includes("OWNER_ACCESS_REQUIRED")) return "Sesi Admin tidak memiliki izin menyimpan checkout. Muat ulang halaman lalu coba lagi.";
    if (message.includes("permission denied for table secrets")) return "Penyimpanan token pembayaran belum memiliki izin yang benar.";
    if (message.includes("BUATQRIS_SECRET_TOKEN_REQUIRED")) return "Secret Token BuatQris belum tersimpan.";
    if (message.includes("BUATQRIS_SIGNING_SECRET_REQUIRED")) return "Signing Secret webhook BuatQris belum tersimpan.";
    if (message.includes("PGRST")) return "Formulir checkout belum sinkron dengan database. Muat ulang halaman lalu coba lagi.";
    return message ? `Checkout gagal disimpan: ${message}` : "Checkout gagal disimpan. Coba muat ulang halaman.";
  }

  async function saveCheckoutSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutBusy(true);
    setCheckoutMessage(null);
    try {
      if (checkoutSettings.product_label.trim().length < 3) throw new Error("Nama produk terlalu pendek.");
      if (!Number.isFinite(checkoutSettings.amount_idr) || checkoutSettings.amount_idr < 0) throw new Error("Harga produk tidak valid.");
      if (checkoutSettings.enabled && checkoutSettings.amount_idr <= 0) throw new Error("Isi harga sebelum checkout diaktifkan.");
      if (checkoutSettings.enabled && !checkoutSettings.manual_enabled && !checkoutSettings.buatqris_enabled) throw new Error("Aktifkan minimal satu metode pembayaran.");
      if (checkoutSettings.manual_enabled && (!checkoutSettings.bank_name.trim() || !checkoutSettings.account_number.trim() || !checkoutSettings.account_name.trim())) {
        throw new Error("Lengkapi bank, nomor rekening, dan nama pemilik rekening.");
      }
      if (checkoutSettings.buatqris_enabled && !checkoutSettings.buatqris_account_id.trim()) throw new Error("Masukkan Account ID BuatQris.");
      if (checkoutSettings.buatqris_enabled && !checkoutSettings.buatqris_secret_token_configured && !buatqrisSecretToken.trim()) throw new Error("Masukkan Secret Token BuatQris.");
      if (checkoutSettings.buatqris_enabled && !checkoutSettings.buatqris_signing_secret_configured && !buatqrisSigningSecret.trim()) throw new Error("Masukkan Signing Secret webhook BuatQris.");
      if (checkoutSettings.buatqris_umkm_name.trim().length > 15) throw new Error("Nama UMKM BuatQris maksimal 15 karakter.");
      if (checkoutSettings.coupon_enabled && (!checkoutSettings.coupon_code.trim() || checkoutSettings.coupon_discount_value <= 0)) throw new Error("Lengkapi kode dan nilai diskon kupon.");
      if (checkoutSettings.coupon_discount_type === "PERCENT" && checkoutSettings.coupon_discount_value > 100) throw new Error("Diskon persen maksimal 100%.");
      if (checkoutSettings.unique_code_enabled && (checkoutSettings.unique_code_min < 0 || checkoutSettings.unique_code_max < checkoutSettings.unique_code_min || checkoutSettings.unique_code_max > 9999)) throw new Error("Rentang kode unik tidak valid.");
      if (checkoutSettings.access_text.trim().length < 3) throw new Error("Pesan akses terlalu pendek.");
      if ((checkoutSettings.access_button_text.trim() && !checkoutSettings.access_button_url.trim()) || (!checkoutSettings.access_button_text.trim() && checkoutSettings.access_button_url.trim())) {
        throw new Error("Teks dan link tombol akses harus diisi berpasangan.");
      }
      if (checkoutSettings.access_button_url && !/^https:\/\//i.test(checkoutSettings.access_button_url)) throw new Error("Link akses harus diawali https://");
      const normalized = {
        ...checkoutSettings,
        product_label: checkoutSettings.product_label.trim(),
        amount_idr: Math.round(checkoutSettings.amount_idr),
        bank_name: checkoutSettings.bank_name.trim(),
        account_number: checkoutSettings.account_number.trim(),
        account_name: checkoutSettings.account_name.trim(),
        buatqris_account_id: checkoutSettings.buatqris_account_id.trim(),
        buatqris_umkm_name: checkoutSettings.buatqris_umkm_name.trim(),
        coupon_code: checkoutSettings.coupon_code.trim().toUpperCase(),
        coupon_discount_value: Math.round(checkoutSettings.coupon_discount_value),
        unique_code_min: Math.round(checkoutSettings.unique_code_min),
        unique_code_max: Math.round(checkoutSettings.unique_code_max),
        payment_note: checkoutSettings.payment_note.trim(),
        access_text: checkoutSettings.access_text.trim(),
        access_button_text: checkoutSettings.access_button_text.trim(),
        access_button_url: checkoutSettings.access_button_url.trim(),
      };
      const { data, error } = await getSupabase(config).rpc("admin_update_checkout_settings", {
        p_enabled: normalized.enabled,
        p_product_label: normalized.product_label,
        p_amount_idr: normalized.amount_idr,
        p_manual_enabled: normalized.manual_enabled,
        p_bank_name: normalized.bank_name,
        p_account_number: normalized.account_number,
        p_account_name: normalized.account_name,
        p_buatqris_enabled: normalized.buatqris_enabled,
        p_buatqris_account_id: normalized.buatqris_account_id,
        p_buatqris_secret_token: buatqrisSecretToken.trim(),
        p_buatqris_signing_secret: buatqrisSigningSecret.trim(),
        p_buatqris_mode: normalized.buatqris_mode,
        p_buatqris_qris_method: normalized.buatqris_qris_method,
        p_buatqris_umkm_name: normalized.buatqris_umkm_name,
        p_coupon_enabled: normalized.coupon_enabled,
        p_coupon_code: normalized.coupon_code,
        p_coupon_discount_type: normalized.coupon_discount_type,
        p_coupon_discount_value: normalized.coupon_discount_value,
        p_unique_code_enabled: normalized.unique_code_enabled,
        p_unique_code_direction: normalized.unique_code_direction,
        p_unique_code_min: normalized.unique_code_min,
        p_unique_code_max: normalized.unique_code_max,
        p_payment_note: normalized.payment_note,
        p_access_text: normalized.access_text,
        p_access_button_text: normalized.access_button_text,
        p_access_button_url: normalized.access_button_url,
      });
      if (error) throw error;
      setCheckoutSettings(data as CheckoutSettings);
      setBuatqrisSecretToken("");
      setBuatqrisSigningSecret("");
      setOrderProductLabel(normalized.product_label);
      setOrderAmount(normalized.amount_idr);
      setCheckoutMessage({ type: "success", text: normalized.enabled ? "Checkout aktif. Tombol BELI sekarang membuat pesanan otomatis." : "Checkout disimpan dalam keadaan nonaktif." });
    } catch (error) {
      setCheckoutMessage({ type: "error", text: readableCheckoutError(error) });
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function saveOrderExpirySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderExpiryBusy(true);
    setOrderExpiryMessage(null);
    try {
      const multiplier = orderExpiryUnit === "DAYS" ? 86_400 : orderExpiryUnit === "HOURS" ? 3_600 : 60;
      const expireAfterSeconds = orderExpiryDuration * multiplier;
      if (!Number.isInteger(orderExpiryDuration) || !Number.isInteger(expireAfterSeconds) || expireAfterSeconds < 60 || expireAfterSeconds > 2_592_000) {
        throw new Error("Batas pembayaran harus 1 menit sampai 30 hari.");
      }
      if (orderExpirySettings.expiry_notice.trim().length < 3) throw new Error("Pesan kedaluwarsa terlalu pendek.");
      const normalized = { ...orderExpirySettings, expire_after_seconds: expireAfterSeconds, expiry_notice: orderExpirySettings.expiry_notice.trim() };
      const { data, error } = await getSupabase(config).rpc("admin_update_order_expiry_settings", {
        p_enabled: normalized.enabled,
        p_expire_after_seconds: normalized.expire_after_seconds,
        p_expiry_notice: normalized.expiry_notice,
      });
      if (error) throw error;
      setOrderExpirySettings(data as OrderExpirySettings);
      setOrderExpiryMessage({ type: "success", text: normalized.enabled ? "Batas pembayaran aktif untuk pesanan baru." : "Kedaluwarsa otomatis dinonaktifkan untuk pesanan baru." });
    } catch (error) {
      setOrderExpiryMessage({ type: "error", text: error instanceof Error ? error.message : "Batas pembayaran gagal disimpan." });
    } finally {
      setOrderExpiryBusy(false);
    }
  }

  async function saveAdminNotificationSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminNotificationBusy(true);
    setAdminNotificationMessage(null);
    try {
      if (adminNotificationSettings.enabled && !adminNotificationSettings.recipient_user_id) throw new Error("Pilih akun Telegram penerima notifikasi Admin.");
      if (!Number.isInteger(adminNotificationSettings.review_reminder_minutes) || adminNotificationSettings.review_reminder_minutes < 1 || adminNotificationSettings.review_reminder_minutes > 1440) {
        throw new Error("Pengingat pemeriksaan harus 1–1440 menit.");
      }
      if (!/^https:\/\/\S+$/i.test(adminNotificationSettings.admin_url)) throw new Error("Link Web Admin harus memakai HTTPS.");
      if (adminNotificationSettings.pending_order_text.trim().length < 3) throw new Error("Notifikasi Pending terlalu pendek.");
      if (adminNotificationSettings.cancelled_order_text.trim().length < 3) throw new Error("Notifikasi Batal terlalu pendek.");
      if (adminNotificationSettings.paid_order_text.trim().length < 3) throw new Error("Notifikasi Lunas terlalu pendek.");
      const statusFormatError = [
        adminNotificationSettings.pending_order_text,
        adminNotificationSettings.cancelled_order_text,
        adminNotificationSettings.paid_order_text,
      ].map(validateTelegramHtml).find(Boolean);
      if (statusFormatError) throw new Error(statusFormatError);
      const { data, error } = await getSupabase(config).rpc("admin_update_notification_settings", {
        p_enabled: adminNotificationSettings.enabled,
        p_recipient_user_id: adminNotificationSettings.recipient_user_id,
        p_review_reminder_minutes: adminNotificationSettings.review_reminder_minutes,
        p_admin_url: adminNotificationSettings.admin_url.trim(),
        p_pending_order_text: adminNotificationSettings.pending_order_text.trim(),
        p_cancelled_order_text: adminNotificationSettings.cancelled_order_text.trim(),
        p_paid_order_text: adminNotificationSettings.paid_order_text.trim(),
      });
      if (error) throw error;
      setAdminNotificationSettings(data as AdminNotificationSettings);
      setAdminNotificationMessage({
        type: "success",
        text: adminNotificationSettings.enabled ? "Notifikasi Admin aktif untuk kejadian baru." : "Notifikasi Admin disimpan dalam keadaan nonaktif.",
      });
    } catch (error) {
      setAdminNotificationMessage({ type: "error", text: error instanceof Error ? error.message : "Notifikasi Admin gagal disimpan." });
    } finally {
      setAdminNotificationBusy(false);
    }
  }

  async function saveBotNotificationSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBotNotificationBusy(true);
    setBotNotificationMessage(null);
    try {
      const normalized = Object.fromEntries(
        Object.entries(botNotificationSettings).map(([key, value]) => [key, value.trim()]),
      ) as unknown as BotNotificationSettings;
      const emptyField = Object.entries(normalized).find(([, value]) => value.length < 2);
      if (emptyField) throw new Error("Semua redaksi wajib diisi minimal 2 karakter.");
      const buttonKeys: (keyof BotNotificationSettings)[] = [
        "join_channel_button_text", "join_discussion_button_text", "buy_button_text",
        "open_bot_button_text", "check_again_button_text", "check_membership_button_text", "admin_open_orders_button_text",
      ];
      if (buttonKeys.some((key) => normalized[key].length > 64)) throw new Error("Teks tombol maksimal 64 karakter.");
      if (normalized.reference_image_caption.length > 1024) throw new Error("Caption gambar referensi maksimal 1.024 karakter.");
      const richTextKeys = (Object.keys(normalized) as (keyof BotNotificationSettings)[]).filter((key) => !buttonKeys.includes(key));
      const formatError = richTextKeys.map((key) => validateTelegramHtml(normalized[key])).find(Boolean);
      if (formatError) throw new Error(formatError);

      const supabase = getSupabase(config);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Sesi login tidak ditemukan.");
      const { error } = await supabase.from("system_settings").upsert({
        key: "bot.notifications",
        category: "TELEGRAM",
        value: normalized,
        description: "Pusat redaksi global balasan dan notifikasi bot Telegram.",
        status: "ACTIVE",
        updated_by: user.id,
      }, { onConflict: "key" });
      if (error) throw error;
      setBotNotificationSettings(normalized);
      setBotNotificationMessage({ type: "success", text: "Semua redaksi bot tersimpan. Pesan berikutnya langsung memakai versi terbaru." });
    } catch (error) {
      setBotNotificationMessage({ type: "error", text: error instanceof Error ? error.message : "Redaksi bot gagal disimpan." });
    } finally {
      setBotNotificationBusy(false);
    }
  }

  function updateBotNotificationField(key: keyof BotNotificationSettings, value: string) {
    setBotNotificationSettings((current) => ({ ...current, [key]: value }));
  }

  async function createPendingOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderBusy("create");
    setOrderMessage(null);
    try {
      if (!orderUserId) throw new Error("Pilih calon pembeli.");
      if (orderProductLabel.trim().length < 3) throw new Error("Nama produk terlalu pendek.");
      if (!Number.isFinite(orderAmount) || orderAmount < 0) throw new Error("Nominal pesanan tidak valid.");
      const { data, error } = await getSupabase(config).rpc("admin_create_pending_order", {
        p_user_id: orderUserId,
        p_product_label: orderProductLabel.trim(),
        p_amount_idr: Math.round(orderAmount),
      });
      if (error) throw error;
      const user = memberStatuses.find((member) => member.id === orderUserId);
      const created = { ...data, users: { username: user?.username ?? null, first_name: user?.first_name ?? null } } as PurchaseOrderRow;
      setPurchaseOrders((current) => [created, ...current]);
      setOrderPage(1);
      setOrderSearch("");
      setOrderManualOpen(false);
      setSalesRefreshKey((current) => current + 1);
      setOrderMessage({ type: "success", text: `Pesanan ${created.order_number} dibuat. Follow-up hanya berjalan selama statusnya MENUNGGU TRANSFER.` });
    } catch (error) {
      setOrderMessage({ type: "error", text: error instanceof Error ? error.message : "Pesanan gagal dibuat." });
    } finally {
      setOrderBusy(null);
    }
  }

  async function markOrderPaid(orderId: string) {
    setOrderBusy(orderId);
    setOrderMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_mark_order_paid", {
        p_order_id: orderId,
        p_payment_reference: null,
      });
      if (error) throw error;
      setPurchaseOrders((current) => current.map((order) => order.id === orderId ? { ...order, ...data } : order));
      setFollowUpEnrollments((current) => current.map((item) => item.source_id === orderId && ["SCHEDULED", "SENDING", "FAILED"].includes(item.status) ? { ...item, status: "CANCELLED" } : item));
      setOrderMessage({ type: "success", text: "Transfer dikonfirmasi. Follow-up berhenti dan akses produk masuk ke antrean kirim otomatis." });
    } catch (error) {
      setOrderMessage({ type: "error", text: error instanceof Error ? error.message : "Status pembayaran gagal diperbarui." });
    } finally {
      setOrderBusy(null);
    }
  }

  function readableOrderError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("ORDER_ACCESS_ALREADY_SENT")) return "Akses produk sudah terkirim. Status tidak boleh diturunkan; jika ini data uji, gunakan Hapus Order.";
    if (message.includes("ORDER_DELIVERY_REQUIRES_REVIEW")) return "Pengiriman akses sedang berjalan atau hasilnya belum pasti. Periksa Mesin Sistem dahulu.";
    if (message.includes("USER_ALREADY_HAS_ACTIVE_ORDER")) return "Member ini sudah punya order aktif lain. Selesaikan order tersebut dahulu.";
    if (message.includes("ORDER_NUMBER_CONFIRMATION_REQUIRED")) return "Ketik nomor order dengan tepat untuk menghapus.";
    if (message.includes("ONLY_TEST_ORDERS_CAN_BE_DELETED")) return "Order pembeli asli tidak boleh dihapus. Hapus hanya tersedia untuk order uji dari web admin.";
    return message || "Pesanan gagal diperbarui.";
  }

  async function changeOrderStatus(order: PurchaseOrderRow, status: "PENDING_PAYMENT" | "CANCELLED" | "PAID") {
    setOrderBusy(`status:${order.id}`);
    setOrderMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_set_purchase_order_status", {
        p_order_id: order.id,
        p_status: status,
      });
      if (error) throw error;
      setPurchaseOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...data } : item));
      setFollowUpEnrollments((current) => current.map((item) => item.source_id === order.id && status !== "PENDING_PAYMENT" && ["SCHEDULED", "SENDING", "FAILED"].includes(item.status) ? { ...item, status: "CANCELLED" } : item));
      setSalesRefreshKey((key) => key + 1);
      setActivityRefreshKey((key) => key + 1);
      setOrderControlId(null);
      setOrderMessage({ type: "success", text: `${order.order_number} sekarang ${status === "PAID" ? "LUNAS" : status === "CANCELLED" ? "BATAL" : "PENDING"}. Angka laporan sudah diperbarui.` });
    } catch (error) {
      setOrderMessage({ type: "error", text: readableOrderError(error) });
    } finally {
      setOrderBusy(null);
    }
  }

  async function deleteOrder(order: PurchaseOrderRow) {
    const confirmation = (orderDeleteConfirmations[order.id] ?? "").trim();
    if (confirmation !== order.order_number) {
      setOrderMessage({ type: "error", text: `Ketik ${order.order_number} dengan tepat untuk menghapus.` });
      return;
    }
    setOrderBusy(`delete:${order.id}`);
    setOrderMessage(null);
    try {
      const supabase = getSupabase(config);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sesi Owner tidak ditemukan.");
      const response = await fetch(`${config.url}/functions/v1/admin-order-delete`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.publishableKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ order_id: order.id, confirmation }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; storage_warning?: string | null };
      if (!response.ok) throw new Error(result.error || "Order gagal dihapus.");
      setPurchaseOrders((current) => current.filter((item) => item.id !== order.id));
      setFollowUpEnrollments((current) => current.filter((item) => item.source_id !== order.id));
      setOrderDeleteConfirmations((current) => { const next = { ...current }; delete next[order.id]; return next; });
      setOrderControlId(null);
      setSalesRefreshKey((key) => key + 1);
      setActivityRefreshKey((key) => key + 1);
      setOrderMessage({
        type: result.storage_warning ? "error" : "success",
        text: result.storage_warning
          ? `${order.order_number} sudah dihapus dari laporan, tetapi pembersihan file bukti perlu diperiksa.`
          : `${order.order_number} dan seluruh data turunannya sudah dihapus.`,
      });
    } catch (error) {
      setOrderMessage({ type: "error", text: readableOrderError(error) });
    } finally {
      setOrderBusy(null);
    }
  }

  function currentPaymentProof(order: PurchaseOrderRow): PaymentProofRow | null {
    return [...(order.payment_proofs ?? [])]
      .sort((a, b) => b.revision - a.revision)
      .find((proof) => proof.status === "PENDING_REVIEW") ?? null;
  }

  async function loadPaymentProof(proof: PaymentProofRow) {
    setOrderBusy(`proof:${proof.id}`);
    setOrderMessage(null);
    try {
      const { data, error } = await getSupabase(config).storage.from("payment-proofs").createSignedUrl(proof.storage_path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("Bukti tidak bisa dibuka.");
      setProofUrls((current) => ({ ...current, [proof.id]: data.signedUrl }));
    } catch (error) {
      setOrderMessage({ type: "error", text: error instanceof Error ? error.message : "Bukti transfer gagal dibuka." });
    } finally {
      setOrderBusy(null);
    }
  }

  async function reviewPaymentProof(order: PurchaseOrderRow, decision: "APPROVE" | "REJECT") {
    const proof = currentPaymentProof(order);
    if (!proof) return;
    const reason = (proofRejectionReasons[proof.id] ?? "").trim();
    if (decision === "REJECT" && reason.length < 3) {
      setOrderMessage({ type: "error", text: "Tulis alasan penolakan minimal 3 karakter." });
      return;
    }
    setOrderBusy(`review:${proof.id}`);
    setOrderMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_review_payment_proof", {
        p_order_id: order.id,
        p_proof_id: proof.id,
        p_decision: decision,
        p_rejection_reason: decision === "REJECT" ? reason : null,
      });
      if (error) throw error;
      setPurchaseOrders((current) => current.map((item) => item.id !== order.id ? item : {
        ...item,
        ...data,
        payment_proofs: item.payment_proofs.map((candidate) => candidate.id === proof.id ? {
          ...candidate,
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          rejection_reason: decision === "REJECT" ? reason : null,
          reviewed_at: new Date().toISOString(),
          review_notice_status: decision === "REJECT" ? "QUEUED" : "NOT_READY",
        } : candidate),
      }));
      setFollowUpEnrollments((current) => current.map((item) => item.source_id === order.id && ["SCHEDULED", "SENDING", "FAILED"].includes(item.status) ? { ...item, status: "CANCELLED" } : item));
      setSalesRefreshKey((key) => key + 1);
      setActivityRefreshKey((key) => key + 1);
      setOrderMessage({
        type: "success",
        text: decision === "APPROVE"
          ? "Bukti di-ACC. Pesanan LUNAS dan akses produk masuk antrean kirim sekali."
          : "Bukti ditolak. Alasan masuk antrean kirim dan pembeli bisa mengunggah ulang.",
      });
    } catch (error) {
      setOrderMessage({ type: "error", text: error instanceof Error ? error.message : "Verifikasi bukti gagal diproses." });
    } finally {
      setOrderBusy(null);
    }
  }

  function editFollowUp(automation: FollowUpAutomationRow) {
    setFollowUpId(automation.id);
    setFollowUpName(automation.name);
    setFollowUpStatus(automation.status);
    setFollowUpSteps(automation.follow_up_steps.length ? automation.follow_up_steps : [{ position: 1, delay_minutes: 60, message_text: "", button_text: "", button_url: "" }]);
    setFollowUpMessage(null);
  }

  function updateFollowUpStep(index: number, patch: Partial<FollowUpStep>) {
    setFollowUpSteps((steps) => steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  async function saveFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFollowUpBusy(true);
    setFollowUpMessage(null);
    try {
      if (followUpName.trim().length < 3) throw new Error("Nama automasi terlalu pendek.");
      if (!followUpSteps.length || followUpSteps.length > 5) throw new Error("Gunakan 1–5 pesan follow-up.");
      for (const step of followUpSteps) {
        if (!Number.isFinite(step.delay_minutes) || step.delay_minutes < 1 || step.delay_minutes > 10080) throw new Error("Jeda setiap pesan harus 1 menit–7 hari.");
        if (step.message_text.trim().length < 3 || step.message_text.length > 4096) throw new Error("Isi setiap pesan harus 3–4.096 karakter.");
      }
      const payload = followUpSteps.map((step, index) => ({
        position: index + 1,
        delay_minutes: Math.round(step.delay_minutes),
        message_text: step.message_text.trim(),
        button_text: "",
        button_url: "",
      }));
      const { data, error } = await getSupabase(config).rpc("admin_save_follow_up_automation", {
        p_automation_id: followUpId,
        p_name: followUpName.trim(),
        p_status: followUpStatus,
        p_steps: payload,
      });
      if (error) throw error;
      const saved = data as FollowUpAutomationRow;
      const normalized = { ...saved, follow_up_steps: payload };
      setFollowUps((current) => [normalized, ...current.filter((item) => item.id !== saved.id)]);
      setFollowUpId(saved.id);
      setFollowUpMessage({ type: "success", text: followUpStatus === "ACTIVE" ? "Automasi aktif untuk pesanan baru yang belum transfer. Pesanan lama tidak dikejar ulang." : "Automasi disimpan. Belum ada pesan yang akan dikirim." });
    } catch (error) {
      setFollowUpMessage({ type: "error", text: error instanceof Error ? error.message : "Automasi follow-up gagal disimpan." });
    } finally {
      setFollowUpBusy(false);
    }
  }

  function revealPostingStep(id: string) {
    const step = document.getElementById(id) as HTMLDetailsElement | null;
    if (!step) return;
    const stepNumber = Number(id.replace("post-step-", ""));
    if ([1, 2, 3, 4].includes(stepNumber)) setPostActiveStep(stepNumber as 1 | 2 | 3 | 4);
    step.open = true;
    window.requestAnimationFrame(() => step.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function resetChannelPostForm() {
    setPostEditingId(null);
    setPostReuseSourceId(null);
    setPostExistingImagePath(null);
    setPostExistingImageUrl(null);
    setPostImageRemoved(false);
    setPostCategoryId(categories.find((category) => category.status === "ACTIVE")?.id ?? "");
    setPostPromptParts("");
    setPostCaption("Mau materi ini? Ketik MAU di kolom komentar 👇");
    setPostImage(null);
    setPostAction("NOW");
    setPostUpsellMode("NONE");
    setPostSchedule("");
    setPostActiveStep(1);
    setCommentRule({ ...DEFAULT_POST_COMMENT_RULE, keywords: [...DEFAULT_POST_COMMENT_RULE.keywords] });
  }

  async function beginEditChannelPost(postId: string) {
    setPostBusy(true);
    setPostMessage(null);
    setPostActiveStep(1);
    try {
      const supabase = getSupabase(config);
      const { data, error } = await supabase.rpc("admin_get_channel_post_for_edit", { p_post_id: postId });
      if (error) throw error;
      const editor = data as ChannelPostEditorData;
      let existingImageUrl: string | null = null;
      if (editor.image_path) {
        const signedImage = await supabase.storage.from("channel-post-images").createSignedUrl(editor.image_path, 3600);
        existingImageUrl = signedImage.data?.signedUrl ?? null;
      }
      setPostEditingId(editor.id);
      setPostReuseSourceId(null);
      setPostExistingImagePath(editor.image_path);
      setPostExistingImageUrl(existingImageUrl);
      setPostImageRemoved(false);
      setPostCategoryId(editor.category_id);
      setPostPromptParts((Array.isArray(editor.parts) ? editor.parts : []).join("\n---\n"));
      setPostCaption(editor.caption);
      setPostImage(null);
      setPostAction(editor.status === "SCHEDULED" ? "SCHEDULE" : "DRAFT");
      setPostUpsellMode(editor.upsell_mode);
      setPostSchedule(localDateTimeInputValue(editor.scheduled_at));
      setCommentRule({ ...editor.automation, keywords: [...editor.automation.keywords] });
      openWorkspace("content", "buat-postingan");
      window.requestAnimationFrame(() => document.getElementById("buat-postingan")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setPostMessage({ type: "error", text: error instanceof Error ? error.message : "Konten tidak bisa dibuka untuk diedit." });
    } finally {
      setPostBusy(false);
    }
  }

  async function beginReuseChannelPost(postId: string) {
    setPostBusy(true);
    setPostMessage(null);
    setPostActiveStep(1);
    try {
      const supabase = getSupabase(config);
      const { data, error } = await supabase.rpc("admin_get_channel_post_for_reuse", { p_post_id: postId });
      if (error) throw error;
      const editor = data as ChannelPostEditorData;
      let existingImageUrl: string | null = null;
      if (editor.image_path) {
        const signedImage = await supabase.storage.from("channel-post-images").createSignedUrl(editor.image_path, 3600);
        existingImageUrl = signedImage.data?.signedUrl ?? null;
      }
      setPostEditingId(null);
      setPostReuseSourceId(editor.id);
      setPostExistingImagePath(editor.image_path);
      setPostExistingImageUrl(existingImageUrl);
      setPostImageRemoved(false);
      setPostCategoryId(editor.category_id);
      setPostPromptParts((Array.isArray(editor.parts) ? editor.parts : []).join("\n---\n"));
      setPostCaption(editor.caption);
      setPostImage(null);
      setPostAction("DRAFT");
      setPostUpsellMode(editor.upsell_mode);
      setPostSchedule("");
      setCommentRule({ ...editor.automation, id: null, name: `${editor.automation.name} · Salinan`.slice(0, 80), keywords: [...editor.automation.keywords] });
      openWorkspace("content", "buat-postingan");
      setPostMessage({ type: "success", text: "Salinan konten siap. Edit lalu pilih Posting Sekarang, Jadwalkan, atau Simpan Draft." });
      window.requestAnimationFrame(() => document.getElementById("buat-postingan")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setPostMessage({ type: "error", text: error instanceof Error ? error.message : "Konten tidak bisa disalin untuk digunakan lagi." });
    } finally {
      setPostBusy(false);
    }
  }

  async function deleteChannelPost(post: ChannelPostRow) {
    const title = post.prompts?.title ?? "konten ini";
    const confirmed = window.confirm(`Hapus \"${title}\" dari database?\n\nPesan yang sudah terkirim di Telegram tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.`);
    if (!confirmed) return;
    setContent365Busy(`delete:${post.id}`);
    setContent365Message(null);
    try {
      const supabase = getSupabase(config);
      const { data, error } = await supabase.rpc("admin_delete_channel_post_archive", { p_post_id: post.id });
      if (error) throw error;
      const result = data as { image_path?: string | null; delete_image?: boolean };
      let imageCleanupFailed = false;
      if (result.delete_image && result.image_path) {
        const { error: storageError } = await supabase.storage.from("channel-post-images").remove([result.image_path]);
        imageCleanupFailed = Boolean(storageError);
      }
      setContent365SourcePosts((current) => current.filter((item) => item.id !== post.id));
      setContent365Message({
        type: "success",
        text: `Konten berhasil dihapus permanen dari database.${imageCleanupFailed ? " Data utama sudah terhapus, tetapi file gambar belum sempat dibersihkan." : ""}`,
      });
    } catch (error) {
      const source = typeof error === "object" && error !== null ? error as Record<string, unknown> : null;
      const diagnostic = [error instanceof Error ? error.message : "", typeof source?.details === "string" ? source.details : "", typeof source?.code === "string" ? source.code : ""].filter(Boolean).join(" · ");
      const known: Array<[string, string]> = [
        ["POST_USED_IN_CONTENT_365", "Konten masih dipakai di Konten 365. Keluarkan dari slot harinya terlebih dahulu."],
        ["POST_HAS_CONTENT_365_HISTORY", "Konten memiliki riwayat pengiriman Konten 365 sehingga belum aman dihapus."],
        ["POST_HAS_ACTIVE_DELIVERIES", "Konten masih memiliki proses balasan, pengiriman materi, atau masa hapus aktif. Selesaikan prosesnya terlebih dahulu."],
        ["POST_NOT_FOUND", "Konten sudah tidak ditemukan. Muat ulang riwayat."],
        ["ADMIN_ACCESS_REQUIRED", "Sesi Admin tidak memiliki izin menghapus. Muat ulang halaman atau login kembali."],
      ];
      setContent365Message({ type: "error", text: known.find(([token]) => diagnostic.includes(token))?.[1] ?? (diagnostic || "Konten gagal dihapus dari database.") });
    } finally {
      setContent365Busy(null);
    }
  }

  async function createChannelPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostBusy(true);
    setPostMessage(null);
    const isEditing = Boolean(postEditingId);
    const isReusing = Boolean(postReuseSourceId);
    let uploadedPath: string | null = null;
    let mutationCompleted = false;
    try {
      if (!postCategoryId) throw new Error("Pilih kategori materi.");
      if (!isEditing && !postImage && !postExistingImagePath) { revealPostingStep("post-step-1"); throw new Error("Pilih gambar postingan."); }
      if (postImage && !["image/jpeg", "image/png", "image/webp"].includes(postImage.type)) { revealPostingStep("post-step-1"); throw new Error("Gambar harus JPG, PNG, atau WEBP."); }
      if (postImage && postImage.size > 10 * 1024 * 1024) { revealPostingStep("post-step-1"); throw new Error("Ukuran gambar maksimal 10 MB."); }
      if (postCaption.trim().length < 10 || postCaption.trim().length > 1024) { revealPostingStep("post-step-1"); throw new Error("Caption harus 10–1024 karakter."); }
      const captionFormatError = validateTelegramHtml(postCaption);
      if (captionFormatError) { revealPostingStep("post-step-1"); throw new Error(captionFormatError); }
      if (!commentRule) { revealPostingStep("post-step-2"); throw new Error("Pengaturan keyword belum siap."); }
      const keywords = commentRule.keywords.map((keyword) => keyword.trim()).filter(Boolean);
      if (!keywords.length) { revealPostingStep("post-step-2"); throw new Error("Isi minimal satu keyword."); }
      if (commentRule.public_success_reply.trim().length < 3) { revealPostingStep("post-step-2"); throw new Error("Balasan sukses terlalu pendek."); }
      if (commentRule.start_required_reply.trim().length < 3) { revealPostingStep("post-step-2"); throw new Error("Balasan wajib START terlalu pendek."); }
      if (commentRule.membership_required_reply.trim().length < 3) { revealPostingStep("post-step-2"); throw new Error("Balasan syarat join terlalu pendek."); }
      const replyFormatError = [commentRule.public_success_reply, commentRule.start_required_reply, commentRule.membership_required_reply].map(validateTelegramHtml).find(Boolean);
      if (replyFormatError) { revealPostingStep("post-step-2"); throw new Error(replyFormatError); }
      const parts = postPromptParts.split(/\n\s*---\s*\n/g).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) { revealPostingStep("post-step-3"); throw new Error("Isi minimal satu bubble materi."); }
      if (parts.some((part) => part.length > 4096)) { revealPostingStep("post-step-3"); throw new Error("Setiap bubble maksimal 4.096 karakter."); }
      const partFormatError = parts.map(validateTelegramHtml).find(Boolean);
      if (partFormatError) { revealPostingStep("post-step-3"); throw new Error(partFormatError); }
      const generatedTitle = (postCaption.trim().split("\n")[0].replace(/<[^>]*>/g, "") || "Materi Channel").slice(0, 120);

      let scheduledAt: string | null = null;
      if (postAction === "NOW") {
        if (isEditing) throw new Error("Konten yang diedit hanya bisa disimpan sebagai draft atau terjadwal.");
        scheduledAt = new Date().toISOString();
      }
      if (postAction === "SCHEDULE") {
        const selected = new Date(postSchedule);
        if (!postSchedule || !Number.isFinite(selected.getTime())) { revealPostingStep("post-step-4"); throw new Error("Pilih tanggal dan jam posting."); }
        scheduledAt = selected.toISOString();
      }

      const supabase = getSupabase(config);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sesi admin tidak ditemukan.");
      let imagePath = postImageRemoved ? null : postExistingImagePath;
      if (postImage) {
        const extension = postImage.type === "image/png" ? "png" : postImage.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("channel-post-images").upload(uploadedPath, postImage, {
          contentType: postImage.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        imagePath = uploadedPath;
      }
      if (!isEditing && !imagePath) throw new Error("Gambar postingan tidak ditemukan.");

      if (isEditing && postEditingId) {
        const { error: updateError } = await supabase.rpc("admin_update_channel_post", {
          p_post_id: postEditingId,
          p_category_id: postCategoryId,
          p_title: generatedTitle.length >= 3 ? generatedTitle : "Materi Channel",
          p_prompt_parts: parts,
          p_image_path: imagePath,
          p_caption: postCaption.trim(),
          p_upsell_mode: postUpsellMode,
          p_scheduled_at: scheduledAt,
          p_automation_name: (commentRule.name.trim() || `Komentar · ${generatedTitle}`).slice(0, 80),
          p_keywords: keywords,
          p_match_mode: commentRule.match_mode,
          p_public_success_reply: commentRule.public_success_reply.trim(),
          p_start_required_reply: commentRule.start_required_reply.trim(),
          p_membership_required_reply: commentRule.membership_required_reply.trim(),
          p_automation_status: commentRule.status,
        });
        if (updateError) throw updateError;
        mutationCompleted = true;
      } else {
        const { error: createError } = await supabase.rpc("admin_create_channel_post_with_automation", {
          p_category_id: postCategoryId,
          p_title: generatedTitle.length >= 3 ? generatedTitle : "Materi Channel",
          p_description: null,
          p_prompt_parts: parts,
          p_license_type: "ORIGINAL",
          p_creator_name: "PEBISNIS DIGITAL TELEGRAM",
          p_source_url: null,
          p_permission_reference: null,
          p_image_path: imagePath,
          p_caption: postCaption.trim(),
          p_upsell_mode: postUpsellMode,
          p_scheduled_at: scheduledAt,
          p_automation_name: `Komentar · ${generatedTitle}`.slice(0, 80),
          p_keywords: keywords,
          p_match_mode: commentRule.match_mode,
          p_public_success_reply: commentRule.public_success_reply.trim(),
          p_start_required_reply: commentRule.start_required_reply.trim(),
          p_membership_required_reply: commentRule.membership_required_reply.trim(),
          p_automation_status: commentRule.status,
        });
        if (createError) throw createError;
        mutationCompleted = true;
      }

      resetChannelPostForm();
      setPostMessage({
        type: "success",
        text: isEditing ? "Perubahan konten berhasil disimpan." : postAction === "NOW" ? "Posting masuk antrean kirim sekarang." : postAction === "SCHEDULE" ? "Posting berhasil dijadwalkan." : "Draft tersimpan.",
      });
      await refreshContent365();
      if (isEditing || isReusing) {
        setContent365Message({ type: "success", text: isEditing ? "Perubahan konten berhasil disimpan." : "Salinan konten baru berhasil disimpan dan sudah masuk daftar Konten Tersedia." });
        openWorkspace("content", "kalender-365");
      }
    } catch (error) {
      if (uploadedPath && !mutationCompleted) await getSupabase(config).storage.from("channel-post-images").remove([uploadedPath]);
      setPostMessage({ type: "error", text: channelPostErrorText(error, isEditing) });
    } finally {
      setPostBusy(false);
    }
  }

  async function runContractProbe(action: "member_delivery_delete" | "non_member") {
    setRunningProbe(action);
    setProbeResult(null);
    try {
      const supabase = getSupabase(config);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sesi admin tidak ditemukan. Silakan login ulang.");

      const response = await withTimeout(
        fetch(`${config.url}/functions/v1/telegram-contract-probe`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: config.publishableKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action }),
        }),
        "Tes Telegram terlalu lama. Coba lagi sebentar.",
      );
      const result = await response.json() as ContractProbeResult;
      if (!response.ok) throw new Error(result.detail || result.error || "Gate 1F gagal dijalankan.");
      setProbeResult(result);
    } catch (error) {
      setProbeResult({ error: error instanceof Error ? error.message : "Gate 1F gagal dijalankan." });
    } finally {
      setRunningProbe(null);
    }
  }

  function content365ErrorText(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
    const known: Record<string, string> = {
      CONTENT_365_DISABLED: "Aktifkan Konten 365 terlebih dahulu.",
      CONTENT_365_POST_IN_PROGRESS: "Posting Konten 365 sebelumnya masih diproses. Tunggu sampai selesai.",
      CONTENT_365_SETTINGS_NOT_FOUND: "Pengaturan Konten 365 belum tersedia.",
      CONTENT_365_START_DATE_REQUIRED: "Pilih tanggal mulai Hari 1 terlebih dahulu.",
      CONTENT_365_START_DATE_IN_PAST: "Tanggal mulai tidak boleh sebelum hari ini.",
      INVALID_CONTENT_365_TOTAL_DAYS: "Jumlah hari harus antara 1–10.000 hari.",
      CONTENT_365_DAY_OUT_OF_RANGE: "Nomor hari berada di luar jumlah hari yang dipilih.",
      NO_ACTIVE_CONTENT: "Belum ada slot berstatus Aktif.",
      SOURCE_POST_NOT_FOUND: "Posting sumber tidak ditemukan.",
      WORKSPACE_ADMIN_REQUIRED: "Akun ini tidak punya izin mengubah pengaturan Konten 365.",
      CONTENT_ACCESS_REQUIRED: "Akun ini tidak punya izin mengubah kalender Konten 365.",
    };
    const key = Object.keys(known).find((code) => message.includes(code));
    return key ? known[key] : message || fallback;
  }

  function applyContent365Settings(settings: Content365Settings) {
    setContent365Settings(settings);
    setContent365Enabled(settings.enabled);
    setContent365LoopEnabled(settings.loop_enabled);
    setContent365SendTime(String(settings.send_time).slice(0, 5));
    setContent365Timezone(settings.timezone);
    setContent365TotalDays(settings.total_days);
    setContent365StartDate(settings.start_date ?? dateInputValueInTimeZone(new Date(), settings.timezone));
    setContent365Page(Math.floor((settings.current_day - 1) / 30));
  }

  function chooseContent365Day(dayNumber: number) {
    const maximumDay = content365Settings?.total_days ?? content365TotalDays;
    const safeDay = Math.min(maximumDay, Math.max(1, dayNumber));
    const item = content365Items.find((entry) => entry.day_number === safeDay);
    setContent365SelectedDay(safeDay);
    setContent365Page(Math.floor((safeDay - 1) / 30));
    setContent365SelectedPostId(item?.source_post_id ?? "");
    setContent365SelectedStatus(item?.status ?? "ACTIVE");
    setContent365Message(null);
  }

  function openContent365Page(pageNumber: number) {
    const maximumDay = content365Settings?.total_days ?? content365TotalDays;
    const safePage = Math.min(Math.ceil(maximumDay / 30) - 1, Math.max(0, pageNumber));
    chooseContent365Day(safePage * 30 + 1);
  }

  async function refreshContent365(showSuccess = false) {
    setContent365Busy("refresh");
    if (!showSuccess) setContent365Message(null);
    try {
      const supabase = getSupabase(config);
      const [settingsResult, itemsResult, runsResult, sourcePostsResult] = await Promise.all([
        withTimeout(supabase.from("content_365_settings").select("workspace_id,enabled,timezone,send_time,current_day,total_days,start_date,loop_enabled,next_run_at,pending_post_id,last_sent_at,last_post_id,last_error,updated_at").maybeSingle(), "Pengaturan Konten Harian terlalu lama dimuat."),
        withTimeout(supabase.from("content_365_items").select("id,day_number,source_post_id,status,created_at,updated_at").order("day_number"), "Kalender Konten 365 terlalu lama dimuat."),
        withTimeout(supabase.from("content_365_runs").select("id,item_id,day_number,source_post_id,channel_post_id,scheduled_for,status,error_code,sent_at,created_at").order("created_at", { ascending: false }).limit(50), "Riwayat Konten 365 terlalu lama dimuat."),
        withTimeout(supabase.from("channel_posts").select("id,caption,scheduled_at,status,telegram_message_id,published_at,created_at,upsell_mode,prompts(title),comment_automation_rules(name)").order("created_at", { ascending: false }).limit(500), "Sumber posting Konten 365 terlalu lama dimuat."),
      ]);
      const firstError = settingsResult.error ?? itemsResult.error ?? runsResult.error ?? sourcePostsResult.error;
      if (firstError) throw firstError;
      if (settingsResult.data) applyContent365Settings(settingsResult.data as Content365Settings);
      const nextItems = (itemsResult.data ?? []) as Content365Item[];
      setContent365Items(nextItems);
      setContent365Runs((runsResult.data ?? []) as Content365Run[]);
      setContent365SourcePosts((sourcePostsResult.data ?? []) as unknown as ChannelPostRow[]);
      const selectedItem = nextItems.find((item) => item.day_number === content365SelectedDay);
      setContent365SelectedPostId(selectedItem?.source_post_id ?? "");
      setContent365SelectedStatus(selectedItem?.status ?? "ACTIVE");
      if (showSuccess) setContent365Message({ type: "success", text: "Data Konten 365 sudah diperbarui." });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Konten 365 gagal dimuat ulang.") });
    } finally {
      setContent365Busy(null);
    }
  }

  async function assignContent365Post(dayNumber: number, sourcePostId: string, status: Content365Item["status"] = "ACTIVE") {
    setContent365Busy("day");
    setContent365Message(null);
    try {
      if (!sourcePostId) throw new Error("Pilih posting sumber untuk hari ini.");
      const { data, error } = await getSupabase(config).rpc("admin_content_365_assign_post", {
        p_day_number: dayNumber,
        p_source_post_id: sourcePostId,
        p_status: status,
      });
      if (error) throw error;
      const saved = data as Content365Item;
      setContent365Items((current) => [...current.filter((item) => item.day_number !== saved.day_number), saved].sort((a, b) => a.day_number - b.day_number));
      setContent365SelectedDay(saved.day_number);
      setContent365SelectedPostId(saved.source_post_id);
      setContent365SelectedStatus(saved.status);
      setContent365Message({ type: "success", text: `${content365SourceTitle(saved.source_post_id)} dipindahkan ke Hari ${saved.day_number}.` });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Slot Konten 365 gagal disimpan.") });
    } finally {
      setContent365Busy(null);
      setContent365DraggingPostId(null);
      setContent365DraggingOrigin(null);
      setContent365DropDay(null);
      setContent365LibraryDropActive(false);
    }
  }

  async function importCalendarBatch(batchNumber: 8 | 9 | 10) {
    if (batchImportBusy) return;
    const firstDay = (batchNumber - 1) * 30 + 1;
    const lastDay = batchNumber * 30;
    const episodes = batchNumber === 8 ? BATCH_08_EPISODES : batchNumber === 9 ? BATCH_09_EPISODES : BATCH_10_EPISODES;
    const confirmed = window.confirm(
      `Isi 30 slot Bagian ${batchNumber} (Hari ${firstDay}–${lastDay}) dengan naskah baru dan gambar doodle hitam-putih? ` +
      "Setiap slot akan berstatus Aktif dalam rotasi 06.00 WIB. Slot yang sudah berisi tidak akan ditimpa."
    );
    if (!confirmed) return;

    setBatchImportBusy(batchNumber);
    setBatchImportProgress("Memeriksa isi kalender dan draft yang sudah ada...");
    setContent365Message(null);
    let completed = 0;
    try {
      const supabase = getSupabase(config);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error(`Sesi admin berakhir. Login kembali sebelum mengisi Bagian ${batchNumber}.`);
      const categoryId = categories.find((category) => category.status === "ACTIVE")?.id;
      if (!categoryId) throw new Error("Kategori materi aktif tidak tersedia.");

      const [slotsResponse, postsResponse] = await Promise.all([
        supabase.from("content_365_items").select("day_number,source_post_id,status").gte("day_number", firstDay).lte("day_number", lastDay),
        supabase.from("channel_posts").select("id,caption,prompts(title)").order("created_at", { ascending: false }).limit(500),
      ]);
      if (slotsResponse.error) throw slotsResponse.error;
      if (postsResponse.error) throw postsResponse.error;
      const slots = new Map((slotsResponse.data ?? []).map((item) => [item.day_number, item]));
      const posts = ((postsResponse.data ?? []) as unknown as Array<{
        id: string; caption: string; prompts: { title: string } | Array<{ title: string }> | null;
      }>).map((post) => ({
        id: post.id,
        caption: post.caption,
        title: Array.isArray(post.prompts) ? post.prompts[0]?.title : post.prompts?.title,
      }));
      if (episodes.length !== 30 || episodes.some((episode, index) => episode.day !== index + firstDay)) {
        throw new Error(`Paket Bagian ${batchNumber} tidak lengkap atau urutan harinya tidak sesuai.`);
      }
      for (const episode of episodes) {
        const title = `EPS ${episode.day} · ${episode.pillar}`;
        const priorPost = posts.find((post) => post.title === title);
        const slot = slots.get(episode.day);
        if (slot) {
          if (!priorPost || slot.source_post_id !== priorPost.id) {
            throw new Error(`Hari ${episode.day} sudah berisi konten lain. Tidak ada data yang ditimpa.`);
          }
          completed += 1;
          setBatchImportProgress(`${completed}/30 — Hari ${episode.day} sudah sesuai, dilewati.`);
          continue;
        }
        if (priorPost && priorPost.caption !== episode.caption) {
          throw new Error(`Judul ${title} sudah digunakan untuk konten berbeda. Periksa dulu sebelum melanjutkan.`);
        }

        let postId = priorPost?.id;
        if (!postId) {
          setBatchImportProgress(`${completed + 1}/30 — Membuat visual EPS ${episode.day}...`);
          const imageFile = await makeEpisodeDoodleCard(episode);
          const imagePath = `${user.id}/${crypto.randomUUID()}.webp`;
          const { error: uploadError } = await supabase.storage.from("channel-post-images").upload(imagePath, imageFile, {
            contentType: "image/webp", cacheControl: "3600", upsert: false,
          });
          if (uploadError) throw new Error(`EPS ${episode.day}: gambar gagal diunggah — ${uploadError.message}`);

          let created = false;
          try {
            const parts = episode.material.split(/\n\s*---\s*\n/g).map((part) => part.trim()).filter(Boolean);
            if (parts.some((part) => part.length > 4096) || !parts.length || episode.caption.length > 1024) {
              throw new Error(`EPS ${episode.day}: panjang materi tidak sesuai batas Telegram.`);
            }
            const { data: newPost, error: createError } = await supabase.rpc("admin_create_channel_post_with_automation", {
              p_category_id: categoryId,
              p_title: title,
              p_description: null,
              p_prompt_parts: parts,
              p_license_type: "ORIGINAL",
              p_creator_name: "PEBISNIS DIGITAL TELEGRAM",
              p_source_url: null,
              p_permission_reference: null,
              p_image_path: imagePath,
              p_caption: episode.caption,
              p_upsell_mode: "NONE",
              p_scheduled_at: null,
              p_automation_name: `Komentar · ${title}`,
              p_keywords: ["MAU"],
              p_match_mode: "EXACT",
              p_public_success_reply: "Siap, sudah saya kirim kak, cek japri. ✅",
              p_start_required_reply: "Buka bot dan tekan START dulu agar materi bisa dikirim ke japri.",
              p_membership_required_reply: "Syarat join belum lengkap. Buka bot lalu cek keanggotaan.",
              p_automation_status: "ACTIVE",
            });
            if (createError) throw createError;
            postId = (newPost as { id?: string } | null)?.id;
            if (!postId) throw new Error("Database tidak mengembalikan ID konten yang baru dibuat.");
            created = true;
            posts.unshift({ id: postId, caption: episode.caption, title });
          } finally {
            if (!created) await supabase.storage.from("channel-post-images").remove([imagePath]);
          }
        }

        setBatchImportProgress(`${completed + 1}/30 — Menyimpan EPS ${episode.day} ke kalender...`);
        const { data: assigned, error: assignError } = await supabase.rpc("admin_content_365_assign_post", {
          p_day_number: episode.day, p_source_post_id: postId, p_status: "ACTIVE",
        });
        if (assignError) throw new Error(`Hari ${episode.day}: ${assignError.message}`);
        if ((assigned as { day_number?: number } | null)?.day_number !== episode.day) {
          throw new Error(`Hari ${episode.day}: hasil penyimpanan belum terverifikasi.`);
        }
        completed += 1;
      }
      await refreshContent365();
      setContent365Page(batchNumber - 1);
      setContent365Message({ type: "success", text: `Bagian ${batchNumber} selesai: 30 episode dan visual baru tersimpan di Hari ${firstDay}–${lastDay} dengan status Aktif.` });
      setBatchImportProgress("30/30 selesai dan terverifikasi.");
    } catch (error) {
      await refreshContent365();
      setContent365Message({ type: "error", text: `Bagian ${batchNumber} terhenti pada ${completed}/30. ${error instanceof Error ? error.message : "Terjadi kesalahan."} Jalankan lagi untuk melanjutkan, bukan menimpa.` });
    } finally {
      setBatchImportBusy(null);
    }
  }

  async function replaceContent365Slot(dayNumber: number, sourcePostId: string, status: Content365Item["status"] = "ACTIVE") {
    setContent365Busy("day");
    setContent365Message(null);
    try {
      if (!sourcePostId) throw new Error("Pilih konten yang ingin disusun.");
      const previousDay = content365Items.find((item) => item.source_post_id === sourcePostId)?.day_number;
      const replacedItem = content365Items.find((item) => item.day_number === dayNumber && item.source_post_id !== sourcePostId);
      const { data, error } = await getSupabase(config).rpc("admin_content_365_replace_slot", {
        p_target_day: dayNumber,
        p_source_post_id: sourcePostId,
        p_status: status,
      });
      if (error) throw error;
      const nextItems = (data ?? []) as Content365Item[];
      const placedItem = nextItems.find((item) => item.source_post_id === sourcePostId);
      if (!placedItem) throw new Error("Konten sudah diproses, tetapi posisi barunya belum ditemukan.");
      setContent365Items(nextItems);
      setContent365SelectedDay(placedItem.day_number);
      setContent365SelectedPostId(placedItem.source_post_id);
      setContent365SelectedStatus(placedItem.status);
      const action = previousDay && previousDay !== dayNumber ? `dipindahkan dari Hari ${previousDay}` : "dimasukkan";
      const replacement = replacedItem ? ` ${content365SourceTitle(replacedItem.source_post_id)} dikembalikan ke panel kanan.` : "";
      setContent365Message({ type: "success", text: `${content365SourceTitle(sourcePostId)} ${action} ke Hari ${placedItem.day_number}.${replacement}` });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Isi slot hari gagal disimpan.") });
    } finally {
      setContent365Busy(null);
      setContent365DraggingPostId(null);
      setContent365DraggingOrigin(null);
      setContent365DropDay(null);
      setContent365LibraryDropActive(false);
    }
  }

  async function dropContent365Post(event: React.DragEvent<HTMLButtonElement>, dayNumber: number) {
    event.preventDefault();
    const sourcePostId = event.dataTransfer.getData("application/x-content365-post") || content365DraggingPostId;
    if (!sourcePostId || content365Busy === "day") return;
    const currentItem = content365Items.find((item) => item.source_post_id === sourcePostId);
    await replaceContent365Slot(dayNumber, sourcePostId, currentItem?.status ?? "ACTIVE");
  }

  async function clearContent365Slot(sourcePostId: string) {
    setContent365Busy("day");
    setContent365Message(null);
    const removedItem = content365Items.find((item) => item.source_post_id === sourcePostId);
    try {
      if (!removedItem) return;
      const { data, error } = await getSupabase(config).rpc("admin_content_365_clear_slot", {
        p_source_post_id: sourcePostId,
      });
      if (error) throw error;
      setContent365Items((data ?? []) as Content365Item[]);
      setContent365SelectedDay(removedItem.day_number);
      setContent365SelectedPostId("");
      setContent365SelectedStatus("ACTIVE");
      setContent365Message({ type: "success", text: `${content365SourceTitle(sourcePostId)} dibatalkan dari Hari ${removedItem.day_number} dan kembali ke panel kanan.` });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Konten gagal dibatalkan dari slot hari.") });
    } finally {
      setContent365Busy(null);
      setContent365DraggingPostId(null);
      setContent365DraggingOrigin(null);
      setContent365DropDay(null);
      setContent365LibraryDropActive(false);
    }
  }

  async function dropContent365ToLibrary(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const origin = event.dataTransfer.getData("application/x-content365-origin") || content365DraggingOrigin;
    const sourcePostId = event.dataTransfer.getData("application/x-content365-post") || content365DraggingPostId;
    if (origin !== "calendar" || !sourcePostId || content365Busy === "day") return;
    await clearContent365Slot(sourcePostId);
  }

  async function saveContent365Settings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContent365Busy("settings");
    setContent365Message(null);
    try {
      if (!/^\d{2}:\d{2}$/.test(content365SendTime)) throw new Error("Jam kirim belum valid.");
      if (!Number.isInteger(content365TotalDays) || content365TotalDays < 1 || content365TotalDays > 10000) throw new Error("Jumlah hari harus antara 1–10.000 hari.");
      const { data, error } = await getSupabase(config).rpc("admin_content_365_update_settings", {
        p_enabled: content365Enabled,
        p_send_time: `${content365SendTime}:00`,
        p_timezone: content365Timezone,
        p_loop_enabled: content365LoopEnabled,
        p_total_days: content365TotalDays,
      });
      if (error) throw error;
      const savedSettings = data as Content365Settings;
      applyContent365Settings(savedSettings);
      chooseContent365Day(Math.min(content365SelectedDay, savedSettings.total_days));
      setContent365Message({ type: "success", text: content365Enabled ? `Konten harian aktif untuk siklus ${savedSettings.total_days} hari.` : `Siklus ${savedSettings.total_days} hari tersimpan. Kiriman otomatis masih nonaktif.` });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Pengaturan Konten 365 gagal disimpan.") });
    } finally {
      setContent365Busy(null);
    }
  }

  async function scheduleContent365Start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContent365Busy("start-date");
    setContent365Message(null);
    try {
      if (!content365StartDate) throw new Error("Pilih tanggal mulai Hari 1 terlebih dahulu.");
      const { data, error } = await getSupabase(config).rpc("admin_content_365_schedule_start", { p_start_date: content365StartDate });
      if (error) throw error;
      applyContent365Settings(data as Content365Settings);
      chooseContent365Day(1);
      setContent365Message({
        type: "success",
        text: content365Enabled
          ? `Hari 1 dijadwalkan mulai ${formatCalendarDate(content365StartDate)} pukul ${content365SendTime}.`
          : `Tanggal Hari 1 tersimpan: ${formatCalendarDate(content365StartDate)}. Aktifkan kiriman otomatis agar jadwal berjalan.`,
      });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Tanggal mulai Konten 365 gagal disimpan.") });
    } finally {
      setContent365Busy(null);
    }
  }

  async function postContent365Now() {
    setContent365Busy("post-now");
    setContent365Message(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_content_365_post_now");
      if (error) throw error;
      applyContent365Settings(data as Content365Settings);
      await refreshContent365();
      setContent365Message({ type: "success", text: "Konten hari ini sudah masuk antrean kirim sekarang." });
    } catch (error) {
      setContent365Message({ type: "error", text: content365ErrorText(error, "Konten hari ini gagal dimasukkan ke antrean.") });
    } finally {
      setContent365Busy(null);
    }
  }

  if (loading) return <main className="loading">Memeriksa akses admin...</main>;
  if (!profile) return <main className="loading">{errorMessage ?? "Memuat dashboard..."}<br /><button className="button secondary" type="button" onClick={() => setDashboardRefreshKey((value) => value + 1)}>Coba Lagi</button></main>;

  function openWorkspace(workspace: AdminWorkspace, targetId?: string) {
    setActiveWorkspace(workspace);
    if (workspace !== "home" && targetId) {
      setActiveWorkspaceSection((current) => ({ ...current, [workspace]: targetId }));
      setCategoryModalOpen(true);
      return;
    }
    setCategoryModalOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPrimaryWorkspace(workspace: AdminWorkspace) {
    if (workspace !== "home" && window.matchMedia("(min-width: 900px)").matches) {
      openWorkspace(workspace, activeWorkspaceSection[workspace]);
      return;
    }
    openWorkspace(workspace);
  }

  const lastWorkerRun = workerRuntime?.last_run_at ? new Date(workerRuntime.last_run_at) : null;
  const workerIsAlive = Boolean(
    lastWorkerRun
    && Number.isFinite(lastWorkerRun.getTime())
    && loadedAt - lastWorkerRun.getTime() < 150_000
    && !workerRuntime?.error_code,
  );
  const lastWorkerRunLabel = lastWorkerRun && Number.isFinite(lastWorkerRun.getTime())
    ? new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(lastWorkerRun)
    : "Belum pernah";
  const gate1HCompletedAt = gate1HResult?.completed_at ? new Date(gate1HResult.completed_at) : null;
  const gate1HCompletedLabel = gate1HCompletedAt && Number.isFinite(gate1HCompletedAt.getTime())
    ? new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(gate1HCompletedAt)
    : "Belum diuji";
  const formatPostTime = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value)) + " WIB" : "Belum dijadwalkan";
  const postHasImage = Boolean(postImage || (!postImageRemoved && postExistingImagePath));
  const activePostImagePreviewUrl = postImagePreviewUrl ?? (!postImageRemoved ? postExistingImageUrl : null);
  const previewKeyword = commentRule?.keywords.map((keyword) => keyword.trim()).find(Boolean) ?? "MAU";
  const keywordPreviewValue = `${previewKeyword}\n---\n${commentRule?.public_success_reply || "Balasan setelah materi berhasil dikirim."}\n---\n<b>Jika belum tekan START</b>\n${commentRule?.start_required_reply || "Balasan wajib START akan terlihat di sini."}\n---\n<b>Jika belum bergabung</b>\n${commentRule?.membership_required_reply || "Balasan syarat Channel dan Grup akan terlihat di sini."}`;
  const schedulePreviewValue = `<b>Ringkasan pengiriman</b>\nStatus: ${postAction === "NOW" ? "Kirim sekarang" : postAction === "SCHEDULE" ? `Terjadwal · ${postSchedule || "tanggal belum dipilih"}` : "Draft"}\nPenawaran: ${postUpsellMode === "PROMPT_VIRAL" ? "Aktif setelah materi dihapus" : "Tanpa penawaran tambahan"}`;
  const postStatusLabel = (status: ChannelPostRow["status"]) => ({
    DRAFT: "DRAFT",
    SCHEDULED: "TERJADWAL",
    PUBLISHING: "DIPROSES",
    SENT: "TERPUBLIKASI",
    FAILED: "GAGAL",
    OUTCOME_UNKNOWN: "PERLU CEK",
    CANCELLED: "DIBATALKAN",
  })[status];
  const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(value);
  const claimCountByUser = commentClaims.reduce<Record<string, number>>((totals, claim) => {
    if (claim.user_id && claim.status === "DELIVERED") totals[claim.user_id] = (totals[claim.user_id] ?? 0) + 1;
    return totals;
  }, {});
  const normalizedAudienceSearch = audienceSearch.trim().toLowerCase();
  const filteredMembers = memberStatuses.filter((member) => {
    const claimCount = claimCountByUser[member.id] ?? 0;
    const matchesSegment = audienceSegment === "ALL"
      || (audienceSegment === "ACTIVE" && member.onboarding_status === "ACTIVE")
      || (audienceSegment === "PENDING" && member.onboarding_status !== "ACTIVE")
      || (audienceSegment === "CONTACTABLE" && member.contact_status === "CONTACTABLE")
      || (audienceSegment === "BLOCKED" && ["BLOCKED", "CHAT_NOT_FOUND"].includes(member.contact_status))
      || (audienceSegment === "CLAIMED" && claimCount > 0)
      || (audienceSegment === "NEVER_CLAIMED" && claimCount === 0);
    if (!matchesSegment) return false;
    if (!normalizedAudienceSearch) return true;
    return [member.username, member.first_name, member.last_name, String(member.telegram_user_id)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedAudienceSearch);
  });
  const estimatedBroadcastRecipients = memberStatuses.filter((member) => {
    if (member.status !== "ACTIVE" || member.contact_status !== "CONTACTABLE") return false;
    const claims = claimCountByUser[member.id] ?? 0;
    return broadcastSegment === "ALL"
      || (broadcastSegment === "ACTIVE" && member.onboarding_status === "ACTIVE")
      || (broadcastSegment === "PENDING" && member.onboarding_status !== "ACTIVE")
      || (broadcastSegment === "CLAIMED" && claims > 0)
      || (broadcastSegment === "NEVER_CLAIMED" && claims === 0);
  }).length;
  const formatMemberTime = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value)) + " WIB" : "Belum pernah";

  async function saveEmergencyControls(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmergencyBusy(true);
    setEmergencyMessage(null);
    try {
      const allRunning = emergencyControls.channel_posting_enabled && emergencyControls.free_claim_enabled
        && emergencyControls.checkout_enabled && emergencyControls.follow_up_enabled && emergencyControls.broadcast_enabled;
      const reason = emergencyReason.trim();
      if (!allRunning && reason.length < 3) throw new Error("Tulis alasan singkat sebelum menghentikan alur.");
      const { data, error } = await getSupabase(config).rpc("admin_update_emergency_controls", {
        p_channel_posting_enabled: emergencyControls.channel_posting_enabled,
        p_free_claim_enabled: emergencyControls.free_claim_enabled,
        p_checkout_enabled: emergencyControls.checkout_enabled,
        p_follow_up_enabled: emergencyControls.follow_up_enabled,
        p_broadcast_enabled: emergencyControls.broadcast_enabled,
        p_reason: reason || null,
      });
      if (error) throw error;
      const saved = { ...DEFAULT_EMERGENCY_CONTROLS, ...(data as Partial<EmergencyControls>) };
      setEmergencyControls(saved);
      setEmergencyReason("");
      setEmergencyMessage({
        type: "success",
        text: allRunning ? "Seluruh alur kembali berjalan." : "Mode darurat diterapkan. Antrean dijeda tanpa dihapus.",
      });
    } catch (error) {
      setEmergencyMessage({ type: "error", text: error instanceof Error ? error.message : "Mode darurat gagal disimpan." });
    } finally {
      setEmergencyBusy(false);
    }
  }

  async function saveIncidentAlerts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIncidentAlertBusy(true); setIncidentAlertMessage(null);
    try {
      if (incidentAlertSettings.enabled && !incidentAlertSettings.recipient_user_id) throw new Error("Pilih akun Telegram penerima alarm.");
      const supabase = getSupabase(config);
      const { data, error } = await supabase.rpc("admin_update_incident_alert_settings", {
        p_enabled: incidentAlertSettings.enabled,
        p_recipient_user_id: incidentAlertSettings.recipient_user_id,
        p_admin_url: incidentAlertSettings.admin_url,
      });
      if (error) throw error;
      setIncidentAlertSettings({ ...DEFAULT_INCIDENT_ALERT_SETTINGS, ...(data as Partial<IncidentAlertSettings>) });
      const refreshed = await supabase.rpc("admin_incident_alert_report");
      if (refreshed.error) throw refreshed.error;
      setIncidentAlertReport(refreshed.data as IncidentAlertReport);
      setIncidentAlertMessage({ type: "success", text: incidentAlertSettings.enabled ? "Alarm gangguan aktif. Sistem hanya mengirim saat ada insiden baru atau saat pulih." : "Alarm gangguan dinonaktifkan." });
    } catch (error) {
      setIncidentAlertMessage({ type: "error", text: error instanceof Error ? error.message : "Alarm gangguan gagal disimpan." });
    } finally { setIncidentAlertBusy(false); }
  }

  async function refreshIncidentAlerts() {
    setIncidentAlertBusy(true); setIncidentAlertMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_incident_alert_report");
      if (error) throw error;
      const report = data as IncidentAlertReport;
      setIncidentAlertReport(report);
      setIncidentAlertSettings({ ...DEFAULT_INCIDENT_ALERT_SETTINGS, ...(report.settings ?? {}) });
    } catch (error) {
      setIncidentAlertMessage({ type: "error", text: error instanceof Error ? error.message : "Riwayat alarm gagal dimuat." });
    } finally { setIncidentAlertBusy(false); }
  }

  async function retryDeadJob(job: FailureCenterJob) {
    const reason = (failureRetryReasons[job.id] ?? "").trim();
    if (job.status === "OUTCOME_UNKNOWN") {
      setFailureCenterMessage({ type: "error", text: "Hasil pengiriman job ini tidak pasti. Retry dikunci agar chat tidak terkirim dobel." });
      return;
    }
    if (reason.length < 5) {
      setFailureCenterMessage({ type: "error", text: "Tulis alasan retry minimal 5 karakter." });
      return;
    }
    setFailureCenterBusy(job.id);
    setFailureCenterMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_retry_dead_job", {
        p_job_id: job.id,
        p_reason: reason,
      });
      if (error) throw error;
      setFailureCenter(data as FailureCenterReport);
      setFailureRetryReasons((current) => ({ ...current, [job.id]: "" }));
      setFailureCenterMessage({ type: "success", text: `${job.job_type} masuk antrean ulang. Riwayat error lama tetap tersimpan.` });
      await refreshSystemHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job gagal dimasukkan ke antrean ulang.";
      setFailureCenterMessage({ type: "error", text: message.includes("OUTCOME_UNKNOWN") ? "Retry diblokir karena hasil pengiriman belum pasti." : message });
    } finally { setFailureCenterBusy(null); }
  }

  async function refreshLaunchReadiness() {
    setLaunchReadinessBusy(true); setLaunchReadinessMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_launch_readiness_report");
      if (error) throw error;
      setLaunchReadiness(data as LaunchReadinessReport);
    } catch (error) {
      setLaunchReadinessMessage({ type: "error", text: error instanceof Error ? error.message : "Kesiapan launch gagal diperiksa." });
    } finally { setLaunchReadinessBusy(false); }
  }

  async function beginLaunchTest() {
    setLaunchReadinessBusy(true); setLaunchReadinessMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_begin_launch_test");
      if (error) throw error;
      setLaunchReadiness(data as LaunchReadinessReport);
      setLaunchReadinessMessage({ type: "success", text: "Uji final dimulai. Sekarang buat satu order baru dari akun pembeli sampai akses terkirim." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Uji final gagal dimulai.";
      setLaunchReadinessMessage({ type: "error", text: message.includes("PREFLIGHT") ? "Selesaikan seluruh pengaturan yang masih merah sebelum memulai uji final." : message });
    } finally { setLaunchReadinessBusy(false); }
  }

  function downloadSalesCsv() {
    if (!salesReport?.orders.length) return;
    const headers = ["Kode Order", "Tanggal Order", "Username", "Telegram ID", "Produk", "Nominal", "Status", "Tanggal Lunas", "Referensi", "Status Akses"];
    const lines = salesReport.orders.map((order) => [
      order.order_number, order.created_at, order.username ? `@${order.username}` : order.first_name,
      order.telegram_user_id, order.product_label, order.amount_idr, order.status, order.paid_at,
      order.payment_reference, order.access_delivery_status,
    ].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF", headers.map(csvCell).join(","), "\n", lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laporan-pebisnis-digital-telegram-${salesPeriod.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadActivityCsv() {
    if (!activityReport?.events.length) return;
    const headers = ["Waktu", "Pelaku", "Role", "Kategori", "Aktivitas", "Entitas", "Detail", "Alasan"];
    const lines = activityReport.events.map((event) => [
      event.created_at, event.actor_name, event.actor_role ?? event.actor_type, event.category,
      activityLabel(event.action), event.entity_type, activityDetail(event), event.reason,
    ].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF", headers.map(csvCell).join(","), "\n", lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aktivitas-admin-${activityReport.scope.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadOwnerBackup() {
    setBackupBusy("export"); setBackupMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_export_backup");
      if (error) throw error;
      const serialized = JSON.stringify(data, null, 2);
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `backup-pebisnis-digital-telegram-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupMessage({ type: "success", text: "Backup berhasil dibuat. Simpan file JSON ini di tempat yang aman." });
      setActivityRefreshKey((value) => value + 1);
    } catch (error) {
      setBackupMessage({ type: "error", text: error instanceof Error ? error.message : "Backup gagal dibuat." });
    } finally { setBackupBusy(null); }
  }

  async function previewOwnerBackup(file: File | null) {
    setBackupPayload(null); setBackupPreview(null); setBackupConfirmation(""); setBackupMessage(null);
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setBackupMessage({ type: "error", text: "File terlalu besar. Maksimal 8 MB." }); return;
    }
    setBackupBusy("preview");
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const { data, error } = await getSupabase(config).rpc("admin_preview_backup", { p_backup: parsed });
      if (error) throw error;
      setBackupPayload(parsed);
      setBackupPreview(data as BackupPreview);
      setBackupMessage({ type: "success", text: "File valid dan berasal dari proyek ini. Periksa ringkasannya sebelum memulihkan." });
    } catch (error) {
      setBackupMessage({ type: "error", text: error instanceof Error ? error.message : "File backup tidak valid." });
    } finally { setBackupBusy(null); }
  }

  async function restoreOwnerBackup() {
    if (!backupPayload || backupConfirmation !== "PULIHKAN DATA") return;
    setBackupBusy("restore"); setBackupMessage(null);
    try {
      const { data, error } = await getSupabase(config).rpc("admin_restore_backup", {
        p_backup: backupPayload, p_confirmation: backupConfirmation,
      });
      if (error) throw error;
      const restored = data as { rows_inserted_or_settings_updated?: number };
      setBackupMessage({ type: "success", text: `Pemulihan selesai. ${restored.rows_inserted_or_settings_updated ?? 0} baris dimasukkan atau pengaturan diperbarui. Muat ulang dashboard untuk melihat hasilnya.` });
      setBackupConfirmation(""); setActivityRefreshKey((value) => value + 1);
    } catch (error) {
      setBackupMessage({ type: "error", text: error instanceof Error ? error.message : "Pemulihan gagal. Tidak ada perubahan parsial yang disimpan." });
    } finally { setBackupBusy(null); }
  }

  const activityPanel = (
    <section className="activity-card" aria-labelledby="gate-3j-title">
      <div className="activity-heading">
        <div>
          <p className="eyebrow">SECURITY / GATE 3J</p>
          <h2 id="gate-3j-title">Riwayat Aktivitas</h2>
          <p>{profile.role === "OPERATOR" ? "Jejak keputusan pembayaran dari akun Admin ini dan Admin lain." : "Siapa mengubah apa, kapan, dan di bagian mana. Nggak ada lagi drama tombol misterius."}</p>
        </div>
        <div className="activity-tools">
          {profile.role === "SUPER_ADMIN" ? <label className="field"><span>Jenis aktivitas</span><select value={activityScope} onChange={(event) => setActivityScope(event.target.value as ActivityScope)}><option value="ALL">Semua</option><option value="PAYMENT">Pembayaran</option><option value="SETTINGS">Pengaturan</option><option value="MESSAGE">Pesan & konten</option><option value="SYSTEM">Sistem</option></select></label> : null}
          <button className="button secondary" type="button" onClick={() => setActivityRefreshKey((value) => value + 1)} disabled={activityBusy}>{activityBusy ? "Memuat..." : "Segarkan"}</button>
          <button className="button secondary" type="button" onClick={downloadActivityCsv} disabled={!activityReport?.events.length || activityBusy}>Unduh CSV</button>
        </div>
      </div>
      {activityError ? <p className="integration-result error">{activityError}</p> : null}
      {activityReport ? <>
        <div className="activity-kpis">
          <article><span>TOTAL TERCATAT</span><strong>{activityReport.summary.total}</strong></article>
          <article><span>24 JAM TERAKHIR</span><strong>{activityReport.summary.last_24h}</strong></article>
          <article><span>AKSI ADMIN</span><strong>{activityReport.summary.admin_actions}</strong></article>
          <article><span>PELAKU TERDETEKSI</span><strong>{activityReport.summary.actors}</strong></article>
        </div>
        <div className="activity-list">
          {activityReport.events.map((event) => <article className="activity-row" key={event.id}>
            <b className={`activity-badge activity-${event.category.toLowerCase()}`}>{event.category === "PAYMENT" ? "PEMBAYARAN" : event.category === "SETTINGS" ? "PENGATURAN" : event.category === "MESSAGE" ? "PESAN" : "SISTEM"}</b>
            <div className="activity-copy"><strong>{activityLabel(event.action)}</strong><span>{activityDetail(event)}</span></div>
            <div className="activity-meta"><strong>{event.actor_name}</strong><span>{event.actor_role === "SUPER_ADMIN" ? "OWNER" : event.actor_role === "OPERATOR" ? "ADMIN PEMBAYARAN" : event.actor_type} · {formatPostTime(event.created_at)}</span></div>
          </article>)}
          {!activityReport.events.length ? <p className="catalog-empty">Belum ada aktivitas pada filter ini.</p> : null}
        </div>
        <p className="form-note">Menampilkan maksimal 100 aktivitas terbaru. Data audit tidak bisa diedit atau dihapus dari Web Admin.</p>
      </> : activityBusy ? <p className="sales-loading">Membuka buku jejak...</p> : null}
    </section>
  );

  const backupPanel = profile.role === "SUPER_ADMIN" ? (
    <section className="backup-card" aria-labelledby="gate-3k-title">
      <div className="backup-heading">
        <div><p className="eyebrow">SECURITY / GATE 3K</p><h2 id="gate-3k-title">Backup & Pemulihan</h2><p>Simpan salinan order, member, konfigurasi, konten, dan jejak Admin. Antrean kirim aktif sengaja tidak dibawa agar chat lama tidak meledak setelah dipulihkan.</p></div>
        <strong className="backup-seal">OWNER ONLY</strong>
      </div>
      <div className="backup-grid">
        <article className="backup-action">
          <span>01 / SIMPAN</span><h3>Unduh Backup</h3><p>Membuat satu file JSON. Metadata bukti transfer ikut tercatat; file asli tetap aman di penyimpanan privat.</p>
          <button className="button" type="button" onClick={downloadOwnerBackup} disabled={backupBusy !== null}>{backupBusy === "export" ? "Membuat..." : "Unduh Backup"}</button>
        </article>
        <article className="backup-action restore">
          <span>02 / PERIKSA</span><h3>Pilih File Backup</h3><p>Sistem menolak file rusak, format lama, file di atas 8 MB, atau backup milik proyek lain.</p>
          <label className="field file-field"><span>File JSON</span><input type="file" accept="application/json,.json" disabled={backupBusy !== null} onChange={(event) => previewOwnerBackup(event.target.files?.[0] ?? null)} /></label>
        </article>
      </div>
      {backupMessage ? <p className={`integration-result ${backupMessage.type}`}>{backupMessage.text}</p> : null}
      {backupPreview ? <div className="backup-preview">
        <div><strong>BACKUP VALID</strong><span>Dibuat {formatPostTime(backupPreview.generated_at)} · Format v{backupPreview.schema_version}</span></div>
        <div className="backup-counts"><article><span>ORDER</span><strong>{backupPreview.counts.purchase_orders ?? 0}</strong></article><article><span>MEMBER</span><strong>{backupPreview.counts.users ?? 0}</strong></article><article><span>MATERI</span><strong>{backupPreview.counts.prompts ?? 0}</strong></article><article><span>LOG</span><strong>{backupPreview.counts.audit_logs ?? 0}</strong></article></div>
        <div className="restore-lock"><strong>PEMULIHAN TERKUNCI</strong><p>Data yang sudah ada tidak ditimpa, kecuali pengaturan sistem. Ketik <b>PULIHKAN DATA</b> untuk membuka tombol.</p><label className="field"><span>Konfirmasi</span><input value={backupConfirmation} onChange={(event) => setBackupConfirmation(event.target.value)} placeholder="PULIHKAN DATA" autoComplete="off" /></label><button className="button danger" type="button" onClick={restoreOwnerBackup} disabled={backupBusy !== null || backupConfirmation !== "PULIHKAN DATA"}>{backupBusy === "restore" ? "Memulihkan..." : "Pulihkan Data"}</button></div>
      </div> : null}
      <p className="form-note">Pemulihan berjalan dalam satu transaksi: gagal satu bagian, semuanya dibatalkan. Riwayat ekspor dan pemulihan masuk ke Riwayat Aktivitas.</p>
    </section>
  ) : null;

  const healthStatusLabel = (status: SystemHealthStatus) => status === "HEALTHY" ? "SEHAT" : status === "ATTENTION" ? "PERLU DICEK" : "GANGGUAN";
  const systemHealthPanel = profile.role === "SUPER_ADMIN" ? (
    <section id="kesehatan-sistem" className={`system-health-card health-${(systemHealth?.overall_status ?? "ATTENTION").toLowerCase()}`} aria-labelledby="gate-3l-title">
      <div className="system-health-heading">
        <div>
          <p className="eyebrow">OPERATIONS / GATE 3L</p>
          <h2 id="gate-3l-title">Kesehatan Sistem</h2>
          <p>Satu panel untuk melihat bot, worker, antrean, database, dan bukti transfer. Pemeriksaan ini hanya membaca—tidak mengirim ulang chat.</p>
        </div>
        <div className="system-health-actions">
          <strong className={`health-overall status-${(systemHealth?.overall_status ?? "ATTENTION").toLowerCase()}`}>{systemHealth ? healthStatusLabel(systemHealth.overall_status) : "MEMERIKSA"}</strong>
          <button className="button secondary" type="button" onClick={refreshSystemHealth} disabled={systemHealthBusy}>{systemHealthBusy ? "Memeriksa..." : "Periksa Sekarang"}</button>
        </div>
      </div>
      {systemHealthError ? <p className="integration-result error">{systemHealthError}</p> : null}
      {systemHealth ? <>
        <div className="system-health-grid">
          {systemHealth.checks.map((check) => <article className={`system-health-check status-${check.status.toLowerCase()}`} key={check.key}>
            <div><span>{check.label}</span><b>{healthStatusLabel(check.status)}</b></div>
            <p>{check.detail}</p>
            <small>{check.last_seen_at ? `Terakhir terlihat ${formatPostTime(check.last_seen_at)}` : "Belum ada jejak aktivitas"}</small>
          </article>)}
        </div>
        <div className="system-health-queue">
          <article><span>JATUH TEMPO</span><strong>{systemHealth.queue.due}</strong></article>
          <article><span>RETRY</span><strong>{systemHealth.queue.retry}</strong></article>
          <article><span>MACET</span><strong>{systemHealth.queue.stuck}</strong></article>
          <article><span>GAGAL / TAK PASTI</span><strong>{systemHealth.queue.dead + systemHealth.queue.outcome_unknown}</strong></article>
          <article><span>SELESAI</span><strong>{systemHealth.queue.succeeded}</strong></article>
        </div>
        {systemHealth.recent_failures.length ? <div className="system-health-failures"><strong>JOB YANG PERLU DICEK</strong>{systemHealth.recent_failures.map((failure) => <span key={failure.id}>{failure.job_type} · {failure.status} · percobaan {failure.attempt_count} · {formatPostTime(failure.updated_at)}</span>)}</div> : <p className="system-health-clean">Nol job mati, nol hasil tak pasti, nol proses macet.</p>}
        <p className="form-note">Diperiksa {formatPostTime(systemHealth.generated_at)}. Tombol ini tidak menjalankan ulang job dan tidak mengirim pesan Telegram.</p>
      </> : systemHealthBusy ? <p className="sales-loading">Sedang memeriksa seluruh mesin...</p> : null}
    </section>
  ) : null;

  const incidentLabels: Record<string, string> = { worker: "Worker Otomatis", scheduler: "Jadwal Worker", queue: "Antrean Pesan", storage: "Bukti Transfer" };
  const incidentAlertsPanel = profile.role === "SUPER_ADMIN" ? (
    <section className={`incident-alert-card ${incidentAlertSettings.enabled ? "is-active" : ""}`} aria-labelledby="gate-3n-title">
      <div className="incident-alert-heading">
        <div><p className="eyebrow">ALERT / GATE 3N</p><h2 id="gate-3n-title">Alarm Gangguan</h2><p>Owner diberi tahu saat mesin bermasalah—tanpa harus ronda dashboard. Satu alarm saat rusak, satu kabar saat pulih.</p></div>
        <strong className={incidentAlertReport?.open_count ? "incident-alert-seal danger" : "incident-alert-seal"}>{incidentAlertReport?.open_count ? `${incidentAlertReport.open_count} GANGGUAN` : incidentAlertSettings.enabled ? "SIAGA" : "OFF"}</strong>
      </div>
      <form className="incident-alert-form" onSubmit={saveIncidentAlerts}>
        <label className="status-toggle-row"><span><strong>Kirim alarm Telegram</strong><small>Dipantau tiap menit oleh pemeriksa terpisah.</small></span><input type="checkbox" checked={incidentAlertSettings.enabled} onChange={(event) => setIncidentAlertSettings((current) => ({ ...current, enabled: event.target.checked }))} /></label>
        <label className="field"><span>Penerima Alarm</span><select value={incidentAlertSettings.recipient_user_id ?? ""} onChange={(event) => setIncidentAlertSettings((current) => ({ ...current, recipient_user_id: event.target.value || null }))}><option value="">Pilih akun Telegram Admin</option>{memberStatuses.filter((member) => member.contact_status === "CONTACTABLE").map((member) => <option value={member.id} key={member.id}>{member.username ? `@${member.username}` : member.first_name || member.telegram_user_id}</option>)}</select></label>
        <div className="incident-alert-actions"><button className="button secondary" type="button" onClick={refreshIncidentAlerts} disabled={incidentAlertBusy}>Segarkan</button><button className="button" type="submit" disabled={incidentAlertBusy}>{incidentAlertBusy ? "Menyimpan..." : "Simpan Alarm"}</button></div>
      </form>
      {incidentAlertMessage ? <p className={`integration-result ${incidentAlertMessage.type}`}>{incidentAlertMessage.text}</p> : null}
      <div className="incident-alert-grid">
        {(["worker","scheduler","queue","storage"] as const).map((key) => {
          const open = incidentAlertReport?.incidents.find((incident) => incident.incident_key === key && incident.status === "OPEN");
          return <article className={open ? "has-incident" : ""} key={key}><span>{incidentLabels[key]}</span><strong>{open ? "GANGGUAN" : "NORMAL"}</strong><small>{open?.detail ?? "Tidak ada insiden aktif."}</small></article>;
        })}
      </div>
      {incidentAlertReport?.incidents.length ? <div className="incident-alert-history"><strong>RIWAYAT TERBARU</strong>{incidentAlertReport.incidents.slice(0, 5).map((incident) => <span key={incident.id}>{incident.status === "OPEN" ? "🚨" : "✅"} {incidentLabels[incident.incident_key] ?? incident.incident_key} · {incident.status === "OPEN" ? "dibuka" : "pulih"} {formatPostTime(incident.resolved_at ?? incident.opened_at)}</span>)}</div> : <p className="system-health-clean">Belum pernah ada gangguan yang memicu alarm.</p>}
      <p className="form-note">Alarm tidak mengulang pesan untuk gangguan yang sama. Jika pengiriman gagal, maksimal empat percobaan; pesan Telegram pembeli tidak ikut disentuh.</p>
    </section>
  ) : null;

  const failureCenterPanel = profile.role === "SUPER_ADMIN" ? (
    <section className="failure-center-card" aria-labelledby="gate-3o-title">
      <div className="failure-center-heading">
        <div><p className="eyebrow">RECOVERY / GATE 3O</p><h2 id="gate-3o-title">Pusat Kegagalan</h2><p>Bedah job bermasalah satu per satu. Job mati boleh dicoba ulang; hasil pengiriman yang belum pasti wajib diperiksa manual.</p></div>
        <button className="button secondary" type="button" onClick={refreshFailureCenter} disabled={failureCenterBusy !== null}>{failureCenterBusy === "refresh" ? "Memuat..." : "Segarkan"}</button>
      </div>
      <div className="failure-center-kpis">
        <article><span>MATI / DEAD</span><strong>{failureCenter?.summary.dead ?? 0}</strong></article>
        <article className="unknown"><span>HASIL TAK PASTI</span><strong>{failureCenter?.summary.outcome_unknown ?? 0}</strong></article>
        <article className="retryable"><span>BOLEH RETRY</span><strong>{failureCenter?.summary.retryable ?? 0}</strong></article>
        <article><span>RETRY MANUAL</span><strong>{failureCenter?.summary.manual_retries ?? 0}</strong></article>
      </div>
      {failureCenterMessage ? <p className={`integration-result ${failureCenterMessage.type}`}>{failureCenterMessage.text}</p> : null}
      <div className="failure-job-list">
        {failureCenter?.jobs.map((job) => <article className={`failure-job ${job.status === "OUTCOME_UNKNOWN" ? "is-unknown" : ""}`} key={job.id}>
          <div className="failure-job-head"><div><strong>{job.job_type}</strong><span>{job.entity_type ?? "SYSTEM"} · {formatPostTime(job.updated_at)}</span></div><b>{job.status === "DEAD" ? "MATI" : "TAK PASTI"}</b></div>
          <div className="failure-job-error"><strong>{job.last_error_code ?? "TANPA KODE ERROR"}</strong><span>{job.last_error_message ?? "Tidak ada pesan error tambahan."}</span></div>
          <div className="failure-job-meta"><span>Percobaan {job.attempt_count}/{job.max_attempts}</span><span>{job.manual_retry_count} retry manual</span></div>
          {job.status === "DEAD" ? <div className="failure-retry-box"><label className="field"><span>Alasan retry</span><input value={failureRetryReasons[job.id] ?? ""} onChange={(event) => setFailureRetryReasons((current) => ({ ...current, [job.id]: event.target.value }))} maxLength={500} placeholder="Contoh: Token Telegram sudah diperbaiki" /></label><button className="button danger" type="button" onClick={() => retryDeadJob(job)} disabled={failureCenterBusy !== null}>{failureCenterBusy === job.id ? "Memproses..." : "Coba Ulang"}</button></div> : <p className="failure-lock">RETRY DIKUNCI — cek Telegram dan catatan transaksi sebelum mengambil keputusan manual.</p>}
        </article>)}
        {failureCenter && !failureCenter.jobs.length ? <p className="failure-center-clean">Antrean bersih. Tidak ada job mati atau hasil pengiriman tak pasti.</p> : null}
        {!failureCenter && failureCenterBusy === "refresh" ? <p className="sales-loading">Membuka pusat kegagalan...</p> : null}
      </div>
      {failureCenter?.history.length ? <div className="failure-history"><strong>RIWAYAT RETRY MANUAL</strong>{failureCenter.history.slice(0, 8).map((item) => <span key={item.id}>{item.job_type} · {item.actor_name} · {formatPostTime(item.retried_at)} · {item.reason}</span>)}</div> : null}
      <p className="form-note">Retry tidak menghapus error lama. Semua keputusan dicatat di Riwayat Aktivitas Admin.</p>
    </section>
  ) : null;

  const launchStatusLabel = launchReadiness?.status === "READY_TO_LAUNCH" ? "SIAP LAUNCH" : launchReadiness?.status === "READY_FOR_TEST" ? "SIAP UJI FINAL" : "BELUM SIAP";
  const launchReadinessPanel = profile.role === "SUPER_ADMIN" ? (
    <section className={`launch-readiness-card status-${(launchReadiness?.status ?? "BLOCKED").toLowerCase()}`} aria-labelledby="gate-3p-title">
      <div className="launch-readiness-heading">
        <div><p className="eyebrow">GO LIVE / GATE 3P</p><h2 id="gate-3p-title">Kesiapan Launch</h2><p>Ini gerbang terakhir sebelum PEBISNIS DIGITAL TELEGRAM menerima pembeli sungguhan. Tidak ada stiker hijau palsu—semua dibaca dari kondisi sistem.</p></div>
        <div className="launch-readiness-actions"><strong>{launchStatusLabel}</strong><button className="button secondary" type="button" onClick={refreshLaunchReadiness} disabled={launchReadinessBusy}>{launchReadinessBusy ? "Memeriksa..." : "Periksa Lagi"}</button></div>
      </div>
      <div className="launch-progress"><div><span style={{ width: `${launchReadiness ? (launchReadiness.ready_count / launchReadiness.required_count) * 100 : 0}%` }} /></div><strong>{launchReadiness?.ready_count ?? 0}/{launchReadiness?.required_count ?? 12} SIAP</strong></div>
      {launchReadinessMessage ? <p className={`integration-result ${launchReadinessMessage.type}`}>{launchReadinessMessage.text}</p> : null}
      <div className="launch-check-grid">
        {launchReadiness?.checks.map((check) => <article className={check.ready ? "is-ready" : "is-blocked"} key={check.key}><b>{check.ready ? "✓" : "!"}</b><div><strong>{check.label}</strong><span>{check.detail}</span>{!check.ready ? <small>{check.action}</small> : null}</div></article>)}
      </div>
      <div className="launch-final-test"><div><strong>UJI TRANSAKSI FINAL</strong><p>{launchReadiness?.final_test_passed ? "LULUS. Order baru sudah lunas dan akses terkirim." : launchReadiness?.final_test_started_at ? `Sedang berjalan sejak ${formatPostTime(launchReadiness.final_test_started_at)}.` : "Aktif setelah 11 pemeriksaan awal berwarna hijau."}</p></div><button className="button" type="button" onClick={beginLaunchTest} disabled={launchReadinessBusy || !launchReadiness?.preflight_ready || launchReadiness.final_test_passed}>{launchReadiness?.final_test_passed ? "Uji Lulus" : launchReadiness?.final_test_started_at ? "Mulai Ulang Uji" : "Mulai Uji Final"}</button></div>
      <p className="form-note">Status SIAP LAUNCH baru muncul setelah identitas produksi, pembayaran, notifikasi, kesehatan sistem, dan satu transaksi penuh semuanya lulus.</p>
    </section>
  ) : null;

  const emergencyControlItems = [
    { key: "channel_posting_enabled" as const, label: "Posting Channel", detail: "Menjeda posting terjadwal. Draft dan antrean tetap utuh." },
    { key: "free_claim_enabled" as const, label: "Materi Gratis", detail: "Menghentikan klaim baru dari komentar MAU." },
    { key: "checkout_enabled" as const, label: "Checkout", detail: "Mencegah order baru. Bukti dan order lama tetap diproses." },
    { key: "follow_up_enabled" as const, label: "Follow-up", detail: "Menjeda pengingat pembayaran tanpa membatalkan enrollment." },
    { key: "broadcast_enabled" as const, label: "Broadcast", detail: "Menjeda pengiriman massal tanpa menghapus penerima." },
  ];
  const pausedEmergencyControls = emergencyControlItems.filter((item) => !emergencyControls[item.key]).length;
  const emergencyControlsPanel = profile.role === "SUPER_ADMIN" ? (
    <section className={`emergency-card ${pausedEmergencyControls ? "is-paused" : ""}`} aria-labelledby="gate-3m-title">
      <div className="emergency-heading">
        <div><p className="eyebrow">SAFETY / GATE 3M</p><h2 id="gate-3m-title">Mode Darurat</h2><p>Hentikan satu alur tanpa mematikan bot. Data dan antrean tidak dihapus; worker hanya menunggu sampai Owner menyalakannya lagi.</p></div>
        <strong className={pausedEmergencyControls ? "emergency-seal paused" : "emergency-seal"}>{pausedEmergencyControls ? `${pausedEmergencyControls} DIJEDA` : "SEMUA JALAN"}</strong>
      </div>
      <form onSubmit={saveEmergencyControls}>
        <div className="emergency-grid">
          {emergencyControlItems.map((item) => <label className={emergencyControls[item.key] ? "emergency-control" : "emergency-control paused"} key={item.key}>
            <input type="checkbox" checked={emergencyControls[item.key]} onChange={(event) => setEmergencyControls((current) => ({ ...current, [item.key]: event.target.checked }))} />
            <span className="emergency-copy"><b>{item.label}</b><small>{item.detail}</small></span>
            <strong>{emergencyControls[item.key] ? "BERJALAN" : "DIJEDA"}</strong>
          </label>)}
        </div>
        <div className="emergency-footer">
          <label className="field"><span>Alasan perubahan</span><input value={emergencyReason} onChange={(event) => setEmergencyReason(event.target.value)} maxLength={500} placeholder="Contoh: Telegram sedang gangguan" /></label>
          <button className="button danger" type="submit" disabled={emergencyBusy}>{emergencyBusy ? "Menerapkan..." : "Terapkan Mode"}</button>
        </div>
      </form>
      {emergencyMessage ? <p className={`integration-result ${emergencyMessage.type}`}>{emergencyMessage.text}</p> : null}
      <p className="form-note">{emergencyControls.updated_at ? `Terakhir diubah ${formatPostTime(emergencyControls.updated_at)}. ` : ""}Perubahan dicatat di Riwayat Aktivitas. Pesanan lunas, bukti transfer, dan notifikasi Admin tidak ikut dihentikan.</p>
    </section>
  ) : null;

  if (profile.role === "OPERATOR") {
    return (
      <main className="dashboard payment-admin-dashboard">
        <header className="dash-head"><span className="brand">PEBISNIS DIGITAL TELEGRAM</span><button className="button secondary" onClick={signOut}>Keluar</button></header>
        <section className="dash-intro"><p className="eyebrow">PAYMENT DESK</p><h1>Meja Pembayaran.</h1><p>{email}<span className="role-badge">ADMIN PEMBAYARAN</span></p></section>
        <section className="permission-strip"><strong>AKSES TERBATAS</strong><span>Boleh memeriksa pembayaran dan laporan. Rekening, broadcast, bot, dan pengaturan sistem dikunci.</span></section>
        <section className="sales-card" aria-labelledby="operator-sales-title">
          <div className="sales-heading"><div><p className="eyebrow">LAPORAN</p><h2 id="operator-sales-title">Penjualan</h2><p>Omzet hanya menghitung order yang sudah lunas.</p></div><div className="sales-tools"><label className="field"><span>Periode</span><select value={salesPeriod} onChange={(event) => { setSalesPeriod(event.target.value as SalesPeriod); setOrderPage(1); setOrderControlId(null); }}><option value="TODAY">Hari ini</option><option value="7D">7 hari</option><option value="30D">30 hari</option><option value="ALL">Semua waktu</option></select></label><button className="button secondary" type="button" onClick={downloadSalesCsv} disabled={!salesReport?.orders.length || salesReportBusy}>Unduh CSV</button></div></div>
          {salesReportError ? <p className="integration-result error">{salesReportError}</p> : null}
          {salesReport ? <div className="sales-kpis"><article className="sales-kpi revenue"><span>OMZET LUNAS</span><strong>{formatRupiah(salesReport.summary.revenue_idr)}</strong><small>{salesReport.summary.paid_orders} pembayaran</small></article><article className="sales-kpi"><span>TOTAL ORDER</span><strong>{salesReport.summary.total_orders}</strong><small>{salesReport.summary.conversion_rate}% lunas</small></article><article className="sales-kpi warn"><span>BELUM TRANSFER</span><strong>{salesReport.summary.pending_payment}</strong><small>Masih berjalan</small></article><article className="sales-kpi review"><span>CEK BUKTI</span><strong>{salesReport.summary.pending_verification}</strong><small>Perlu keputusan</small></article></div> : null}
        </section>
        {activityPanel}
        <section id="pesanan-pembayaran" className="follow-up-card payment-desk" aria-labelledby="operator-orders-title">
          <div className="follow-up-heading"><div><p className="eyebrow">VERIFIKASI</p><h2 id="operator-orders-title">Pesanan Pembayaran</h2><p>Buka bukti, cocokkan nominal, lalu ACC atau tolak dengan alasan yang jelas.</p></div><div className="follow-up-counts"><article><strong>{purchaseOrders.filter((item) => item.status === "PENDING_VERIFICATION").length}</strong><span>CEK BUKTI</span></article><article><strong>{purchaseOrders.filter((item) => item.status === "PENDING_PAYMENT").length}</strong><span>BELUM TF</span></article><article><strong>{purchaseOrders.filter((item) => item.status === "PAID").length}</strong><span>LUNAS</span></article></div></div>
          {orderMessage ? <p className={`integration-result ${orderMessage.type}`}>{orderMessage.text}</p> : null}
          <div className="follow-up-history"><div className="post-stack">
            {purchaseOrders.map((order) => {
              const proof = currentPaymentProof(order);
              const proofUrl = proof ? proofUrls[proof.id] : null;
              return <article className="payment-order-row" key={order.id}>
                <div className="payment-order-head"><div><strong>{order.order_number} · {order.users?.username ? `@${order.users.username}` : order.users?.first_name ?? "Member"}</strong><span>{order.product_label} · {formatRupiah(order.amount_idr)} · {formatPostTime(order.created_at)}{order.status === "PAID" ? ` · AKSES ${order.access_delivery_status}` : ""}</span></div><div className="broadcast-member-action">{order.status === "PENDING_PAYMENT" ? <button type="button" disabled={orderBusy === order.id} onClick={() => markOrderPaid(order.id)}>{orderBusy === order.id ? "MEMPROSES..." : "LUNAS MANUAL"}</button> : <b className={`post-status status-${order.status.toLowerCase()}`}>{order.status === "PAID" ? "LUNAS" : order.status === "PENDING_VERIFICATION" ? "CEK BUKTI" : order.status}</b>}</div></div>
                {order.status === "PENDING_VERIFICATION" && proof ? <div className="payment-proof-review"><div className="payment-proof-meta"><strong>BUKTI #{proof.revision}</strong><span>{proof.mime_type.replace("application/", "").replace("image/", "").toUpperCase()} · {(proof.file_size / 1024).toFixed(0)} KB · {formatPostTime(proof.submitted_at)}</span></div>{!proofUrl ? <button className="button secondary" type="button" disabled={orderBusy === `proof:${proof.id}`} onClick={() => loadPaymentProof(proof)}>{orderBusy === `proof:${proof.id}` ? "Membuka..." : "Lihat Bukti"}</button> : proof.mime_type === "application/pdf" ? <a className="button secondary" href={proofUrl} target="_blank" rel="noreferrer">Buka PDF</a> : <img className="payment-proof-image" src={proofUrl} alt={`Bukti transfer ${order.order_number}`} />}<label className="field"><span>Alasan jika ditolak</span><input value={proofRejectionReasons[proof.id] ?? ""} onChange={(event) => setProofRejectionReasons((current) => ({ ...current, [proof.id]: event.target.value }))} maxLength={500} placeholder="Nominal tidak sesuai atau bukti buram" /></label><div className="payment-proof-actions"><button type="button" className="button danger" disabled={orderBusy === `review:${proof.id}`} onClick={() => reviewPaymentProof(order, "REJECT")}>Tolak Bukti</button><button type="button" className="button" disabled={orderBusy === `review:${proof.id}`} onClick={() => reviewPaymentProof(order, "APPROVE")}>{orderBusy === `review:${proof.id}` ? "Memproses..." : "ACC & Kirim Akses"}</button></div></div> : null}
              </article>;
            })}
            {!purchaseOrders.length ? <p className="catalog-empty">Belum ada pesanan.</p> : null}
          </div></div>
        </section>
      </main>
    );
  }

  const workspaceLabels: Record<AdminWorkspace, { title: string; subtitle: string }> = {
    home: { title: `Halo, ${profile.display_name || "Teh Vini"}`, subtitle: "Mau mengerjakan apa hari ini?" },
    orders: { title: "Pesanan", subtitle: "Cek transfer, ACC bukti, dan pantau omzet." },
    content: { title: "Konten", subtitle: "Posting materi, susun kalender, pantau pengiriman, dan atur automasi." },
    members: { title: "Member", subtitle: "Lihat member aktif dan kelola aksesnya." },
    settings: { title: "Pengaturan", subtitle: "Konfigurasi lanjutan dan kesehatan sistem." },
  };
  const pendingProofCount = purchaseOrders.filter((item) => item.status === "PENDING_VERIFICATION").length;
  const normalizedOrderSearch = orderSearch.trim().toLocaleLowerCase("id-ID");
  const filteredSalesOrders = salesReport?.orders.filter((order) => !normalizedOrderSearch || [
    order.order_number,
    order.product_label,
    order.username,
    order.first_name,
    String(order.telegram_user_id),
    order.status,
    order.access_delivery_status,
  ].some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(normalizedOrderSearch))) ?? [];
  const orderTotalPages = Math.max(1, Math.ceil(filteredSalesOrders.length / orderPageSize));
  const currentOrderPage = Math.min(orderPage, orderTotalPages);
  const visibleSalesOrders = filteredSalesOrders.slice((currentOrderPage - 1) * orderPageSize, currentOrderPage * orderPageSize);

  const activeMemberCount = memberStatuses.filter((item) => item.onboarding_status === "ACTIVE").length;
  const systemReady = launchReadiness?.status === "READY_TO_LAUNCH" && (systemHealth?.overall_status ?? "ATTENTION") === "HEALTHY";
  const workspaceShortcuts: Record<Exclude<AdminWorkspace, "home">, Array<{ icon: string; label: string; detail: string; target: string }>> = {
    orders: [
      { icon: "▣", label: "Semua Order", detail: "Kelola status & bukti", target: "pesanan-pembayaran" },
    ],
    content: [
      { icon: "✦", label: "Posting & Keyword", detail: "Konten + automasi", target: "buat-postingan" },
      { icon: "↻", label: "Kalender Konten", detail: "Isi materi per hari", target: "kalender-365" },
      { icon: "↺", label: "Riwayat Pengiriman", detail: "Pantau hasil kirim", target: "riwayat-365" },
      { icon: "↗", label: "Broadcast", detail: "Kirim ke member", target: "kirim-broadcast" },
      { icon: "⌛", label: "Materi Gratis", detail: "Waktu & upsell", target: "prompt-expiry" },
    ],
    members: [
      { icon: "✓", label: "Onboarding", detail: "Atur pintu masuk", target: "onboarding-member" },
      { icon: "♟", label: "Daftar Member", detail: "Lihat status akses", target: "daftar-member" },
    ],
    settings: [
      { icon: "📣", label: "Channel & Grup", detail: "Tujuan produksi bot", target: "channel-grup-produksi" },
      { icon: "🛒", label: "Tombol BELI", detail: "Produk & akses", target: "pengaturan-checkout" },
      { icon: "💳", label: "Pembayaran", detail: "Bank, QRIS & kupon", target: "pembayaran" },
      { icon: "⌛", label: "Batas Bayar", detail: "Order kedaluwarsa", target: "batas-pembayaran" },
      { icon: "🔔", label: "Notifikasi", detail: "Semua redaksi bot", target: "notifikasi-admin" },
      { icon: "↻", label: "Follow-up", detail: "Kejar transfer", target: "automasi-follow-up" },
      { icon: "🤖", label: "Bot", detail: "Token & koneksi", target: "pengaturan-bot" },
      { icon: "🔐", label: "Admin", detail: "Hak akses", target: "pengaturan-admin" },
      { icon: "⚙", label: "Sistem", detail: "Kesehatan mesin", target: "kesehatan-sistem" },
    ],
  };
  const content365Duration = content365Settings?.total_days ?? 365;
  const content365ItemsByDay = new Map(content365Items.map((item) => [item.day_number, item]));
  const content365ItemsInRange = content365Items.filter((item) => item.day_number <= content365Duration);
  const content365ActiveCount = content365ItemsInRange.filter((item) => item.status === "ACTIVE").length;
  const content365ConfiguredCount = content365ItemsInRange.length;
  const content365PageCount = Math.max(1, Math.ceil(content365Duration / 30));
  const content365RangeStart = content365Page * 30 + 1;
  const content365RangeEnd = Math.min(content365Duration, content365RangeStart + 29);
  const content365RangeDays = Array.from({ length: content365RangeEnd - content365RangeStart + 1 }, (_, index) => content365RangeStart + index);
  const filteredContent365Days = content365RangeDays.filter((dayNumber) => {
    const item = content365ItemsByDay.get(dayNumber);
    if (content365Filter === "ALL") return true;
    if (content365Filter === "EMPTY") return !item;
    return item?.status === content365Filter;
  });
  const content365SourceTitle = (postId: string) => {
    const post = content365SourcePosts.find((entry) => entry.id === postId);
    return post?.prompts?.title ?? post?.caption?.replace(/<[^>]*>/g, "").split("\n")[0]?.slice(0, 80) ?? "Posting sumber";
  };
  const assignedContent365SourceIds = new Set(content365Items.map((item) => item.source_post_id));
  const normalizedContent365SourceSearch = content365SourceSearch.trim().toLocaleLowerCase("id-ID");
  const availableContent365SourcePosts = content365SourcePosts.filter((post) => {
    if (assignedContent365SourceIds.has(post.id)) return false;
    if (!normalizedContent365SourceSearch) return true;
    const searchable = `${content365SourceTitle(post.id)} ${post.caption ?? ""} ${post.status}`.toLocaleLowerCase("id-ID");
    return searchable.includes(normalizedContent365SourceSearch);
  });
  const activeCategory = activeWorkspace === "home"
    ? null
    : workspaceShortcuts[activeWorkspace].find((item) => item.target === activeWorkspaceSection[activeWorkspace]) ?? null;

  function closeCategoryModal() {
    setCategoryModalOpen(false);
  }

  return (
    <main className="dashboard app-dashboard">
      <header className="app-header">
        <button className="app-brand" type="button" onClick={() => openWorkspace("home")}><span>PDT</span><strong>PEBISNIS DIGITAL TELEGRAM</strong></button>
        <div className="app-account"><span>{profile.display_name || email}</span><button type="button" onClick={signOut}>Keluar</button></div>
      </header>
      <nav className="app-nav" aria-label="Menu utama">
        <button className="app-sidebar-brand" type="button" onClick={() => openWorkspace("home")} aria-label="Buka beranda">
          <span>PDT</span><em>PEBISNIS DIGITAL</em>
        </button>
        {(["home", "orders", "content", "members", "settings"] as AdminWorkspace[]).map((item) => (
          <Fragment key={item}>
            <button type="button" className={`app-nav-primary ${activeWorkspace === item ? "active" : ""}`} onClick={() => openPrimaryWorkspace(item)}>
              <span aria-hidden="true">{item === "home" ? "⌂" : item === "orders" ? "▣" : item === "content" ? "✦" : item === "members" ? "♟" : "⚙"}</span>
              <em>{item === "home" ? "Beranda" : item === "orders" ? "Pesanan" : item === "content" ? "Konten" : item === "members" ? "Member" : "Pengaturan"}</em>
              {item === "orders" && pendingProofCount > 0 ? <b>{pendingProofCount}</b> : null}
            </button>
            {item !== "home" && activeWorkspace === item ? (
              <div className="app-nav-submenu" aria-label={`Submenu ${workspaceLabels[item].title}`}>
                {workspaceShortcuts[item].map((shortcut) => (
                  <button
                    type="button"
                    className={categoryModalOpen && activeWorkspaceSection[item] === shortcut.target ? "active" : ""}
                    key={shortcut.target}
                    onClick={() => openWorkspace(item, shortcut.target)}
                  >
                    <i aria-hidden="true">{shortcut.icon}</i>
                    <span><strong>{shortcut.label}</strong><small>{shortcut.detail}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
      </nav>
      <section className={`app-page-title ${activeWorkspace === "home" ? "home-page-title" : "workspace-page-title"}`}><div><p>ADMIN PEBISNIS DIGITAL TELEGRAM</p><h1>{workspaceLabels[activeWorkspace].title}</h1><span>{workspaceLabels[activeWorkspace].subtitle}</span></div><i className={systemReady ? "ready" : "attention"}>{systemReady ? "● Sistem normal" : "● Perlu diperiksa"}</i></section>

      {activeWorkspace !== "home" ? <section className="app-category-panel" aria-label={`Kategori ${workspaceLabels[activeWorkspace].title}`}>
        <div className="app-category-heading"><strong>Pilih kategori</strong><span>Klik kategori untuk membuka pengaturan</span></div>
        <div className="app-category-grid">{workspaceShortcuts[activeWorkspace].map((item) => <button type="button" className={categoryModalOpen && activeWorkspaceSection[activeWorkspace] === item.target ? "active" : ""} key={item.target} onClick={() => openWorkspace(activeWorkspace, item.target)} aria-haspopup="dialog"><i aria-hidden="true">{item.icon}</i><strong>{item.label}</strong><span>{item.detail}</span></button>)}</div>
      </section> : null}

      <section className="app-home" hidden={activeWorkspace !== "home"}>
        <div className="home-balance"><span>OMZET {salesPeriod === "TODAY" ? "HARI INI" : salesPeriod === "7D" ? "7 HARI" : salesPeriod === "30D" ? "30 HARI" : "TOTAL"}</span><strong>{formatRupiah(salesReport?.summary.revenue_idr ?? 0)}</strong><button type="button" onClick={() => openPrimaryWorkspace("orders")}>Lihat laporan →</button></div>
        <div className="home-stats">
          <article className={pendingProofCount ? "urgent" : ""}><span>Butuh ACC</span><strong>{pendingProofCount}</strong><small>bukti pembayaran</small></article>
          <article><span>Member aktif</span><strong>{activeMemberCount}</strong><small>dari {memberStatuses.length} akun</small></article>
          <article><span>Belum transfer</span><strong>{purchaseOrders.filter((item) => item.status === "PENDING_PAYMENT").length}</strong><small>sedang di-follow-up</small></article>
        </div>
        <div className="home-actions">
          <div className="home-section-title"><h2>Aksi cepat</h2><span>Yang paling sering dipakai</span></div>
          <div className="quick-action-grid">
            <button type="button" className={pendingProofCount ? "has-alert" : ""} onClick={() => openWorkspace("orders", "pesanan-pembayaran")}><i>✓</i><strong>ACC Pesanan</strong><span>{pendingProofCount ? `${pendingProofCount} bukti menunggu` : "Semua sudah beres"}</span></button>
            <button type="button" onClick={() => openWorkspace("content", "buat-postingan")}><i>＋</i><strong>Buat Postingan</strong><span>Kirim materi ke Channel</span></button>
            <button type="button" onClick={() => openWorkspace("content", "kirim-broadcast")}><i>↗</i><strong>Kirim Broadcast</strong><span>Hubungi member terpilih</span></button>
            <button type="button" onClick={() => openWorkspace("content", "kalender-365")}><i>365</i><strong>Kalender Konten</strong><span>{content365ConfiguredCount}/{content365Duration} hari diisi</span></button>
            <button type="button" onClick={() => openWorkspace("members", "daftar-member")}><i>♟</i><strong>Kelola Member</strong><span>{activeMemberCount} akses aktif</span></button>
          </div>
        </div>
      </section>

      {categoryModalOpen && activeWorkspace !== "home" && activeCategory ? (
        <div
          className={`app-category-modal app-category-page-${activeCategory.target}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-category-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCategoryModal();
          }}
        >
          <div className="app-category-modal-panel">
            <header className="app-category-modal-header">
              <div className="app-category-modal-title">
                <i aria-hidden="true">{activeCategory.icon}</i>
                <div>
                  <span>{workspaceLabels[activeWorkspace].title}</span>
                  <h2 id="app-category-modal-title">{activeCategory.label}</h2>
                  <p>{activeCategory.detail}</p>
                </div>
              </div>
              <button className="app-category-modal-close" type="button" onClick={closeCategoryModal} aria-label="Tutup pop-up" autoFocus>×</button>
            </header>
            <div className="app-category-modal-body">
      <section id="kalender-365" className="content365-card" hidden={activeWorkspace !== "content" || activeWorkspaceSection.content !== "kalender-365"} aria-labelledby="content365-calendar-title">
        <div className="content365-heading">
          <div><p className="eyebrow">ROTASI FLEKSIBEL</p><h2 id="content365-calendar-title">Kalender {content365Duration} Hari</h2><p>Pilih satu materi untuk setiap hari. Setelah hari terakhir, konten bisa kembali ke Hari 1.</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {content365Duration >= 240 ? <button className="button secondary" type="button" onClick={() => void importCalendarBatch(8)} disabled={Boolean(batchImportBusy) || Boolean(content365Busy)}>{batchImportBusy === 8 ? "Mengisi Bagian 8..." : "Isi Bagian 8"}</button> : null}
            {content365Duration >= 270 ? <button className="button secondary" type="button" onClick={() => void importCalendarBatch(9)} disabled={Boolean(batchImportBusy) || Boolean(content365Busy)}>{batchImportBusy === 9 ? "Mengisi Bagian 9..." : "Isi Bagian 9"}</button> : null}
            {content365Duration >= 300 ? <button className="button secondary" type="button" onClick={() => void importCalendarBatch(10)} disabled={Boolean(batchImportBusy) || Boolean(content365Busy)}>{batchImportBusy === 10 ? "Mengisi Bagian 10..." : "Isi Bagian 10"}</button> : null}
            <button className="button secondary" type="button" onClick={() => refreshContent365(true)} disabled={content365Busy === "refresh" || Boolean(batchImportBusy)}>{content365Busy === "refresh" ? "Memuat..." : "Segarkan"}</button>
          </div>
        </div>
        {batchImportProgress ? <p className="integration-result" role="status" aria-live="polite">{batchImportProgress}</p> : null}
        <div className="content365-summary">
          <article className={content365Settings?.enabled ? "is-active" : "is-paused"}><span>STATUS</span><strong>{content365Settings?.enabled ? "AKTIF" : "NONAKTIF"}</strong><small>{content365Settings?.enabled ? `Kirim ${content365SendTime} WIB` : "Tidak ada kiriman otomatis"}</small></article>
          <article><span>TERISI</span><strong>{content365ConfiguredCount}/{content365Duration}</strong><small>{content365Duration - content365ConfiguredCount} hari masih kosong</small></article>
          <article><span>SIAP KIRIM</span><strong>{content365ActiveCount}</strong><small>slot berstatus Aktif</small></article>
          <article className="current"><span>HARI BERJALAN</span><strong>{content365Settings?.current_day ?? 1}</strong><small>{content365Settings?.next_run_at ? formatPostTime(content365Settings.next_run_at) : "Belum dijadwalkan"}</small></article>
        </div>
        {content365Message ? <p className={`integration-result ${content365Message.type}`}>{content365Message.text}</p> : null}
        <div className="content365-compact-settings" aria-labelledby="content365-compact-settings-title">
          <div className="content365-compact-settings-head">
            <div><span>PENGATURAN CEPAT</span><strong id="content365-compact-settings-title">Jadwal Konten</strong></div>
            <b className={`content365-seal ${content365Settings?.enabled ? "active" : ""}`}>{content365Settings?.enabled ? "BERJALAN" : "BERHENTI"}</b>
          </div>
          <form className="content365-quick-settings" onSubmit={saveContent365Settings}>
            <label className="content365-mini-toggle"><input type="checkbox" checked={content365Enabled} onChange={(event) => setContent365Enabled(event.target.checked)} /><span>Otomatis</span><b>{content365Enabled ? "ON" : "OFF"}</b></label>
            <label className="field"><span>Jumlah hari</span><input type="number" min="1" max="10000" value={content365TotalDays} onChange={(event) => setContent365TotalDays(Number(event.target.value))} required /></label>
            <label className="field"><span>Jam kirim</span><input type="time" value={content365SendTime} onChange={(event) => setContent365SendTime(event.target.value)} required /></label>
            <label className="field"><span>Zona waktu</span><select value={content365Timezone} onChange={(event) => setContent365Timezone(event.target.value)}><option value="Asia/Jakarta">WIB — Jakarta</option><option value="Asia/Makassar">WITA — Makassar</option><option value="Asia/Jayapura">WIT — Jayapura</option></select></label>
            <label className="content365-mini-toggle"><input type="checkbox" checked={content365LoopEnabled} onChange={(event) => setContent365LoopEnabled(event.target.checked)} /><span>Ulang Hari 1</span><b>{content365LoopEnabled ? "LOOP" : "STOP"}</b></label>
            <button className="button" type="submit" disabled={content365Busy === "settings"}>{content365Busy === "settings" ? "Menyimpan..." : "Simpan Jadwal"}</button>
          </form>
          <div className="content365-duration-presets compact" aria-label="Pilihan cepat jumlah hari">{[10, 30, 365, 1000].map((days) => <button type="button" key={days} className={content365TotalDays === days ? "active" : ""} onClick={() => setContent365TotalDays(days)}>{days} hari</button>)}</div>
          <div className="content365-quick-actions">
            <form className="content365-quick-start" onSubmit={scheduleContent365Start}>
              <label className="field"><span>Mulai Hari 1</span><input type="date" min={dateInputValueInTimeZone(new Date(), content365Timezone)} value={content365StartDate} onChange={(event) => setContent365StartDate(event.target.value)} required /></label>
              <button className="button secondary" type="submit" disabled={content365Busy === "start-date"}>{content365Busy === "start-date" ? "Menyimpan..." : "Simpan Tanggal"}</button>
            </form>
            <button className="button content365-send-now" type="button" onClick={postContent365Now} disabled={content365Busy === "post-now" || !content365Settings?.enabled || !content365ActiveCount || Boolean(content365Settings?.pending_post_id)}>{content365Busy === "post-now" ? "Memproses..." : content365Settings?.pending_post_id ? "Sedang Diproses" : "Kirim Sekarang"}</button>
            <div className={`content365-quick-runtime ${content365Settings?.last_error ? "error" : ""}`}><span>STATUS TERAKHIR</span><strong>{content365Settings?.last_error ? "Perlu diperiksa" : content365Settings?.last_sent_at ? "Pengiriman berhasil" : "Belum pernah mengirim"}</strong><small>{content365Settings?.last_error ? content365Settings.last_error : content365Settings?.next_run_at ? `Berikutnya ${formatPostTime(content365Settings.next_run_at)}` : "Jadwal belum aktif"}</small></div>
          </div>
        </div>
        <div className="content365-progress-card">
          <div><strong>Progres penyusunan</strong><span>{content365ConfiguredCount} dari {content365Duration} hari sudah diisi</span></div>
          <b>{Math.round((content365ConfiguredCount / content365Duration) * 100)}%</b>
          <div className="content365-progress-track"><i style={{ width: `${(content365ConfiguredCount / content365Duration) * 100}%` }} /></div>
        </div>
        <div className="content365-guide"><span><b>1</b>Pilih bagian</span><span><b>2</b>Cari konten</span><span><b>3</b>Tarik kartu</span><span><b>4</b>Lepas ke hari</span></div>
        <div className="content365-workbench">
          <div className="content365-calendar-panel">
            <div className="content365-range-toolbar">
              <button type="button" onClick={() => openContent365Page(content365Page - 1)} disabled={content365Page === 0} aria-label="Bagian sebelumnya">‹</button>
              <label><span>BAGIAN KONTEN</span><select value={content365Page} onChange={(event) => openContent365Page(Number(event.target.value))}>{Array.from({ length: content365PageCount }, (_, pageIndex) => { const start = pageIndex * 30 + 1; const end = Math.min(content365Duration, start + 29); return <option key={pageIndex} value={pageIndex}>Bagian {pageIndex + 1} · Hari {start}–{end}</option>; })}</select></label>
              <button type="button" onClick={() => openContent365Page(content365Page + 1)} disabled={content365Page === content365PageCount - 1} aria-label="Bagian berikutnya">›</button>
            </div>
            <div className="content365-filter" aria-label="Filter kalender Konten 365">
              {(["ALL", "EMPTY", "ACTIVE", "DRAFT", "PAUSED"] as Content365Filter[]).map((filter) => <button type="button" key={filter} className={content365Filter === filter ? "active" : ""} onClick={() => setContent365Filter(filter)}>{filter === "ALL" ? "Semua" : filter === "EMPTY" ? "Kosong" : filter === "ACTIVE" ? "Aktif" : filter === "DRAFT" ? "Draft" : "Dijeda"}</button>)}
            </div>
            <p className="content365-range-caption">Tersedia {content365RangeDays.length} kotak Hari {content365RangeStart}–{content365RangeEnd}. Isi, pindahkan, atau timpa konten langsung dengan drag and drop.</p>
            <div className="content365-day-grid">
              {content365RangeDays.map((dayNumber) => {
                const item = content365ItemsByDay.get(dayNumber);
                return <button
                  type="button"
                  key={dayNumber}
                  draggable={Boolean(item)}
                  className={`content365-day ${item ? item.status.toLowerCase() : "empty"} ${content365SelectedDay === dayNumber ? "selected" : ""} ${content365Settings?.current_day === dayNumber ? "current" : ""} ${content365DropDay === dayNumber ? "drop-target" : ""} ${filteredContent365Days.includes(dayNumber) ? "" : "filter-mismatch"}`}
                  onClick={() => chooseContent365Day(dayNumber)}
                  onDragStart={(event) => {
                    if (!item || !window.matchMedia("(min-width: 900px)").matches) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData("application/x-content365-post", item.source_post_id);
                    event.dataTransfer.setData("application/x-content365-origin", "calendar");
                    event.dataTransfer.effectAllowed = "move";
                    setContent365DraggingPostId(item.source_post_id);
                    setContent365DraggingOrigin("calendar");
                  }}
                  onDragOver={(event) => {
                    if (!content365DraggingPostId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setContent365DropDay(dayNumber);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setContent365DropDay(null);
                  }}
                  onDrop={(event) => void dropContent365Post(event, dayNumber)}
                  onDragEnd={() => { setContent365DraggingPostId(null); setContent365DraggingOrigin(null); setContent365DropDay(null); setContent365LibraryDropActive(false); }}
                  title={item ? `${content365SourceTitle(item.source_post_id)} · seret ke kotak lain untuk memindahkan, atau ke kanan untuk membatalkan` : `Kotak kosong Hari ${dayNumber}`}
                ><span>HARI</span><strong>{dayNumber}</strong><em>{item ? content365SourceTitle(item.source_post_id) : "KOTAK KOSONG"}</em><small>{item ? item.status === "ACTIVE" ? "Aktif" : item.status === "DRAFT" ? "Draft" : "Dijeda" : "Tarik ke sini"}</small></button>;
              })}
            </div>
            {!filteredContent365Days.length ? <p className="catalog-empty content365-filter-empty">Tidak ada hari dengan status ini pada bagian tersebut.</p> : null}
            {content365ItemsByDay.get(content365SelectedDay) ? <div className="content365-selected-slot">
              <div><span>HARI {content365SelectedDay}</span><strong>{content365SourceTitle(content365ItemsByDay.get(content365SelectedDay)!.source_post_id)}</strong></div>
              <label><span>Status</span><select value={content365ItemsByDay.get(content365SelectedDay)!.status} disabled={content365Busy === "day"} onChange={(event) => void assignContent365Post(content365SelectedDay, content365ItemsByDay.get(content365SelectedDay)!.source_post_id, event.target.value as Content365Item["status"])}><option value="ACTIVE">Aktif</option><option value="DRAFT">Draft</option><option value="PAUSED">Dijeda</option></select></label>
            </div> : null}
          </div>
          <aside
            className={`content365-library ${content365DraggingOrigin === "calendar" ? "accepting-return" : ""} ${content365LibraryDropActive ? "return-target" : ""}`}
            aria-label="Daftar konten yang belum masuk kalender"
            onDragOver={(event) => {
              const origin = event.dataTransfer.getData("application/x-content365-origin") || content365DraggingOrigin;
              if (origin !== "calendar") return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setContent365LibraryDropActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setContent365LibraryDropActive(false);
            }}
            onDrop={(event) => void dropContent365ToLibrary(event)}
          >
            <div className="content365-library-title"><div><span>RIWAYAT KONTEN</span><strong>Konten Tersedia</strong></div><b>{availableContent365SourcePosts.length} TERSEDIA</b></div>
            <div className="content365-return-zone"><b>Lepaskan di kanan untuk batalkan</b><span>Slot hari akan kosong, konten kembali ke daftar ini.</span></div>
            <label className="content365-library-search"><span>Cari judul konten</span><input type="search" value={content365SourceSearch} onChange={(event) => setContent365SourceSearch(event.target.value)} placeholder="Cari EPS, judul, atau status..." /></label>
            <p className="content365-library-help">Desktop: tarik kartu ke hari di panel kiri. HP: pilih hari, lalu tekan tombol Masukkan.</p>
            <div className="content365-source-list">
              {availableContent365SourcePosts.map((post) => <article
                className={`content365-source-card ${content365DraggingPostId === post.id ? "dragging" : ""}`}
                key={post.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-content365-post", post.id);
                  event.dataTransfer.setData("application/x-content365-origin", "library");
                  event.dataTransfer.effectAllowed = "move";
                  setContent365DraggingPostId(post.id);
                  setContent365DraggingOrigin("library");
                }}
                onDragEnd={() => { setContent365DraggingPostId(null); setContent365DraggingOrigin(null); setContent365DropDay(null); setContent365LibraryDropActive(false); }}
              >
                <i aria-hidden="true">⋮⋮</i>
                <div><strong>{content365SourceTitle(post.id)}</strong><span>{postStatusLabel(post.status)} · {formatPostTime(post.published_at ?? post.scheduled_at ?? post.created_at)}</span></div>
                <div className="content365-source-actions">
                  <b className={`post-status status-${post.status.toLowerCase()}`}>{postStatusLabel(post.status)}</b>
                  {["DRAFT", "SCHEDULED"].includes(post.status)
                    ? <button type="button" className="secondary" onClick={() => void beginEditChannelPost(post.id)} disabled={postBusy || Boolean(content365Busy)}>Edit</button>
                    : <button type="button" className="secondary" onClick={() => void beginReuseChannelPost(post.id)} disabled={postBusy || Boolean(content365Busy)}>Gunakan Lagi</button>}
                  <button type="button" className="danger" onClick={() => void deleteChannelPost(post)} disabled={postBusy || Boolean(content365Busy)}>{content365Busy === `delete:${post.id}` ? "Menghapus..." : "Hapus"}</button>
                  <button type="button" className="content365-mobile-assign" onClick={() => void assignContent365Post(content365SelectedDay, post.id, "ACTIVE")} disabled={content365Busy === "day"}>Masukkan → Hari {content365SelectedDay}</button>
                </div>
              </article>)}
              {!availableContent365SourcePosts.length ? <p className="catalog-empty">{normalizedContent365SourceSearch ? "Konten tidak ditemukan." : "Semua konten sudah masuk kalender. Cakep, tidak ada yang tercecer."}</p> : null}
            </div>
          </aside>
        </div>
      </section>

      <section id="riwayat-365" className="content365-card" hidden={activeWorkspace !== "content" || activeWorkspaceSection.content !== "riwayat-365"} aria-labelledby="content365-history-title">
        <div className="content365-heading"><div><p className="eyebrow">LOG PENGIRIMAN</p><h2 id="content365-history-title">Riwayat Konten Harian</h2><p>Daftar 50 proses terbaru, termasuk jadwal, hasil kirim, dan alasan jika gagal.</p></div><button className="button secondary" type="button" onClick={() => refreshContent365(true)} disabled={content365Busy === "refresh"}>{content365Busy === "refresh" ? "Memuat..." : "Segarkan"}</button></div>
        {content365Message ? <p className={`integration-result ${content365Message.type}`}>{content365Message.text}</p> : null}
        <div className="content365-history-list">
          {content365Runs.map((run) => <article key={run.id}><div className="content365-history-day"><span>HARI</span><strong>{run.day_number}</strong></div><div><strong>{content365SourceTitle(run.source_post_id)}</strong><span>Dijadwalkan {formatPostTime(run.scheduled_for)}{run.sent_at ? ` · terkirim ${formatPostTime(run.sent_at)}` : ""}</span>{run.error_code ? <small>{run.error_code}</small> : null}</div><b className={`post-status status-${run.status.toLowerCase()}`}>{run.status === "SENT" ? "TERKIRIM" : run.status === "QUEUED" ? "ANTRE" : run.status === "FAILED" ? "GAGAL" : "BATAL"}</b></article>)}
          {!content365Runs.length ? <p className="catalog-empty">Belum ada pengiriman dari Konten 365.</p> : null}
        </div>
      </section>

      <section className="metric-grid" hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "kesehatan-sistem"} aria-label="Kesehatan antrean job">
        {health.map((item) => <article className="metric" key={item.status}><span>{item.status}</span><strong>{item.job_count} job</strong></article>)}
        {!health.length ? <article className="metric empty"><span>JOB QUEUE</span><strong>Bersih. Belum ada antrean.</strong></article> : null}
      </section>
      {activeWorkspace === "settings" && activeWorkspaceSection.settings === "kesehatan-sistem" ? <>{launchReadinessPanel}{systemHealthPanel}{incidentAlertsPanel}{failureCenterPanel}{emergencyControlsPanel}</> : null}
      <section id="pengaturan-admin" className="admin-access-card" hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "pengaturan-admin"} aria-labelledby="gate-3i-title">
        <div className="admin-access-heading">
          <div><p className="eyebrow">SECURITY / GATE 3I</p><h2 id="gate-3i-title">Admin & Hak Akses</h2><p>Undang petugas pembayaran tanpa menyerahkan kunci kerajaan. Mereka hanya melihat order, bukti, dan laporan.</p></div>
          <strong className="owner-seal">OWNER</strong>
        </div>
        <form className="admin-invite-form" onSubmit={invitePaymentAdmin}>
          <label className="field"><span>Nama Admin</span><input value={adminInviteName} onChange={(event) => setAdminInviteName(event.target.value)} minLength={2} maxLength={100} placeholder="Contoh: Admin Rani" required /></label>
          <label className="field"><span>Email Admin</span><input type="email" value={adminInviteEmail} onChange={(event) => setAdminInviteEmail(event.target.value)} maxLength={254} placeholder="admin@email.com" required /></label>
          <button className="button" type="submit" disabled={adminAccessBusy === "invite"}>{adminAccessBusy === "invite" ? "Mengundang..." : "Undang Admin"}</button>
        </form>
        <div className="permission-grid"><article><strong>BOLEH</strong><span>Laporan, order, bukti TF, ACC/tolak, lunas manual.</span></article><article className="blocked"><strong>DIKUNCI</strong><span>Rekening, checkout, broadcast, bot, worker, dan kelola admin.</span></article></div>
        {adminAccessMessage ? <p className={`integration-result ${adminAccessMessage.type}`}>{adminAccessMessage.text}</p> : null}
        <div className="admin-profile-list">
          {adminProfiles.map((admin) => <article className="admin-profile-row" key={admin.auth_user_id}><div><strong>{admin.display_name || admin.email}</strong><span>{admin.email} · {admin.role === "SUPER_ADMIN" ? "OWNER" : "ADMIN PEMBAYARAN"}</span></div><div>{admin.role === "SUPER_ADMIN" ? <b className="post-status status-active">AKTIF</b> : <button type="button" className={`status-toggle ${admin.status === "ACTIVE" ? "active" : ""}`} disabled={adminAccessBusy === admin.auth_user_id} onClick={() => togglePaymentAdmin(admin)}>{adminAccessBusy === admin.auth_user_id ? "..." : admin.status === "ACTIVE" ? "NONAKTIFKAN" : "AKTIFKAN"}</button>}</div></article>)}
        </div>
      </section>
      {activeWorkspace === "settings" && activeWorkspaceSection.settings === "kesehatan-sistem" ? <>{activityPanel}{backupPanel}</> : null}
      <section id="pesanan-pembayaran" className="sales-card" hidden={activeWorkspace !== "orders" || activeWorkspaceSection.orders !== "pesanan-pembayaran"} aria-labelledby="gate-3f-title">
        <div className="sales-heading">
          <div>
            <p className="eyebrow">COMMERCE / GATE 3F</p>
            <h2 id="gate-3f-title">Laporan Penjualan</h2>
            <p>Satu produk, angka terang. Omzet hanya menghitung pesanan berstatus LUNAS.</p>
          </div>
          <div className="sales-tools">
            <label className="field"><span>Periode order</span><select value={salesPeriod} onChange={(event) => { setSalesPeriod(event.target.value as SalesPeriod); setOrderPage(1); setOrderControlId(null); }}><option value="TODAY">Hari ini</option><option value="7D">7 hari</option><option value="30D">30 hari</option><option value="ALL">Semua waktu</option></select></label>
          </div>
        </div>
        {salesReportBusy ? <p className="sales-loading">Menghitung transaksi...</p> : null}
        {salesReportError ? <p className="integration-result error">{salesReportError}</p> : null}
        {orderMessage ? <p className={`integration-result ${orderMessage.type}`}>{orderMessage.text}</p> : null}
        {salesReport ? <>
          <div className="sales-kpis">
            <article className="sales-kpi revenue"><span>OMZET LUNAS</span><strong>{formatRupiah(salesReport.summary.revenue_idr)}</strong><small>{salesReport.summary.paid_orders} pembayaran masuk</small></article>
            <article className="sales-kpi"><span>TOTAL ORDER</span><strong>{salesReport.summary.total_orders}</strong><small>{salesReport.summary.conversion_rate}% jadi lunas</small></article>
            <article className="sales-kpi warn"><span>BELUM TRANSFER</span><strong>{salesReport.summary.pending_payment}</strong><small>Masih difollow-up</small></article>
            <article className="sales-kpi review"><span>CEK BUKTI</span><strong>{salesReport.summary.pending_verification}</strong><small>Butuh keputusan Admin</small></article>
          </div>
          <div className="sales-command-bar">
            <label className="sales-order-search"><span aria-hidden="true">⌕</span><input value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(1); setOrderControlId(null); }} placeholder="Cari nomor order, produk, pembeli, atau status..." aria-label="Cari pesanan" /></label>
            <button className={orderManualOpen ? "sales-command-button active" : "sales-command-button"} type="button" onClick={() => setOrderManualOpen((current) => !current)} aria-expanded={orderManualOpen} aria-controls="order-manual-inline"><span>＋</span>{orderManualOpen ? "Tutup Checkout" : "Checkout Manual"}</button>
            <button className="sales-command-button export" type="button" onClick={downloadSalesCsv} disabled={!salesReport.orders.length || salesReportBusy}><span>⇩</span>Export CSV</button>
          </div>
          {orderManualOpen ? <div id="order-manual-inline" className="order-manual-inline">
            <div className="order-manual-inline-heading"><div><strong>Checkout Manual</strong><span>Buat pesanan dari admin untuk member yang sudah terdaftar.</span></div><button type="button" onClick={() => setOrderManualOpen(false)} aria-label="Tutup checkout manual">×</button></div>
            <form onSubmit={createPendingOrder}>
              <label className="field"><span>Calon pembeli</span><select value={orderUserId} onChange={(event) => setOrderUserId(event.target.value)} required><option value="">Pilih member</option>{memberStatuses.filter((member) => member.contact_status === "CONTACTABLE").map((member) => <option key={member.id} value={member.id}>{member.username ? `@${member.username}` : member.first_name ?? String(member.telegram_user_id)}</option>)}</select></label>
              <label className="field"><span>Produk</span><input value={orderProductLabel} onChange={(event) => setOrderProductLabel(event.target.value)} maxLength={160} required /></label>
              <label className="field"><span>Nominal transfer</span><div className="input-suffix"><input type="number" min={0} step={1000} value={orderAmount} onChange={(event) => setOrderAmount(Number(event.target.value))} required /><b>RUPIAH</b></div></label>
              <button className="button" type="submit" disabled={Boolean(orderBusy)}>{orderBusy === "create" ? "Membuat..." : "Buat Pesanan"}</button>
            </form>
            <small>Order baru berstatus Pending dan follow-up pembayaran langsung berjalan.</small>
          </div> : null}
          <div className="sales-table-wrap">
            <div className="order-table-toolbar">
              <label>
                <span>Tampilkan</span>
                <select value={orderPageSize} onChange={(event) => { setOrderPageSize(Number(event.target.value) as 10 | 50 | 100 | 200); setOrderPage(1); setOrderControlId(null); }} aria-label="Jumlah pesanan per halaman">
                  <option value={10}>10</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option>
                </select>
                <span>data</span>
              </label>
              <small>{filteredSalesOrders.length ? `${(currentOrderPage - 1) * orderPageSize + 1}–${Math.min(currentOrderPage * orderPageSize, filteredSalesOrders.length)} dari ${filteredSalesOrders.length}${normalizedOrderSearch ? ` hasil · ${salesReport.orders.length} total` : ""}` : normalizedOrderSearch ? "Tidak ditemukan" : "0 data"}</small>
            </div>
            <table className="sales-table">
              <thead><tr><th>NO.</th><th>ORDER</th><th>PEMBELI</th><th>NOMINAL</th><th>STATUS</th><th>AKSES</th><th>WAKTU</th><th>AKSI</th></tr></thead>
              <tbody>{visibleSalesOrders.map((order, orderIndex) => {
                const detailedOrder = purchaseOrders.find((item) => item.id === order.id);
                const proof = detailedOrder ? currentPaymentProof(detailedOrder) : null;
                const proofUrl = proof ? proofUrls[proof.id] : null;
                return <Fragment key={order.id}>
                  <tr className={orderControlId === order.id ? "order-table-row is-open" : "order-table-row"}>
                    <td className="order-sequence"><strong>{(currentOrderPage - 1) * orderPageSize + orderIndex + 1}</strong></td>
                    <td><strong>{order.order_number}</strong><span>{order.product_label}</span></td>
                    <td><strong>{order.username ? `@${order.username}` : order.first_name ?? "Tanpa nama"}</strong><span>ID {order.telegram_user_id}</span></td>
                    <td><strong>{formatRupiah(order.amount_idr)}</strong></td>
                    <td><b className={`post-status status-${order.status.toLowerCase()}`}>{order.status === "PAID" ? "LUNAS" : order.status === "PENDING_PAYMENT" ? "BELUM TF" : order.status === "PENDING_VERIFICATION" ? "CEK BUKTI" : order.status === "CANCELLED" ? "BATAL" : order.status}</b></td>
                    <td><strong>{order.access_delivery_status === "SENT" ? "TERKIRIM" : order.access_delivery_status}</strong></td>
                    <td><strong>{formatPostTime(order.created_at)}</strong>{order.paid_at ? <span>Lunas {formatPostTime(order.paid_at)}</span> : null}</td>
                    <td><button type="button" className="order-manage-toggle" disabled={Boolean(orderBusy) || !detailedOrder} onClick={() => setOrderControlId((current) => current === order.id ? null : order.id)}>{orderControlId === order.id ? "Tutup" : "Kelola"}</button></td>
                  </tr>
                  {orderControlId === order.id && detailedOrder ? <tr className="order-table-control-row"><td colSpan={8}>
                    <div className="order-control-panel">
                      <div className="order-status-control"><strong>Ubah status order</strong><span>Satu tempat untuk koreksi Pending, Batal, atau Lunas.</span><div>
                        <button type="button" disabled={Boolean(orderBusy) || detailedOrder.status === "PENDING_PAYMENT"} onClick={() => changeOrderStatus(detailedOrder, "PENDING_PAYMENT")}>Pending</button>
                        <button type="button" disabled={Boolean(orderBusy) || detailedOrder.status === "CANCELLED"} onClick={() => changeOrderStatus(detailedOrder, "CANCELLED")}>Batal</button>
                        <button type="button" className="primary" disabled={Boolean(orderBusy) || detailedOrder.status === "PAID"} onClick={() => changeOrderStatus(detailedOrder, "PAID")}>{orderBusy === `status:${detailedOrder.id}` ? "Memproses..." : "Lunas"}</button>
                      </div></div>
                      {profile.role === "SUPER_ADMIN" ? detailedOrder.is_test ? <div className="order-delete-control"><strong>Hapus order uji</strong><p>Order, bukti, antrean, dan laporan akan dihapus permanen. Log penghapusan tetap disimpan.</p><label className="field"><span>Ketik {detailedOrder.order_number}</span><input value={orderDeleteConfirmations[detailedOrder.id] ?? ""} onChange={(event) => setOrderDeleteConfirmations((current) => ({ ...current, [detailedOrder.id]: event.target.value }))} placeholder={detailedOrder.order_number} autoComplete="off" /></label><button type="button" className="button danger" disabled={Boolean(orderBusy) || orderDeleteConfirmations[detailedOrder.id]?.trim() !== detailedOrder.order_number} onClick={() => deleteOrder(detailedOrder)}>{orderBusy === `delete:${detailedOrder.id}` ? "Menghapus..." : "Hapus Order"}</button></div> : <div className="order-real-lock"><strong>Order pembeli asli</strong><span>Data tidak dapat dihapus. Gunakan perubahan status untuk koreksi.</span></div> : null}
                    </div>
                    {detailedOrder.status === "PENDING_VERIFICATION" && proof ? <div className="payment-proof-review order-table-proof">
                      <div className="payment-proof-meta"><strong>BUKTI #{proof.revision}</strong><span>{proof.mime_type.replace("application/", "").replace("image/", "").toUpperCase()} · {(proof.file_size / 1024).toFixed(0)} KB · {formatPostTime(proof.submitted_at)}</span></div>
                      {!proofUrl ? <button className="button secondary" type="button" disabled={orderBusy === `proof:${proof.id}`} onClick={() => loadPaymentProof(proof)}>{orderBusy === `proof:${proof.id}` ? "Membuka..." : "Lihat Bukti"}</button> : proof.mime_type === "application/pdf" ? <a className="button secondary" href={proofUrl} target="_blank" rel="noreferrer">Buka PDF</a> : <img className="payment-proof-image" src={proofUrl} alt={`Bukti transfer ${detailedOrder.order_number}`} />}
                      <label className="field"><span>Alasan jika ditolak</span><input value={proofRejectionReasons[proof.id] ?? ""} onChange={(event) => setProofRejectionReasons((current) => ({ ...current, [proof.id]: event.target.value }))} maxLength={500} placeholder="Nominal tidak sesuai atau bukti buram" /></label>
                      <div className="payment-proof-actions"><button type="button" className="button danger" disabled={orderBusy === `review:${proof.id}`} onClick={() => reviewPaymentProof(detailedOrder, "REJECT")}>Tolak Bukti</button><button type="button" className="button" disabled={orderBusy === `review:${proof.id}`} onClick={() => reviewPaymentProof(detailedOrder, "APPROVE")}>{orderBusy === `review:${proof.id}` ? "Memproses..." : "ACC & Kirim Akses"}</button></div>
                    </div> : null}
                  </td></tr> : null}
                </Fragment>;
              })}</tbody>
            </table>
            {!filteredSalesOrders.length ? <p className="catalog-empty">{normalizedOrderSearch ? "Pesanan yang dicari tidak ditemukan." : "Belum ada transaksi pada periode ini."}</p> : null}
            {filteredSalesOrders.length ? <nav className="order-pagination" aria-label="Halaman pesanan">
              <button type="button" onClick={() => setOrderPage(1)} disabled={currentOrderPage === 1} aria-label="Halaman pertama">«</button>
              <button type="button" onClick={() => setOrderPage(Math.max(1, currentOrderPage - 1))} disabled={currentOrderPage === 1}>‹</button>
              <span>Halaman <strong>{currentOrderPage}</strong> / {orderTotalPages}</span>
              <button type="button" onClick={() => setOrderPage(Math.min(orderTotalPages, currentOrderPage + 1))} disabled={currentOrderPage === orderTotalPages}>›</button>
              <button type="button" onClick={() => setOrderPage(orderTotalPages)} disabled={currentOrderPage === orderTotalPages} aria-label="Halaman terakhir">»</button>
            </nav> : null}
          </div>
          {filteredSalesOrders.length > orderPageSize ? <p className="form-note">Gunakan halaman di bawah tabel atau Export CSV untuk melihat seluruh transaksi.</p> : null}
        </> : null}
      </section>
      <section id="onboarding-member" className="catalog-card" hidden={activeWorkspace !== "members" || activeWorkspaceSection.members !== "onboarding-member"} aria-labelledby="gate-2b-title">
        <div className="catalog-heading">
          <div>
            <p className="eyebrow">TELEGRAM / GATE 2B BARU</p>
            <h2 id="gate-2b-title">Onboarding Member</h2>
            <p>Atur pintu masuk bot: tekan START, gabung Channel + Grup, lalu cek keanggotaan.</p>
          </div>
          <div className="catalog-counts">
            <strong>{memberStatuses.filter((item) => item.onboarding_status === "ACTIVE").length}</strong><span>AKSES AKTIF</span>
            <strong>{memberStatuses.filter((item) => item.onboarding_status !== "ACTIVE").length}</strong><span>BELUM LENGKAP</span>
          </div>
        </div>

        <div className="onboarding-flow" aria-label="Alur onboarding member">
          <article><span>01</span><strong>START BOT</strong><p>Bot menyimpan akun Telegram.</p></article>
          <article><span>02</span><strong>JOIN 2 TEMPAT</strong><p>Channel dan Grup Diskusi.</p></article>
          <article><span>03</span><strong>CEK MEMBER</strong><p>Status diverifikasi ke Telegram.</p></article>
          <article><span>04</span><strong>AKSES AKTIF</strong><p>Siap menerima materi japri.</p></article>
        </div>

        <div className="onboarding-form">
          <div className="form-title"><span>BOT</span><h3>Redaksi Start Dipusatkan</h3></div>
          <p className="form-note">Pesan dan seluruh tombol yang muncul setelah orang menekan Start sekarang dikelola dari Pengaturan → Notifikasi.</p>
          <button className="button" type="button" onClick={() => openWorkspace("settings", "notifikasi-admin")}>Buka Notifikasi</button>
        </div>
      </section>
      <section id="daftar-member" className="audience-card" hidden={activeWorkspace !== "members" || activeWorkspaceSection.members !== "daftar-member"} aria-labelledby="gate-3a-title">
        <div className="audience-heading">
          <div>
            <p className="eyebrow">AUDIENCE / GATE 3A</p>
            <h2 id="gate-3a-title">Member & Audience</h2>
            <p>Lihat siapa yang sudah START, lolos syarat join, pernah meminta materi, atau tidak bisa lagi dijapri.</p>
          </div>
          <div className="audience-counts">
            <article><strong>{memberStatuses.length}</strong><span>TOTAL START</span></article>
            <article><strong>{memberStatuses.filter((member) => member.onboarding_status === "ACTIVE").length}</strong><span>AKSES AKTIF</span></article>
            <article><strong>{memberStatuses.filter((member) => member.contact_status === "CONTACTABLE").length}</strong><span>BISA DIJAPRI</span></article>
            <article><strong>{memberStatuses.filter((member) => (claimCountByUser[member.id] ?? 0) > 0).length}</strong><span>PERNAH KLAIM</span></article>
          </div>
        </div>
        <div className="audience-toolbar">
          <label className="field"><span>Cari member</span><input value={audienceSearch} onChange={(event) => setAudienceSearch(event.target.value)} placeholder="Nama, @username, atau Telegram ID" /></label>
          <label className="field"><span>Segmentasi</span><select value={audienceSegment} onChange={(event) => setAudienceSegment(event.target.value as AudienceSegment)}><option value="ALL">Semua member</option><option value="ACTIVE">Akses aktif</option><option value="PENDING">Join belum lengkap</option><option value="CONTACTABLE">Bisa dijapri</option><option value="BLOCKED">Bot diblokir / chat hilang</option><option value="CLAIMED">Pernah klaim materi</option><option value="NEVER_CLAIMED">Belum pernah klaim</option></select></label>
        </div>
        <div className="audience-table-wrap">
          <table className="audience-table">
            <thead><tr><th>MEMBER</th><th>SYARAT JOIN</th><th>JAPRI</th><th>BROADCAST</th><th>KLAIM</th><th>AKTIVITAS</th></tr></thead>
            <tbody>{filteredMembers.map((member) => {
              const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || "Tanpa nama";
              const joinedBoth = member.onboarding_status === "ACTIVE";
              const broadcastPreference = broadcastPreferences.find((item) => item.user_id === member.id);
              const broadcastSubscribed = broadcastPreference?.subscribed !== false;
              return <tr key={member.id}>
                <td><strong>{displayName}</strong><span>{member.username ? `@${member.username}` : `ID ${member.telegram_user_id}`}</span></td>
                <td><b className={joinedBoth ? "audience-badge good" : "audience-badge warn"}>{joinedBoth ? "LENGKAP" : "BELUM"}</b><small>Channel: {member.channel_member_status} · Grup: {member.discussion_member_status}</small></td>
                <td><b className={member.contact_status === "CONTACTABLE" ? "audience-badge good" : "audience-badge bad"}>{member.contact_status === "CONTACTABLE" ? "AKTIF" : member.contact_status}</b></td>
                <td>{broadcastSubscribed
                  ? <b className="audience-badge good">AKTIF</b>
                  : <div className="broadcast-member-action"><b className="audience-badge bad">BERHENTI</b><button type="button" onClick={() => resubscribeBroadcast(member.id)} disabled={broadcastResubscribeBusy === member.id}>{broadcastResubscribeBusy === member.id ? "Mengaktifkan..." : "AKTIFKAN BC"}</button></div>}</td>
                <td><strong>{claimCountByUser[member.id] ?? 0}×</strong></td>
                <td><strong>{formatMemberTime(member.last_seen_at)}</strong><span>Mulai {formatMemberTime(member.first_seen_at)}</span></td>
              </tr>;
            })}</tbody>
          </table>
          {!filteredMembers.length ? <p className="catalog-empty">Tidak ada member di segmen ini.</p> : null}
        </div>
        <p className="form-note audience-note">Gunakan segmen ini untuk membaca kondisi member. Pengiriman massal dilakukan dari panel Gate 3B di bawah dengan batas kecepatan.</p>
      </section>
      <section id="kirim-broadcast" className="broadcast-card" hidden={activeWorkspace !== "content" || activeWorkspaceSection.content !== "kirim-broadcast"} aria-labelledby="gate-3b-title">
        <div className="broadcast-heading">
          <div>
            <p className="eyebrow">MESSAGE / GATE 3B</p>
            <h2 id="gate-3b-title">Broadcast & Follow-Up</h2>
            <p>Pilih segmen, susun bubble, lalu kirim bertahap. Penerima hanya melihat isi broadcast dan tombol penawaran yang Teh buat.</p>
          </div>
          <div className="broadcast-counts">
            <article><strong>{broadcastCampaigns.length}</strong><span>KAMPANYE</span></article>
            <article><strong>{broadcastCampaigns.reduce((total, campaign) => total + campaign.sent_recipients, 0)}</strong><span>TERKIRIM</span></article>
            <article><strong>{broadcastOptOutCount}</strong><span>BERHENTI</span></article>
          </div>
        </div>

        <form className="broadcast-form" onSubmit={createBroadcastCampaign}>
          <div className="broadcast-preview-count"><span>PERKIRAAN PENERIMA</span><strong>{Math.max(0, estimatedBroadcastRecipients - broadcastOptOutCount)}</strong><small>Jumlah final dihitung lagi saat disimpan; akun lama yang pernah opt-out dan akun tak bisa dijapri otomatis dicoret.</small></div>
          <div className="split-fields">
            <label className="field"><span>Nama kampanye</span><input value={broadcastName} onChange={(event) => setBroadcastName(event.target.value)} maxLength={100} required /></label>
            <label className="field"><span>Segmen penerima</span><select value={broadcastSegment} onChange={(event) => setBroadcastSegment(event.target.value as BroadcastSegment)}><option value="ALL">Semua yang bisa dijapri</option><option value="ACTIVE">Akses aktif</option><option value="PENDING">Join belum lengkap</option><option value="CLAIMED">Pernah klaim materi</option><option value="NEVER_CLAIMED">Belum pernah klaim</option></select></label>
          </div>
          <label className="field"><span>Isi broadcast / bubble</span><textarea className="broadcast-parts" value={broadcastParts} onChange={(event) => setBroadcastParts(event.target.value)} placeholder={"Bubble pertama\n---\nBubble kedua\n---\nBubble penutup"} required /></label>
          <p className="form-note">Pisahkan bubble dengan baris <strong>---</strong>. Personalisasi: {"{name}"}, {"{full_name}"}, {"{username}"}, atau {"{telegram_id}"}. Maksimal 10 bubble.</p>
          <div className="split-fields">
            <label className="field"><span>Media (opsional)</span><select value={broadcastMediaType} onChange={(event) => setBroadcastMediaType(event.target.value as BroadcastMediaType)}><option value="NONE">Tanpa media</option><option value="PHOTO">Gambar</option><option value="VIDEO">Video</option></select></label>
            {broadcastMediaType !== "NONE" ? <label className="field"><span>URL publik {broadcastMediaType === "PHOTO" ? "gambar" : "video"}</span><input type="url" value={broadcastMediaUrl} onChange={(event) => setBroadcastMediaUrl(event.target.value)} placeholder="https://..." inputMode="url" required /></label> : null}
          </div>
          {broadcastMediaType !== "NONE" ? <p className="form-note">Media dikirim lebih dulu, lalu bubble teks. Gunakan link HTTPS yang bisa diakses publik tanpa login.</p> : null}
          <div className="split-fields">
            <label className="field"><span>Teks tombol penawaran (opsional)</span><input value={broadcastButtonText} onChange={(event) => setBroadcastButtonText(event.target.value)} maxLength={64} placeholder="BELI SEKARANG" /></label>
            <label className="field"><span>Link tombol penawaran</span><input value={broadcastButtonUrl} onChange={(event) => setBroadcastButtonUrl(event.target.value)} placeholder="https://t.me/..." inputMode="url" /></label>
          </div>
          <label className="field"><span>Jeda antar penerima</span><div className="input-suffix"><input type="number" min={10} max={60} step={1} value={broadcastInterval} onChange={(event) => setBroadcastInterval(Number(event.target.value))} required /><b>DETIK</b></div></label>
          <div className="split-fields">
            <label className="field"><span>Aksi</span><select value={broadcastAction} onChange={(event) => setBroadcastAction(event.target.value as typeof broadcastAction)}><option value="SCHEDULE">Jadwalkan</option><option value="NOW">Kirim Sekarang</option></select></label>
            {broadcastAction === "SCHEDULE" ? <label className="field"><span>Tanggal & jam</span><input type="datetime-local" value={broadcastSchedule} onChange={(event) => setBroadcastSchedule(event.target.value)} required /></label> : <div className="action-note broadcast-now"><strong>KIRIM BERTAHAP</strong><span>Penerima dikunci saat tombol ditekan.</span></div>}
          </div>
          <div className="broadcast-guard"><strong>Kontrol dari Admin</strong><span>Broadcast bisa dihentikan dari Admin. Tidak ada tombol STOP atau berhenti berlangganan yang dikirim kepada penerima.</span></div>
          <button className="button" type="submit" disabled={broadcastBusy}>{broadcastBusy ? "Mengunci penerima..." : broadcastAction === "NOW" ? "Kirim Broadcast" : "Simpan Jadwal"}</button>
        </form>
        {broadcastMessage ? <p className={`integration-result ${broadcastMessage.type}`}>{broadcastMessage.text}</p> : null}

        <div className="broadcast-history">
          <p className="list-label">20 KAMPANYE TERBARU</p>
          <div className="post-stack">
            {broadcastCampaigns.map((campaign) => <article className="post-row" key={campaign.id}>
              <div><strong>{campaign.name}</strong><span>{campaign.audience_segment} · {formatPostTime(campaign.scheduled_at)} · {campaign.sent_recipients}/{campaign.total_recipients} terkirim · {campaign.failed_recipients} gagal · {campaign.skipped_recipients} dilewati</span></div>
              <b className={`post-status status-${campaign.status.toLowerCase()}`}>{campaign.status}</b>
            </article>)}
            {!broadcastCampaigns.length ? <p className="catalog-empty">Belum ada kampanye. Bagus—belum ada yang ditembaki pesan random.</p> : null}
          </div>
        </div>
      </section>
      <section id="channel-grup-produksi" className="follow-up-card production-destination-card" hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "channel-grup-produksi"} aria-labelledby="production-destination-title">
        <div className="follow-up-heading">
          <div>
            <p className="eyebrow">TELEGRAM / TUJUAN PRODUKSI</p>
            <h2 id="production-destination-title">Channel & Grup Produksi</h2>
            <p>Ganti rumah utama bot. Sistem memeriksa akses Admin dan hubungan Channel–Grup sebelum menyimpan.</p>
          </div>
          <span className="production-lock">DISIMPAN BERSAMA</span>
        </div>
        <form className="follow-up-form" onSubmit={saveProductionDestinations}>
          <div className="production-destination-grid">
            <article>
              <i aria-hidden="true">📣</i>
              <div><strong>Channel Produksi</strong><small>Tujuan posting konten dan syarat join member.</small></div>
              <label className="field"><span>Link atau @username Channel</span><input value={onboarding.channel_url} onChange={(event) => setOnboarding((current) => ({ ...current, channel_url: event.target.value }))} placeholder="https://t.me/pebisnisdigitalchannel" autoCapitalize="none" spellCheck={false} required /></label>
            </article>
            <article>
              <i aria-hidden="true">💬</i>
              <div><strong>Grup Produksi</strong><small>Tempat komentar keyword dan diskusi member.</small></div>
              <label className="field"><span>Link atau @username Grup</span><input value={onboarding.discussion_url} onChange={(event) => setOnboarding((current) => ({ ...current, discussion_url: event.target.value }))} placeholder="https://t.me/pebisnisdigitalgrup" autoCapitalize="none" spellCheck={false} required /></label>
            </article>
          </div>
          <div className="production-checklist"><span>✓ Bot wajib Admin di keduanya</span><span>✓ Grup wajib terhubung ke Channel</span><span>✓ Gunakan username publik</span></div>
          <div className="follow-up-actions"><span className="action-note"><strong>PINDAH TOTAL</strong><small>Posting, komentar, cek member, dan tombol join ikut berpindah.</small></span><button className="button" type="submit" disabled={productionDestinationBusy}>{productionDestinationBusy ? "Memeriksa Telegram..." : "Periksa & Simpan"}</button></div>
        </form>
        {productionDestinationMessage ? <p className={`integration-result ${productionDestinationMessage.type}`}>{productionDestinationMessage.text}</p> : null}
      </section>
      <section id="pengaturan-checkout" className="follow-up-card" hidden={activeWorkspace !== "settings" || !["pengaturan-checkout", "pembayaran", "batas-pembayaran", "notifikasi-admin"].includes(activeWorkspaceSection.settings)} aria-labelledby="gate-3d-title">
        <div className="follow-up-heading" hidden={activeWorkspaceSection.settings !== "pengaturan-checkout"}>
          <div>
            <p className="eyebrow">CHECKOUT / GATE 3D</p>
            <h2 id="gate-3d-title">Tombol BELI</h2>
            <p>Atur produk, harga utama, dan akses yang dikirim setelah pembayaran dinyatakan lunas.</p>
          </div>
          <div className="follow-up-counts">
            <article><strong>{checkoutSettings.enabled ? "ON" : "OFF"}</strong><span>CHECKOUT</span></article>
            <article><strong>{purchaseOrders.filter((item) => item.status === "PENDING_PAYMENT").length}</strong><span>MENUNGGU</span></article>
            <article><strong>{purchaseOrders.filter((item) => item.access_delivery_status === "SENT").length}</strong><span>AKSES</span></article>
          </div>
        </div>
        <form className="follow-up-form" hidden={activeWorkspaceSection.settings !== "pengaturan-checkout"} onSubmit={saveCheckoutSettings}>
          <div className="split-fields">
            <label className="field"><span>Status checkout</span><select value={checkoutSettings.enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setCheckoutSettings((current) => ({ ...current, enabled: event.target.value === "ACTIVE" }))}><option value="INACTIVE">Nonaktif — tombol disembunyikan</option><option value="ACTIVE">Aktif — terima pesanan</option></select></label>
            <label className="field"><span>Harga produk</span><div className="input-suffix"><input type="number" min={0} step={1000} value={checkoutSettings.amount_idr} onChange={(event) => setCheckoutSettings((current) => ({ ...current, amount_idr: Number(event.target.value) }))} required /><b>RUPIAH</b></div></label>
          </div>
          <label className="field"><span>Nama produk</span><input value={checkoutSettings.product_label} onChange={(event) => setCheckoutSettings((current) => ({ ...current, product_label: event.target.value }))} maxLength={160} required /></label>
          <label className="field"><span>Pesan akses setelah lunas</span><textarea value={checkoutSettings.access_text} onChange={(event) => setCheckoutSettings((current) => ({ ...current, access_text: event.target.value }))} maxLength={4000} required /></label>
          <div className="split-fields">
            <label className="field"><span>Teks tombol akses (opsional)</span><input value={checkoutSettings.access_button_text} onChange={(event) => setCheckoutSettings((current) => ({ ...current, access_button_text: event.target.value }))} maxLength={64} placeholder="BUKA MATERI" /></label>
            <label className="field"><span>Link akses produk</span><input value={checkoutSettings.access_button_url} onChange={(event) => setCheckoutSettings((current) => ({ ...current, access_button_url: event.target.value }))} placeholder="https://..." /></label>
          </div>
          <div className="follow-up-actions"><span className="action-note"><strong>ANTI DOBEL</strong><small>Satu member hanya boleh punya satu pesanan MENUNGGU TRANSFER.</small></span><button className="button" type="submit" disabled={checkoutBusy}>{checkoutBusy ? "Menyimpan..." : "Simpan Checkout"}</button></div>
        </form>
        {activeWorkspaceSection.settings === "pengaturan-checkout" && checkoutMessage ? <p className={`integration-result ${checkoutMessage.type}`}>{checkoutMessage.text}</p> : null}
        <div className="follow-up-heading" hidden={activeWorkspaceSection.settings !== "pembayaran"}>
          <div><p className="eyebrow">PEMBAYARAN</p><h2>Bank & BuatQris</h2><p>Terima transfer manual atau QRIS otomatis. Pembayaran BuatQris yang sukses langsung mengubah order menjadi lunas.</p></div>
          <div className="follow-up-counts"><article><strong>{checkoutSettings.manual_enabled ? "ON" : "OFF"}</strong><span>MANUAL</span></article><article><strong>{checkoutSettings.buatqris_enabled ? "ON" : "OFF"}</strong><span>BUATQRIS</span></article><article><strong>{checkoutSettings.coupon_enabled ? "ON" : "OFF"}</strong><span>KUPON</span></article></div>
        </div>
        <form id="pembayaran" className="follow-up-form payment-settings-form" hidden={activeWorkspaceSection.settings !== "pembayaran"} onSubmit={saveCheckoutSettings}>
          <section className="payment-setting-block">
            <div className="payment-setting-title"><span>🏦</span><div><strong>Rekening Manual</strong><small>Pembeli transfer sendiri dan mengirim bukti pembayaran.</small></div></div>
            <label className="field"><span>Status rekening manual</span><select value={checkoutSettings.manual_enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setCheckoutSettings((current) => ({ ...current, manual_enabled: event.target.value === "ACTIVE" }))}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></select></label>
            <div className="split-fields">
              <label className="field"><span>Bank / e-wallet</span><input value={checkoutSettings.bank_name} onChange={(event) => setCheckoutSettings((current) => ({ ...current, bank_name: event.target.value }))} maxLength={80} placeholder="BCA / BRI / DANA" /></label>
              <label className="field"><span>Nomor rekening</span><input value={checkoutSettings.account_number} onChange={(event) => setCheckoutSettings((current) => ({ ...current, account_number: event.target.value }))} maxLength={80} inputMode="numeric" /></label>
            </div>
            <label className="field"><span>Atas nama</span><input value={checkoutSettings.account_name} onChange={(event) => setCheckoutSettings((current) => ({ ...current, account_name: event.target.value }))} maxLength={120} /></label>
          </section>
          <section className="payment-setting-block">
            <div className="payment-setting-title"><span>▣</span><div><strong>BuatQris Otomatis</strong><small>QRIS dibuat untuk setiap order. Callback resmi mengubah status menjadi LUNAS dan mengirim akses.</small></div></div>
            <label className="field"><span>Status BuatQris</span><select value={checkoutSettings.buatqris_enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setCheckoutSettings((current) => ({ ...current, buatqris_enabled: event.target.value === "ACTIVE" }))}><option value="INACTIVE">Nonaktif</option><option value="ACTIVE">Aktif</option></select></label>
            <div className="split-fields">
              <label className="field"><span>Account ID</span><input value={checkoutSettings.buatqris_account_id} onChange={(event) => setCheckoutSettings((current) => ({ ...current, buatqris_account_id: event.target.value }))} maxLength={200} placeholder="user_..." autoCapitalize="none" spellCheck={false} /></label>
              <label className="field"><span>Mode QR yang dikirim bot</span><select value={checkoutSettings.buatqris_mode} onChange={(event) => setCheckoutSettings((current) => ({ ...current, buatqris_mode: event.target.value as "SANDBOX" | "LIVE" }))}><option value="SANDBOX">Sandbox — tampil MODE TEST</option><option value="LIVE">Live — pembayaran uang asli</option></select><small>Mengubah mode di dashboard BuatQris tidak otomatis mengubah bot. Pilih mode di sini lalu simpan.</small></label>
            </div>
            <div className="split-fields">
              <label className="field"><span>Metode QRIS</span><select value={checkoutSettings.buatqris_qris_method} onChange={(event) => setCheckoutSettings((current) => ({ ...current, buatqris_qris_method: event.target.value as CheckoutSettings["buatqris_qris_method"] }))}><option value="qris_one">QRIS 1</option><option value="qris_two">QRIS 2</option><option value="qris_three">QRIS 3</option><option value="qris_four">QRIS 4</option></select></label>
              <label className="field"><span>Nama brand pada bingkai QR</span><input value={checkoutSettings.buatqris_umkm_name} onChange={(event) => setCheckoutSettings((current) => ({ ...current, buatqris_umkm_name: event.target.value }))} maxLength={15} placeholder="PEBISNIS" /><small>Nama ini tampil pada QRIS yang dikirim bot. Nama produk, nominal, kode order, dan batas 14 menit ditambahkan otomatis.</small></label>
            </div>
            <label className="field"><span>Secret Token {checkoutSettings.buatqris_secret_token_configured ? "— sudah tersimpan" : ""}</span><input type="password" value={buatqrisSecretToken} onChange={(event) => setBuatqrisSecretToken(event.target.value)} autoComplete="new-password" placeholder={checkoutSettings.buatqris_secret_token_configured ? "Kosongkan jika tidak ingin mengganti" : "Tempel Secret Token dari Open API"} /></label>
            <label className="field"><span>Signing Secret {checkoutSettings.buatqris_signing_secret_configured ? "— sudah tersimpan" : ""}</span><input type="password" value={buatqrisSigningSecret} onChange={(event) => setBuatqrisSigningSecret(event.target.value)} autoComplete="new-password" placeholder={checkoutSettings.buatqris_signing_secret_configured ? "Kosongkan jika tidak ingin mengganti" : "Tempel Signing Secret dari bagian Webhook"} /></label>
            <div className="buatqris-callback"><span>Callback URL</span><code>https://hufndpzanstcsvqdixgp.supabase.co/functions/v1/buatqris-webhook</code><small>BuatQris menerima URL ini otomatis saat sistem membuat transaksi.</small></div>
            <p className="form-note">Secret Token dan Signing Secret dienkripsi, tidak ditampilkan lagi, dan tidak pernah dikirim ke browser pembeli.</p>
          </section>
          <section className="payment-setting-block">
            <div className="payment-setting-title"><span>🏷</span><div><strong>Kupon</strong><small>Satu kode promo aktif untuk mengurangi harga checkout.</small></div></div>
            <label className="field"><span>Status kupon</span><select value={checkoutSettings.coupon_enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setCheckoutSettings((current) => ({ ...current, coupon_enabled: event.target.value === "ACTIVE" }))}><option value="INACTIVE">Nonaktif</option><option value="ACTIVE">Aktif</option></select></label>
            <div className="split-fields">
              <label className="field"><span>Kode kupon</span><input value={checkoutSettings.coupon_code} onChange={(event) => setCheckoutSettings((current) => ({ ...current, coupon_code: event.target.value.toUpperCase() }))} maxLength={40} placeholder="MATERIHEMAT" /></label>
              <label className="field"><span>Jenis diskon</span><select value={checkoutSettings.coupon_discount_type} onChange={(event) => setCheckoutSettings((current) => ({ ...current, coupon_discount_type: event.target.value as "FIXED" | "PERCENT" }))}><option value="FIXED">Potongan rupiah</option><option value="PERCENT">Persentase</option></select></label>
            </div>
            <label className="field"><span>Nilai diskon</span><div className="input-suffix"><input type="number" min={0} max={checkoutSettings.coupon_discount_type === "PERCENT" ? 100 : undefined} value={checkoutSettings.coupon_discount_value} onChange={(event) => setCheckoutSettings((current) => ({ ...current, coupon_discount_value: Number(event.target.value) }))} /><b>{checkoutSettings.coupon_discount_type === "PERCENT" ? "%" : "RUPIAH"}</b></div></label>
          </section>
          <section className="payment-setting-block">
            <div className="payment-setting-title"><span>±</span><div><strong>Kode Unik</strong><small>Tambahkan atau kurangi nominal agar transfer lebih mudah dicocokkan.</small></div></div>
            <div className="split-fields">
              <label className="field"><span>Status kode unik</span><select value={checkoutSettings.unique_code_enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setCheckoutSettings((current) => ({ ...current, unique_code_enabled: event.target.value === "ACTIVE" }))}><option value="INACTIVE">Nonaktif</option><option value="ACTIVE">Aktif</option></select></label>
              <label className="field"><span>Perhitungan</span><select value={checkoutSettings.unique_code_direction} onChange={(event) => setCheckoutSettings((current) => ({ ...current, unique_code_direction: event.target.value as "ADD" | "SUBTRACT" }))}><option value="ADD">Tambahkan (+)</option><option value="SUBTRACT">Kurangi (−)</option></select></label>
            </div>
            <div className="split-fields"><label className="field"><span>Mulai</span><input type="number" min={0} max={9999} value={checkoutSettings.unique_code_min} onChange={(event) => setCheckoutSettings((current) => ({ ...current, unique_code_min: Number(event.target.value) }))} /></label><label className="field"><span>Sampai</span><input type="number" min={0} max={9999} value={checkoutSettings.unique_code_max} onChange={(event) => setCheckoutSettings((current) => ({ ...current, unique_code_max: Number(event.target.value) }))} /></label></div>
          </section>
          <label className="field"><span>Catatan pembayaran</span><textarea value={checkoutSettings.payment_note} onChange={(event) => setCheckoutSettings((current) => ({ ...current, payment_note: event.target.value }))} maxLength={1000} /></label>
          <div className="follow-up-actions"><span className="action-note"><strong>RAHASIA TETAP RAHASIA</strong><small>Kunci API tidak pernah dikirim kembali ke browser.</small></span><button className="button" type="submit" disabled={checkoutBusy}>{checkoutBusy ? "Menyimpan..." : "Simpan Pembayaran"}</button></div>
        </form>
        {activeWorkspaceSection.settings === "pembayaran" && checkoutMessage ? <p className={`integration-result ${checkoutMessage.type}`}>{checkoutMessage.text}</p> : null}
        <form id="batas-pembayaran" className="follow-up-form" hidden={activeWorkspaceSection.settings !== "batas-pembayaran"} onSubmit={saveOrderExpirySettings}>
          <div className="follow-up-trigger"><strong>GATE 3G</strong><span>Pesanan Kedaluwarsa Otomatis</span><small>Satu timer untuk QRIS dan rekening manual. Bukti masuk atau pembayaran lunas = timer berhenti.</small></div>
          <div className="split-fields">
            <label className="field"><span>Status kedaluwarsa</span><select value={orderExpirySettings.enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setOrderExpirySettings((current) => ({ ...current, enabled: event.target.value === "ACTIVE" }))}><option value="ACTIVE">Aktif — tutup order otomatis</option><option value="INACTIVE">Nonaktif — order tetap terbuka</option></select></label>
            <div className="split-fields">
              <label className="field"><span>Batas pembayaran</span><input type="number" min={1} max={43200} value={orderExpiryDuration} onChange={(event) => setOrderExpiryDuration(Number(event.target.value))} required /></label>
              <label className="field"><span>Satuan</span><select value={orderExpiryUnit} onChange={(event) => setOrderExpiryUnit(event.target.value as typeof orderExpiryUnit)}><option value="MINUTES">Menit</option><option value="HOURS">Jam</option><option value="DAYS">Hari</option></select></label>
            </div>
          </div>
          <label className="field"><span>Pesan saat waktu habis</span><textarea value={orderExpirySettings.expiry_notice} onChange={(event) => setOrderExpirySettings((current) => ({ ...current, expiry_notice: event.target.value }))} maxLength={4000} required /></label>
          <p className="form-note">Boleh menyapa member dengan {"{name}"}, {"{full_name}"}, {"{username}"}, atau {"{telegram_id}"}.</p>
          <div className="follow-up-actions"><span className="action-note"><strong>WAJIB ORDER ULANG</strong><small>Lewat batas waktu, order ditutup. Pembeli harus membuat order dan QR baru.</small></span><button className="button" type="submit" disabled={orderExpiryBusy}>{orderExpiryBusy ? "Menyimpan..." : "Simpan Batas Waktu"}</button></div>
        </form>
        {activeWorkspaceSection.settings === "batas-pembayaran" && orderExpiryMessage ? <p className={`integration-result ${orderExpiryMessage.type}`}>{orderExpiryMessage.text}</p> : null}
        <form id="redaksi-bot-global" className="follow-up-form bot-notification-form" hidden={activeWorkspaceSection.settings !== "notifikasi-admin"} onSubmit={saveBotNotificationSettings}>
          <div className="follow-up-trigger"><strong>NOTIFIKASI BOT</strong><span>Pusat Redaksi Bot</span><small>Atur teks balasan global dari satu tempat. Perubahan berlaku untuk pesan berikutnya tanpa deploy ulang.</small></div>
          <p className="notification-scope-note"><strong>Khusus redaksi global</strong> Balasan keyword seperti MAU tetap di menu Konten karena boleh berbeda untuk setiap posting.</p>
          <div className="notification-copy-grid">
            <section className="notification-message-box notification-copy-section notification-copy-wide">
              <div><strong>▶️ Balasan Tombol Start</strong><small>Alur otomatis bertahap: Channel → Grup → Cek Keanggotaan. Setiap tahap hanya menampilkan tombol yang diperlukan.</small></div>
              <TelegramFormatEditor label="Langkah 1 — gabung Channel" value={botNotificationSettings.start_pending_text} onChange={(value) => updateBotNotificationField("start_pending_text", value)} />
              <TelegramFormatEditor label="Langkah 2 — masuk Grup" value={botNotificationSettings.start_group_text} onChange={(value) => updateBotNotificationField("start_group_text", value)} />
              <TelegramFormatEditor label="Langkah 3 — cek keanggotaan" value={botNotificationSettings.start_check_text} onChange={(value) => updateBotNotificationField("start_check_text", value)} />
              <TelegramFormatEditor label="Balasan setelah akses aktif" value={botNotificationSettings.start_active_text} onChange={(value) => updateBotNotificationField("start_active_text", value)} />
              <div className="split-fields">
                <label className="field"><span>Tombol gabung Channel</span><input value={botNotificationSettings.join_channel_button_text} onChange={(event) => updateBotNotificationField("join_channel_button_text", event.target.value)} maxLength={64} required /></label>
                <label className="field"><span>Tombol gabung Grup</span><input value={botNotificationSettings.join_discussion_button_text} onChange={(event) => updateBotNotificationField("join_discussion_button_text", event.target.value)} maxLength={64} required /></label>
                <label className="field"><span>Tombol cek keanggotaan</span><input value={botNotificationSettings.check_membership_button_text} onChange={(event) => updateBotNotificationField("check_membership_button_text", event.target.value)} maxLength={64} required /></label>
              </div>
            </section>
            <section className="notification-message-box notification-copy-section">
              <div><strong>🎁 Materi Gratis</strong><small>Balasan saat orang meminta materi dari komentar Channel.</small></div>
              <TelegramFormatEditor label="Caption gambar referensi" value={botNotificationSettings.reference_image_caption} onChange={(value) => updateBotNotificationField("reference_image_caption", value)} maxLength={1024} />
              <TelegramFormatEditor label="Balasan saat pembagian materi dijeda" value={botNotificationSettings.free_claim_paused_reply} onChange={(value) => updateBotNotificationField("free_claim_paused_reply", value)} />
              <label className="field"><span>Teks tombol buka bot</span><input value={botNotificationSettings.open_bot_button_text} onChange={(event) => updateBotNotificationField("open_bot_button_text", event.target.value)} maxLength={64} required /></label>
            </section>
            <section className="notification-message-box notification-copy-section">
              <div><strong>🛒 Checkout & Broadcast</strong><small>Pesan saat transaksi atau broadcast sedang tidak tersedia.</small></div>
              <TelegramFormatEditor label="Checkout belum dibuka" value={botNotificationSettings.checkout_closed_text} onChange={(value) => updateBotNotificationField("checkout_closed_text", value)} />
              <TelegramFormatEditor label="Checkout dijeda" value={botNotificationSettings.checkout_paused_text} onChange={(value) => updateBotNotificationField("checkout_paused_text", value)} />
              <TelegramFormatEditor label="Berhasil berhenti broadcast" value={botNotificationSettings.broadcast_unsubscribed_text} onChange={(value) => updateBotNotificationField("broadcast_unsubscribed_text", value)} />
              <TelegramFormatEditor label="Berhasil aktifkan broadcast" value={botNotificationSettings.broadcast_resubscribed_text} onChange={(value) => updateBotNotificationField("broadcast_resubscribed_text", value)} />
            </section>
            <section className="notification-message-box notification-copy-section">
              <div><strong>🧾 Bukti Transfer</strong><small>Boleh memakai placeholder {"{order_number}"} dan {"{reason}"} sesuai keterangannya.</small></div>
              <TelegramFormatEditor label="Tidak ada order menunggu" value={botNotificationSettings.no_pending_order_text} onChange={(value) => updateBotNotificationField("no_pending_order_text", value)} />
              <TelegramFormatEditor label="Bukti sudah diterima" hint="Boleh pakai {order_number}" value={botNotificationSettings.proof_already_received_text} onChange={(value) => updateBotNotificationField("proof_already_received_text", value)} />
              <TelegramFormatEditor label="Format bukti tidak valid" value={botNotificationSettings.invalid_proof_format_text} onChange={(value) => updateBotNotificationField("invalid_proof_format_text", value)} />
              <TelegramFormatEditor label="Ukuran bukti terlalu besar" value={botNotificationSettings.proof_too_large_text} onChange={(value) => updateBotNotificationField("proof_too_large_text", value)} />
              <TelegramFormatEditor label="Order sudah tidak aktif" value={botNotificationSettings.inactive_order_text} onChange={(value) => updateBotNotificationField("inactive_order_text", value)} />
              <TelegramFormatEditor label="Petunjuk upload" hint="Boleh pakai {order_number}" value={botNotificationSettings.proof_upload_instruction_text} onChange={(value) => updateBotNotificationField("proof_upload_instruction_text", value)} />
              <TelegramFormatEditor label="Bukti ditolak" hint="Boleh pakai {order_number} dan {reason}" value={botNotificationSettings.proof_rejected_text} onChange={(value) => updateBotNotificationField("proof_rejected_text", value)} />
            </section>
            <section className="notification-admin-box notification-copy-section notification-copy-wide">
              <div><strong>🔔 Alarm Transaksi untuk Admin</strong><small>Placeholder: {"{order_number}"}, {"{buyer}"}, {"{product}"}, dan {"{amount}"}.</small></div>
              <TelegramFormatEditor label="Order baru" value={botNotificationSettings.admin_new_order_text} onChange={(value) => updateBotNotificationField("admin_new_order_text", value)} />
              <TelegramFormatEditor label="Bukti transfer masuk" value={botNotificationSettings.admin_payment_proof_text} onChange={(value) => updateBotNotificationField("admin_payment_proof_text", value)} />
              <TelegramFormatEditor label="Pengingat bukti belum diperiksa" value={botNotificationSettings.admin_payment_reminder_text} onChange={(value) => updateBotNotificationField("admin_payment_reminder_text", value)} />
              <TelegramFormatEditor label="Order kedaluwarsa" value={botNotificationSettings.admin_order_expired_text} onChange={(value) => updateBotNotificationField("admin_order_expired_text", value)} />
              <label className="field"><span>Teks tombol buka pesanan</span><input value={botNotificationSettings.admin_open_orders_button_text} onChange={(event) => updateBotNotificationField("admin_open_orders_button_text", event.target.value)} maxLength={64} required /></label>
            </section>
          </div>
          <div className="follow-up-actions"><span className="action-note"><strong>LANGSUNG BERLAKU</strong><small>Tidak mengubah pesan lama yang sudah terkirim. Bot memakai redaksi baru pada respons berikutnya.</small></span><button className="button" type="submit" disabled={botNotificationBusy}>{botNotificationBusy ? "Menyimpan..." : "Simpan Semua Redaksi"}</button></div>
        </form>
        {activeWorkspaceSection.settings === "notifikasi-admin" && botNotificationMessage ? <p className={`integration-result ${botNotificationMessage.type}`}>{botNotificationMessage.text}</p> : null}
        <form id="notifikasi-admin" className="follow-up-form" hidden={activeWorkspaceSection.settings !== "notifikasi-admin"} onSubmit={saveAdminNotificationSettings}>
          <div className="follow-up-trigger"><strong>NOTIFIKASI</strong><span>Pesanan & Admin</span><small>Atur pesan status untuk pembeli sekaligus alarm transaksi untuk Admin.</small></div>
          <div className="notification-message-box">
            <div><strong>Pesan Status ke Pembeli</strong><small>Data member: {"{name}"}, {"{full_name}"}, {"{username}"}, {"{telegram_id}"}. Data order: {"{order_number}"}, {"{product}"}, {"{amount}"}.</small></div>
            <TelegramFormatEditor label="Notifikasi Pending" value={adminNotificationSettings.pending_order_text} onChange={(value) => setAdminNotificationSettings((current) => ({ ...current, pending_order_text: value }))} />
            <TelegramFormatEditor label="Notifikasi Batal" value={adminNotificationSettings.cancelled_order_text} onChange={(value) => setAdminNotificationSettings((current) => ({ ...current, cancelled_order_text: value }))} />
            <TelegramFormatEditor label="Notifikasi Lunas" value={adminNotificationSettings.paid_order_text} onChange={(value) => setAdminNotificationSettings((current) => ({ ...current, paid_order_text: value }))} />
            <p className="form-note">Pesan Lunas dikirim bersama tombol akses produk yang diatur pada menu Tombol BELI.</p>
          </div>
          <div className="notification-admin-box">
            <div><strong>Alarm untuk Admin</strong><small>Order baru, bukti masuk, bukti belum diperiksa, dan order kedaluwarsa.</small></div>
          <div className="split-fields">
            <label className="field"><span>Status notifikasi</span><select value={adminNotificationSettings.enabled ? "ACTIVE" : "INACTIVE"} onChange={(event) => setAdminNotificationSettings((current) => ({ ...current, enabled: event.target.value === "ACTIVE" }))}><option value="INACTIVE">Nonaktif — jangan kirim</option><option value="ACTIVE">Aktif — kirim ke Admin</option></select></label>
            <label className="field"><span>Akun Telegram Admin</span><select value={adminNotificationSettings.recipient_user_id ?? ""} onChange={(event) => setAdminNotificationSettings((current) => ({ ...current, recipient_user_id: event.target.value || null }))} required><option value="">Pilih akun</option>{memberStatuses.filter((member) => member.contact_status === "CONTACTABLE").map((member) => <option key={member.id} value={member.id}>{member.username ? `@${member.username}` : member.first_name ?? String(member.telegram_user_id)}</option>)}</select></label>
          </div>
          <div className="split-fields">
            <label className="field"><span>Ingatkan bukti belum dicek</span><div className="input-suffix"><input type="number" min={1} max={1440} value={adminNotificationSettings.review_reminder_minutes} onChange={(event) => setAdminNotificationSettings((current) => ({ ...current, review_reminder_minutes: Number(event.target.value) }))} required /><b>MENIT</b></div></label>
            <label className="field"><span>Link Web Admin</span><input type="url" value={adminNotificationSettings.admin_url} onChange={(event) => setAdminNotificationSettings((current) => ({ ...current, admin_url: event.target.value }))} maxLength={500} required /></label>
          </div>
          </div>
          <div className="follow-up-actions"><span className="action-note"><strong>ANTI DOBEL</strong><small>Satu kejadian hanya menghasilkan satu notifikasi. Bukti yang sudah diputuskan tidak akan diingatkan lagi.</small></span><button className="button" type="submit" disabled={adminNotificationBusy}>{adminNotificationBusy ? "Menyimpan..." : "Simpan Notifikasi"}</button></div>
        </form>
        {activeWorkspaceSection.settings === "notifikasi-admin" && adminNotificationMessage ? <p className={`integration-result ${adminNotificationMessage.type}`}>{adminNotificationMessage.text}</p> : null}
      </section>
      <section id="automasi-follow-up" className="follow-up-card" hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "automasi-follow-up"} aria-labelledby="gate-3c-title">
        <div className="follow-up-heading">
          <div>
            <p className="eyebrow">AUTOMATION / GATE 3C</p>
            <h2 id="gate-3c-title">Kejar Transfer</h2>
            <p>Follow-up hanya untuk calon pembeli yang sudah membuat pesanan tetapi belum transfer. Begitu pembayaran dikonfirmasi, sisa pesan mati otomatis.</p>
          </div>
          <div className="follow-up-counts">
            <article><strong>{followUps.filter((item) => item.status === "ACTIVE").length}</strong><span>AKTIF</span></article>
            <article><strong>{followUpEnrollments.filter((item) => item.status === "COMPLETED").length}</strong><span>SELESAI</span></article>
            <article><strong>{followUpEnrollments.filter((item) => ["SCHEDULED", "SENDING"].includes(item.status)).length}</strong><span>MENUNGGU</span></article>
          </div>
        </div>
        <form className="follow-up-form" onSubmit={saveFollowUp}>
          <div className="split-fields">
            <label className="field"><span>Nama automasi</span><input value={followUpName} onChange={(event) => setFollowUpName(event.target.value)} maxLength={100} required /></label>
            <label className="field"><span>Status</span><select value={followUpStatus} onChange={(event) => setFollowUpStatus(event.target.value as typeof followUpStatus)}><option value="DRAFT">Draft — jangan kirim</option><option value="ACTIVE">Aktif untuk pesanan baru</option><option value="PAUSED">Jeda</option></select></label>
          </div>
          <div className="follow-up-trigger"><strong>PEMICU</strong><span>Pesanan dibuat · MENUNGGU TRANSFER</span><small>Sebelum setiap pesan dikirim, sistem mengecek ulang status pembayaran. LUNAS = berhenti.</small></div>
          <div className="follow-up-steps">
            {followUpSteps.map((step, index) => <article className="follow-up-step" key={index}>
              <div className="follow-up-step-head"><strong>PESAN {index + 1}</strong>{followUpSteps.length > 1 ? <button type="button" onClick={() => setFollowUpSteps((steps) => steps.filter((_, stepIndex) => stepIndex !== index).map((item, stepIndex) => ({ ...item, position: stepIndex + 1 })))}>HAPUS</button> : null}</div>
              <label className="field"><span>Jeda setelah {index === 0 ? "pesanan dibuat" : "pesan sebelumnya"}</span><div className="input-suffix"><input type="number" min={1} max={10080} value={step.delay_minutes} onChange={(event) => updateFollowUpStep(index, { delay_minutes: Number(event.target.value) })} required /><b>MENIT</b></div></label>
              <label className="field"><span>Isi pesan</span><textarea value={step.message_text} onChange={(event) => updateFollowUpStep(index, { message_text: event.target.value })} maxLength={4096} placeholder="Contoh: Halo {name}, pesananmu masih menunggu pembayaran." required /></label>
              <p className="form-note">Boleh memakai {"{name}"}, {"{full_name}"}, {"{username}"}, atau {"{telegram_id}"}.</p>
              <div className="follow-up-upload-button"><strong>📤 UPLOAD BUKTI TF</strong><span>Tombol ini otomatis muncul di bawah pesan. Pembeli tinggal tekan lalu kirim foto/PDF ke bot.</span></div>
            </article>)}
          </div>
          <div className="follow-up-actions">
            <button className="button secondary" type="button" disabled={followUpSteps.length >= 5} onClick={() => setFollowUpSteps((steps) => [...steps, { position: steps.length + 1, delay_minutes: 1440, message_text: "", button_text: "", button_url: "" }])}>+ Tambah Pesan</button>
            <button className="button" type="submit" disabled={followUpBusy}>{followUpBusy ? "Menyimpan..." : followUpStatus === "ACTIVE" ? "Simpan & Aktifkan" : "Simpan Automasi"}</button>
          </div>
        </form>
        {followUpMessage ? <p className={`integration-result ${followUpMessage.type}`}>{followUpMessage.text}</p> : null}
        <div className="follow-up-history">
          <div className="follow-up-history-head"><p className="list-label">AUTOMASI TERSIMPAN</p><button type="button" onClick={resetFollowUpForm}>+ AUTOMASI BARU</button></div>
          <div className="post-stack">
            {followUps.map((automation) => <button className="follow-up-row" type="button" key={automation.id} onClick={() => editFollowUp(automation)}><span><strong>{automation.name}</strong><small>{automation.follow_up_steps.length} pesan · Selama belum transfer</small></span><b className={`post-status status-${automation.status.toLowerCase()}`}>{automation.status}</b></button>)}
            {!followUps.length ? <p className="catalog-empty">Belum ada automasi. Draft pertama menunggu dibuat.</p> : null}
          </div>
        </div>
      </section>
      <section id="buat-postingan" className="posting-card" hidden={activeWorkspace !== "content" || activeWorkspaceSection.content !== "buat-postingan"} aria-labelledby="gate-2c-title">
        <div className="posting-heading">
          <div>
            <p className="eyebrow">{postEditingId ? "KONTEN / MODE EDIT" : postReuseSourceId ? "KONTEN / GUNAKAN LAGI" : "TELEGRAM / GATE 2C"}</p>
            <h2 id="gate-2c-title">{postEditingId ? "Edit Konten" : postReuseSourceId ? "Buat Konten Baru dari Riwayat" : "Mesin Posting Channel"}</h2>
            <p>{postEditingId ? "Ubah draft atau konten terjadwal yang belum dipublikasikan." : postReuseSourceId ? "Isi lama sudah disalin. Perubahan berikutnya akan disimpan sebagai konten baru tanpa mengubah posting asli." : "Satu posting, satu materi. Gambar dan caption tampil di Channel; isi materi tetap terkunci untuk balasan japri."}</p>
          </div>
          {postEditingId || postReuseSourceId ? <button className="button secondary" type="button" onClick={resetChannelPostForm}>{postEditingId ? "Batal Edit" : "Batal Gunakan Lagi"}</button> : <div className="posting-counts">
            <strong>{content365SourcePosts.filter((post) => post.status === "SENT").length}</strong><span>TERKIRIM</span>
            <strong>{content365SourcePosts.filter((post) => ["DRAFT", "SCHEDULED", "PUBLISHING"].includes(post.status)).length}</strong><span>MENUNGGU</span>
          </div>}
        </div>

        <form className="posting-form" onSubmit={createChannelPost}>
          <div className="posting-workbench">
          <aside className="posting-live-preview" aria-label="Preview langsung konten Telegram">
            <div className="posting-preview-heading">
              <div><span>PREVIEW OTOMATIS · BAGIAN 0{postActiveStep}</span><strong>{postActiveStep === 1 ? "Posting ke Channel" : postActiveStep === 2 ? "Keyword & Balasan" : postActiveStep === 3 ? "Isi Materi Japri" : "Penawaran & Jadwal"}</strong></div>
            </div>
            {postActiveStep === 1 ? <TelegramPhonePreview value={postCaption} imageUrl={activePostImagePreviewUrl} title="PROMPT VIRAL" subtitle="channel" /> : null}
            {postActiveStep === 2 ? <TelegramPhonePreview value={keywordPreviewValue} splitBubbles outgoingFirst title="Diskusi Prompt Viral" subtitle="grup · balasan otomatis" /> : null}
            {postActiveStep === 3 ? <TelegramPhonePreview value={postPromptParts} imageUrl={activePostImagePreviewUrl} splitBubbles title="Prompt Viral Bot" subtitle="bot" /> : null}
            {postActiveStep === 4 ? <TelegramPhonePreview value={schedulePreviewValue} title="Jadwal Posting" subtitle="ringkasan konten" /> : null}
            <p>Preview tetap di kiri dan berpindah otomatis mengikuti bagian editor yang sedang dibuka.</p>
          </aside>
          <div className="posting-editor-column">
          <details id="post-step-1" className="posting-step" open onPointerDown={() => setPostActiveStep(1)} onFocusCapture={() => setPostActiveStep(1)} onToggle={(event) => { if (event.currentTarget.open) setPostActiveStep(1); }}>
            <summary><span>01</span><strong>Posting ke Channel</strong><small>Gambar dan caption</small></summary>
            <div className="posting-step-body">
              <div className="post-image-editor">
                <div className={`post-image-preview${postHasImage ? "" : " empty"}`}>
                  {activePostImagePreviewUrl ? <img src={activePostImagePreviewUrl} alt="Preview gambar postingan" /> : <span>{postHasImage ? "Preview gambar lama tidak bisa dimuat. Gambar tetap bisa diganti atau dihapus." : postEditingId || postReuseSourceId ? "Posting ini akan disimpan tanpa gambar." : "Pilih gambar untuk melihat preview."}</span>}
                </div>
                <div className="post-image-controls">
                  <label className="post-image-picker">
                    <span>{postHasImage ? "Ganti Gambar" : "Pilih Gambar"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPostImage(file);
                      if (file) setPostImageRemoved(false);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                  {postHasImage ? <button className="post-image-remove" type="button" onClick={() => {
                    setPostImage(null);
                    if (postEditingId || postReuseSourceId) setPostImageRemoved(true);
                  }}>{postEditingId || postReuseSourceId ? "Hapus Gambar" : "Hapus Pilihan"}</button> : null}
                  {(postEditingId || postReuseSourceId) && postImageRemoved && postExistingImagePath ? <button className="post-image-restore" type="button" onClick={() => {
                    setPostImage(null);
                    setPostImageRemoved(false);
                  }}>Pakai Gambar Lama</button> : null}
                </div>
                <small>Preview ini memakai gambar yang akan disimpan. JPG, PNG, atau WEBP · maksimal 10 MB.</small>
              </div>
              <TelegramFormatEditor label={`Caption Channel (${postCaption.length}/1024)`} value={postCaption} onChange={setPostCaption} maxLength={1024} hint="Format yang terlihat di Channel." />
            </div>
          </details>

          <details id="post-step-2" className="posting-step" onPointerDown={() => setPostActiveStep(2)} onFocusCapture={() => setPostActiveStep(2)} onToggle={(event) => { if (event.currentTarget.open) setPostActiveStep(2); }}>
            <summary><span>02</span><strong>Keyword & Balasan</strong><small>Atur komentar otomatis</small></summary>
            <div className="posting-step-body">
            {commentRule ? <div className="post-automation-box">
            <div className="comment-switch-row">
              <div><span className="list-label">AUTOMASI POSTING INI</span><strong>{commentRule.status === "ACTIVE" ? "AKTIF" : "NONAKTIF"}</strong></div>
              <button className="button secondary" type="button" onClick={() => setCommentRule({ ...commentRule, status: commentRule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{commentRule.status === "ACTIVE" ? "Matikan" : "Aktifkan"}</button>
            </div>
            <div className="split-fields">
              <label className="field"><span>Keyword komentar</span><input value={commentRule.keywords.join(", ")} onChange={(event) => setCommentRule({ ...commentRule, keywords: event.target.value.split(",").slice(0, 10) })} placeholder="MAU, MAU MATERI, KIRIM" /><small>Pisahkan beberapa keyword dengan koma.</small></label>
              <label className="field"><span>Cara membaca</span><select value={commentRule.match_mode} onChange={(event) => setCommentRule({ ...commentRule, match_mode: event.target.value as CommentAutomationRule["match_mode"] })}><option value="EXACT">Harus persis</option><option value="WORD">Ada sebagai kata</option><option value="CONTAINS">Mengandung teks</option></select></label>
            </div>
            <TelegramFormatEditor label="Balasan setelah materi terkirim" value={commentRule.public_success_reply} onChange={(value) => setCommentRule({ ...commentRule, public_success_reply: value })} maxLength={500} />
            <TelegramFormatEditor label="Balasan jika belum tekan START" value={commentRule.start_required_reply} onChange={(value) => setCommentRule({ ...commentRule, start_required_reply: value })} maxLength={500} />
            <TelegramFormatEditor label="Balasan jika belum gabung Channel/Grup" value={commentRule.membership_required_reply} onChange={(value) => setCommentRule({ ...commentRule, membership_required_reply: value })} maxLength={500} />
            <p className="automation-scope-note"><strong>Terikat ke posting ini.</strong> Keyword yang sama boleh dipakai pada posting lain tanpa membuat balasan tertukar.</p>
            </div> : <p className="integration-result error">Pengaturan keyword belum berhasil dimuat.</p>}
            </div>
          </details>

          <details id="post-step-3" className="posting-step" onPointerDown={() => setPostActiveStep(3)} onFocusCapture={() => setPostActiveStep(3)} onToggle={(event) => { if (event.currentTarget.open) setPostActiveStep(3); }}>
            <summary><span>03</span><strong>Isi Materi Japri</strong><small>Gambar + bubble materi</small></summary>
            <div className="posting-step-body">
              <p className="prompt-image-note"><strong>Gambar otomatis ikut terkirim.</strong> Bot memakai gambar yang sama dari bagian Posting ke Channel, lalu mengirim bubble materi di bawahnya.</p>
              <TelegramFormatEditor label="Isi materi / bubble japri" value={postPromptParts} onChange={setPostPromptParts} maxLength={80000} hint="Pisahkan bubble dengan baris ---. Format berlaku per bubble." />
              <p className="form-note">Pisahkan tiap bubble dengan baris <strong>---</strong>. Isi ini tidak ikut tampil di Channel.</p>
            </div>
          </details>

          <details id="post-step-4" className="posting-step" onPointerDown={() => setPostActiveStep(4)} onFocusCapture={() => setPostActiveStep(4)} onToggle={(event) => { if (event.currentTarget.open) setPostActiveStep(4); }}>
            <summary><span>04</span><strong>Penawaran Tambahan</strong><small>Upsell dan waktu posting</small></summary>
            <div className="posting-step-body">
              <label className="field"><span>Penawaran setelah materi dihapus</span><select value={postUpsellMode} onChange={(event) => setPostUpsellMode(event.target.value as typeof postUpsellMode)}><option value="NONE">Tanpa upselling</option><option value="PROMPT_VIRAL">Upselling Produk</option></select></label>
              <p className="form-note">Pilih upselling hanya pada materi tertentu. Tanpa upselling berarti bot tetap menghapus materi dan mengirim notifikasi, lalu berhenti.</p>
              <div className="post-schedule-box">
                <strong className="schedule-title">WAKTU POSTING</strong>
                <div className="split-fields">
                  <label className="field"><span>Aksi</span><select value={postAction} onChange={(event) => setPostAction(event.target.value as typeof postAction)}>{postEditingId ? null : <option value="NOW">Posting Sekarang</option>}<option value="SCHEDULE">Jadwalkan</option><option value="DRAFT">Simpan Draft</option></select></label>
                  {postAction === "SCHEDULE" ? <label className="field"><span>Tanggal & jam</span><input type="datetime-local" value={postSchedule} onChange={(event) => setPostSchedule(event.target.value)} /></label> : <div className="action-note"><strong>{postAction === "NOW" ? "KIRIM SEKARANG" : "BELUM DIKIRIM"}</strong><span>{postAction === "NOW" ? "Worker langsung dibangunkan." : "Draft aman untuk dilanjutkan nanti."}</span></div>}
                </div>
              </div>
            </div>
          </details>
          </div>
          </div>
          <div className="post-form-actions">{postEditingId || postReuseSourceId ? <button className="button secondary" type="button" onClick={resetChannelPostForm}>Batal</button> : null}<button className="button" type="submit" disabled={postBusy || !categories.some((category) => category.status === "ACTIVE")}>{postBusy ? "Memproses..." : postEditingId ? "Simpan Perubahan" : postAction === "NOW" ? "Posting Sekarang" : postAction === "SCHEDULE" ? "Simpan Jadwal" : "Simpan Draft"}</button></div>
          {!categories.some((category) => category.status === "ACTIVE") ? <p className="integration-result error">Belum ada kategori aktif. Buat kategori materi terlebih dahulu.</p> : null}
        </form>
        {postMessage ? <p className={`integration-result ${postMessage.type}`}>{postMessage.text}</p> : null}
      </section>
      <section id="prompt-expiry" className="expiry-card" hidden={activeWorkspace !== "content" || activeWorkspaceSection.content !== "prompt-expiry"} aria-labelledby="gate-2e-title">
        <div className="expiry-heading">
          <div>
            <p className="eyebrow">TELEGRAM / GATE 2E</p>
            <h2 id="gate-2e-title">Hapus Materi + Penawaran</h2>
            <p>Bubble gratis punya umur. Setelah terhapus, bot selalu mengirim pemberitahuan; penawaran hanya ikut pada materi yang dipilih.</p>
          </div>
          <div className="expiry-counts">
            <strong>{commentClaims.filter((claim) => claim.expiry_status === "COMPLETED").length}</strong><span>SELESAI</span>
            <strong>{commentClaims.filter((claim) => ["SCHEDULED", "DELETING", "DELETED", "NOTIFYING"].includes(claim.expiry_status)).length}</strong><span>TERJADWAL</span>
            <strong>{commentClaims.filter((claim) => ["FAILED", "OUTCOME_UNKNOWN"].includes(claim.expiry_status)).length}</strong><span>PERLU CEK</span>
          </div>
        </div>
        <form className="expiry-form" onSubmit={saveExpirySettings}>
          <div className="split-fields">
            <label className="field"><span>Hapus setelah</span><input type="number" min={1} step={1} value={expiryDuration} onChange={(event) => setExpiryDuration(Number(event.target.value))} required /></label>
            <label className="field"><span>Satuan</span><select value={expiryUnit} onChange={(event) => setExpiryUnit(event.target.value as typeof expiryUnit)}><option value="HOURS">Jam</option><option value="MINUTES">Menit</option></select></label>
          </div>
          <p className="form-note">Setelan normal: <strong>6 jam</strong>. Untuk pengujian nyata, boleh ubah sementara menjadi 1 menit lalu kembalikan lagi.</p>
          <TelegramFormatEditor label="Pemberitahuan setelah materi dihapus" value={expirySettings.expiry_notice} onChange={(value) => setExpirySettings({ ...expirySettings, expiry_notice: value })} maxLength={1000} />
          <TelegramFormatEditor label="Penawaran PEBISNIS DIGITAL TELEGRAM" value={expirySettings.offer_text} onChange={(value) => setExpirySettings({ ...expirySettings, offer_text: value })} />
          <div className="split-fields">
            <label className="field"><span>Teks tombol (opsional)</span><input value={expirySettings.offer_button_text} onChange={(event) => setExpirySettings({ ...expirySettings, offer_button_text: event.target.value })} maxLength={64} /></label>
            <label className="field"><span>Link tombol (opsional)</span><input value={expirySettings.offer_button_url} onChange={(event) => setExpirySettings({ ...expirySettings, offer_button_url: event.target.value })} placeholder="https://t.me/..." inputMode="url" /></label>
          </div>
          <p className="form-note">Link tombol boleh kosong sampai alur order QRIS selesai dibangun. Teks penawaran tetap terkirim.</p>
          <button className="button" type="submit" disabled={expiryBusy}>{expiryBusy ? "Menyimpan..." : "Simpan Penghapusan"}</button>
        </form>
        {expiryMessage ? <p className={`integration-result ${expiryMessage.type}`}>{expiryMessage.text}</p> : null}
        <div className="expiry-flow" aria-label="Alur penghapusan materi">
          <article><span>01</span><strong>TUNGGU 6 JAM</strong><p>Dihitung dari materi selesai dikirim.</p></article>
          <article><span>02</span><strong>HAPUS BUBBLE</strong><p>Progress disimpan satu per satu.</p></article>
          <article><span>03</span><strong>CEK UPSELLING</strong><p>Kirim penawaran hanya jika materi mengaktifkannya.</p></article>
          <article><span>04</span><strong>BOLEH KLAIM LAGI</strong><p>Komentar MAU baru membuat siklus baru.</p></article>
        </div>
      </section>
      {profile.role === "SUPER_ADMIN" ? (
        <section hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "kesehatan-sistem"} className={workerIsAlive ? "worker-card active" : "worker-card"} aria-labelledby="gate-1g-title">
          <div>
            <p className="eyebrow">OPERATIONS / GATE 1G</p>
            <h2 id="gate-1g-title">Worker Otomatis</h2>
            <p>Antrean diperiksa otomatis setiap menit. Job gagal masuk jalur retry dan berhenti aman setelah batas percobaan.</p>
          </div>
          <div className="worker-facts">
            <article><span>STATUS</span><strong>{workerIsAlive ? "AKTIF" : "PERIKSA"}</strong></article>
            <article><span>JALAN TERAKHIR</span><strong>{lastWorkerRunLabel} WIB</strong></article>
            <article><span>BATCH TERAKHIR</span><strong>{workerRuntime?.succeeded ?? 0} sukses / {workerRuntime?.failed ?? 0} gagal</strong></article>
          </div>
        </section>
      ) : null}
      {profile.role === "SUPER_ADMIN" && gate1HResult?.passed ? (
        <section hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "kesehatan-sistem"} className="gate-h-card" aria-labelledby="gate-1h-title">
          <div className="gate-h-heading">
            <div>
              <p className="eyebrow">OPERATIONS / GATE 1H</p>
              <h2 id="gate-1h-title">Stress Test Lulus</h2>
              <p>{gate1HCompletedLabel} WIB · Data uji sudah dibersihkan.</p>
            </div>
            <strong className="gate-h-badge">LULUS</strong>
          </div>
          <div className="gate-h-grid">
            <article><span>100 JOB</span><strong>{gate1HResult.stress_succeeded ?? 0}/100</strong><p>{gate1HResult.stress_failed ?? 0} gagal</p></article>
            <article><span>2 WORKER</span><strong>{gate1HResult.duplicate_attempts ?? 0}</strong><p>proses ganda</p></article>
            <article><span>LEASE RECOVERY</span><strong>{gate1HResult.lease_recovered ? "PULIH" : "GAGAL"}</strong><p>attempt {gate1HResult.lease_recovery_attempt_count ?? 0}</p></article>
            <article><span>20 UPDATE/MENIT</span><strong>{gate1HResult.load_http_200 ?? 0}/{gate1HResult.load_updates ?? 0}</strong><p>{gate1HResult.load_transport_errors ?? 0} timeout</p></article>
          </div>
        </section>
      ) : null}
      {profile.role === "SUPER_ADMIN" ? (
        <section id="pengaturan-bot" hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "pengaturan-bot"} className="integration-card" aria-labelledby="telegram-staging-title">
          <div>
            <p className="eyebrow">TELEGRAM / GATE 1D</p>
            <h2 id="telegram-staging-title">Pengaturan Bot</h2>
            <p>Hubungkan bot Telegram aktif atau ganti ke bot baru. Token divalidasi ke Telegram lalu disimpan terenkripsi.</p>
          </div>
          <form className="bot-config-form" onSubmit={connectTelegramBot}>
            <label htmlFor="telegram-bot-token">Token dari BotFather</label>
            <input
              id="telegram-bot-token"
              name="telegram-bot-token"
              type="password"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder={telegramResult?.configured ? "Tempel token baru untuk mengganti" : "123456789:AA..."}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <span>
              Token tidak akan ditampilkan lagi. Jika token berasal dari bot baru, webhook bot lama dilepas otomatis.
            </span>
            <button
              className="button"
              type="submit"
              disabled={connectingBot || loadingBotStatus || (!telegramResult?.configured && !botToken.trim())}
            >
              {connectingBot ? "Memvalidasi..." : telegramResult?.configured && !botToken.trim() ? "Hubungkan Ulang" : telegramResult?.configured ? "Ganti Bot & Hubungkan" : "Validasi & Hubungkan"}
            </button>
          </form>
          {loadingBotStatus ? <p className="integration-result">Memeriksa status bot...</p> : null}
          {telegramResult?.ok && telegramResult.configured && telegramResult.connected ? (
            <p className="integration-result success">
              @{telegramResult.bot_username || "bot"} terhubung. {telegramResult.replaced && telegramResult.previous_bot_username ? `Bot sebelumnya @${telegramResult.previous_bot_username} sudah dilepas. ` : ""}Antrean: {telegramResult.pending_update_count ?? 0} update.
            </p>
          ) : null}
          {telegramResult?.ok && telegramResult.configured && !telegramResult.connected ? (
            <p className="integration-result error">Token tersimpan, tetapi webhook belum terhubung. Tekan Hubungkan Ulang.</p>
          ) : null}
          {telegramResult?.ok && !telegramResult.configured ? (
            <p className="integration-result">Belum ada token bot. Tempel token dari BotFather di atas.</p>
          ) : null}
          {telegramResult?.error ? <p className="integration-result error">{telegramResult.error}</p> : null}
        </section>
      ) : null}
      {profile.role === "SUPER_ADMIN" && telegramResult?.connected ? (
        <section hidden={activeWorkspace !== "settings" || activeWorkspaceSection.settings !== "pengaturan-bot"} className="contract-card" aria-labelledby="gate-1f-title">
          <div className="contract-copy">
            <p className="eyebrow">TELEGRAM / GATE 1F</p>
            <h2 id="gate-1f-title">Tes Member & Pesan</h2>
            <p>
              Langkah pertama mengecek status member dan admin bot, mengirim dua bubble japri,
              lalu menghapus keduanya. Langkah kedua membuktikan status non-member memakai akun Telegram kedua.
            </p>
          </div>
          <div className="contract-steps">
            <article className={probeResult?.action === "member_delivery_delete" ? "contract-step passed" : "contract-step"}>
              <span>01</span>
              <h3>Member + Japri</h3>
              <p>Tetap berada di Channel staging, lalu jalankan tes.</p>
              <button
                className="button"
                type="button"
                onClick={() => runContractProbe("member_delivery_delete")}
                disabled={runningProbe !== null}
              >
                {runningProbe === "member_delivery_delete" ? "Menguji..." : "Jalankan Tes"}
              </button>
            </article>
            <article className={probeResult?.action === "non_member" ? "contract-step passed" : "contract-step"}>
              <span>02</span>
              <h3>Non-member</h3>
              <p>Gunakan akun kedua yang belum bergabung ke Channel staging.</p>
              <button
                className="button secondary"
                type="button"
                onClick={() => runContractProbe("non_member")}
                disabled={runningProbe !== null}
              >
                {runningProbe === "non_member" ? "Memeriksa..." : "Cek Non-member"}
              </button>
            </article>
          </div>
          {probeResult?.ok && probeResult.action === "member_delivery_delete" ? (
            <p className="integration-result success">
              Lulus: member {probeResult.member_status}, bot admin di dua chat, {probeResult.sent_count} bubble terkirim dan {probeResult.deleted_count} terhapus.
            </p>
          ) : null}
          {probeResult?.ok && probeResult.action === "non_member" ? (
            <p className="integration-result success">
              Lulus: status akun kedua terbukti non-member ({probeResult.member_status}).
            </p>
          ) : null}
          {probeResult?.error ? <p className="integration-result error">{probeResult.error}</p> : null}
        </section>
      ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
