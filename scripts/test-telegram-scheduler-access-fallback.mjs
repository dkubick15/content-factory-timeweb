import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const APP_PORT = 19192;
const RELAY_PORT = 19193;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;
const BOT_TOKEN = "test-bot-token";
const accessHeaders = [];
const telegramRequests = [];
let allowAnonymousScheduler = true;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 12000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw lastError || new Error("Тестовый сервер не ответил вовремя");
}

const relay = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === `/bot${BOT_TOKEN}/getMe`) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      result: { id: 123, username: "test_motorport_bot" }
    }));
    return;
  }

  if (req.method === "POST" && req.url === `/bot${BOT_TOKEN}/sendMessage`) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      telegramRequests.push(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        result: { message_id: 951, chat: { id: -100123 } }
      }));
    });
    return;
  }

  const timestamp = String(req.headers["x-relay-timestamp"] || "");
  const signature = String(req.headers["x-relay-signature"] || "");
  const expected = crypto
    .createHmac("sha256", BOT_TOKEN)
    .update(`${timestamp}.scheduler`)
    .digest("hex");

  assert.equal(req.method, "GET");
  assert.equal(req.url, "/api/run-scheduler");
  assert.equal(signature, expected);

  const accessHeader = String(req.headers["oai-sites-authorization"] || "");
  accessHeaders.push(accessHeader);
  const denied = Boolean(accessHeader) || !allowAnonymousScheduler;
  res.writeHead(denied ? 403 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(denied
    ? { error: "Forbidden" }
    : { ok: true, processed: 0 }));
});

await new Promise((resolve) => relay.listen(RELAY_PORT, "127.0.0.1", resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-factory-scheduler-fallback-"));
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    DATA_DIR: dataDir,
    APP_SECRET: "test-app-secret",
    SEED_DEMO_USERS: "true",
    DEMO_EMAIL: "kubik",
    DEMO_PASSWORD: "kubik",
    TELEGRAM_RELAY_URL: RELAY_URL,
    TELEGRAM_SCHEDULER_URL: RELAY_URL,
    TELEGRAM_BROWSER_SCHEDULER_URL: RELAY_URL,
    TELEGRAM_PUBLISH_MODE: "external",
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_CHAT_ID: "@test-channel",
    TELEGRAM_SITES_ACCESS_TOKEN: "stale-access-token",
    TELEGRAM_API_BASE_URL: RELAY_URL,
    SCHEDULER_INTERVAL_MS: "500"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let appLogs = "";
app.stdout.on("data", (chunk) => { appLogs += chunk.toString(); });
app.stderr.on("data", (chunk) => { appLogs += chunk.toString(); });

async function api(pathname, options = {}) {
  const response = await fetch(`${APP_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${pathname}: HTTP ${response.status}`);
  return data;
}

try {
  await waitFor(() => api("/api/health?json=true"));
  const login = await waitFor(() => api("/api/auth/login", {
    method: "POST",
    body: { email: "kubik", password: "kubik" }
  }));

  const result = await api("/api/telegram/run-scheduler", {
    method: "POST",
    token: login.token,
    body: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.lastError, "");
  assert.equal(Boolean(result.state.lastSuccessAt), true);
  assert.deepEqual(accessHeaders, ["Bearer stale-access-token", ""]);

  const connection = await api("/api/telegram/check-connection", { token: login.token });
  assert.equal(connection.ok, true);
  assert.equal(connection.chatId, "@test-channel");
  assert.equal(connection.botUsername, "test_motorport_bot");

  accessHeaders.length = 0;
  allowAnonymousScheduler = false;
  await api("/api/queue", {
    method: "POST",
    token: login.token,
    body: {
      post: {
        id: "external-direct-fallback-test",
        title: "Прямая резервная публикация",
        body: "Текст уходит напрямую, когда внешний планировщик недоступен.",
        tags: "#test",
        platform: "telegram",
        contentFormat: "telegram",
        status: "scheduled_relay",
        scheduledAt: new Date(Date.now() - 1000).toISOString()
      }
    }
  });

  const publishedPost = await waitFor(async () => {
    const workspace = await api("/api/workspace", { token: login.token });
    const post = workspace.workspace.queue.find((item) => item.id === "external-direct-fallback-test");
    return post?.status === "published" ? post : null;
  });
  assert.equal(publishedPost.telegramMessageId, 951);
  assert.equal(telegramRequests.length, 1);
  assert.equal(telegramRequests[0].chat_id, "@test-channel");
  assert.equal(telegramRequests[0].text.includes("Прямая резервная публикация"), true);
  console.log("Telegram scheduler access and direct publishing fallback tests passed.");
} catch (error) {
  console.error(appLogs);
  throw error;
} finally {
  app.kill("SIGTERM");
  relay.close();
}
