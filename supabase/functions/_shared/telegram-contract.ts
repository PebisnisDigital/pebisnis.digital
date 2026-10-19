import { constantTimeEqual, jsonResponse } from "./http.ts";

export type TelegramIngestResult = { accepted: boolean; duplicate: boolean; jobId: string | null };
export type TelegramWebhookDeps = {
  secret: string;
  maxBodyBytes?: number;
  ingest(updateId: number, payload: Record<string, unknown>): Promise<TelegramIngestResult>;
};

export function createTelegramWebhookHandler(deps: TelegramWebhookDeps) {
  const maxBodyBytes = deps.maxBodyBytes ?? 1_000_000;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, { allow: "POST" });
    const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!suppliedSecret || !constantTimeEqual(suppliedSecret, deps.secret)) return jsonResponse({ error: "INVALID_WEBHOOK_SECRET" }, 401);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) return jsonResponse({ error: "BODY_TOO_LARGE" }, 413);

    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > maxBodyBytes) return jsonResponse({ error: "BODY_TOO_LARGE" }, 413);
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(rawBody)); }
    catch { return jsonResponse({ error: "INVALID_JSON" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return jsonResponse({ error: "INVALID_PAYLOAD" }, 422);
    const updateId = (payload as Record<string, unknown>).update_id;
    if (!Number.isSafeInteger(updateId) || Number(updateId) < 0) return jsonResponse({ error: "INVALID_UPDATE_ID" }, 422);

    try {
      const result = await deps.ingest(Number(updateId), payload as Record<string, unknown>);
      return jsonResponse({ ok: true, duplicate: result.duplicate, job_id: result.jobId }, 200);
    } catch {
      return jsonResponse({ error: "DURABLE_INGEST_FAILED" }, 503);
    }
  };
}
