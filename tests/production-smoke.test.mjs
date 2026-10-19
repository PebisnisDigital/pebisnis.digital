import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.SMOKE_ORIGIN;
if (!origin) throw new Error("Set SMOKE_ORIGIN to the running deployment URL.");

for (const [path, expected] of [
  ["/", "Kelola Materi Pebisnis Digital"],
  ["/login", "Email Admin"],
  ["/dashboard", "Memeriksa akses admin..."],
  ["/reset-password", "Password baru"],
]) {
  test(`GET ${path} renders the migrated application`, async () => {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.ok(html.includes(expected), `Missing expected page content at ${path}`);
    assert.ok(!html.includes("Konfigurasi staging belum terpasang"));
    assert.ok(!html.includes('name="codex-preview"'));
    assert.ok(!/sb_secret_|eyJ[a-zA-Z0-9_-]+\.eyJ[^"\s]*service_role/.test(html));
  });
}
