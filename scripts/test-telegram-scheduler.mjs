import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const APP_PORT = 19190;
const RELAY_PORT = 19191;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const BOT_TOKEN = "test-bot-token";
const requests = [];

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
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = req.headers["x-relay-timestamp"] || "";
    const signature = req.headers["x-relay-signature"] || "";
    const expected = crypto
      .createHmac("sha256", BOT_TOKEN)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    assert.equal(req.url, "/api/publish");
    assert.equal(signature, expected);

    const payload = JSON.parse(body);
    requests.push(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      messageId: 900 + requests.length,
      chatId: -100123
    }));
  });
});

await new Promise((resolve) => relay.listen(RELAY_PORT, "127.0.0.1", resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-factory-telegram-test-"));
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
    TELEGRAM_RELAY_URL: `http://127.0.0.1:${RELAY_PORT}`,
    TELEGRAM_EXTERNAL_SCHEDULER: "false",
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_CHAT_ID: "@test-channel",
    SCHEDULER_INTERVAL_MS: "1000",
    DEBUG_HEALTH: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let appLogs = "";
app.stdout.on("data", (chunk) => {
  appLogs += chunk.toString();
});
app.stderr.on("data", (chunk) => {
  appLogs += chunk.toString();
});

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
  const token = login.token;

  const scheduledId = "scheduled-test";
  await api("/api/queue", {
    method: "POST",
    token,
    body: {
      post: {
        id: scheduledId,
        title: "Проверка расписания",
        body: "Публикация через подписанный ретранслятор.",
        tags: "#test",
        platform: "telegram",
        contentFormat: "dzen",
        status: "scheduled",
        scheduledAt: new Date(Date.now() - 1000).toISOString()
      }
    }
  });

  const scheduledPost = await waitFor(async () => {
    const data = await api("/api/workspace", { token });
    const post = data.workspace.queue.find((item) => item.id === scheduledId);
    return post?.status === "published" ? post : null;
  });
  assert.equal(scheduledPost.telegramMessageId, 901);

  const immediateId = "immediate-test";
  const immediatePost = {
    id: immediateId,
    title: "Проверка кнопки",
    body: "Немедленная публикация через сервер.",
    tags: "#test",
    platform: "telegram",
    contentFormat: "telegram",
    status: "publishing"
  };
  await api("/api/queue", {
    method: "POST",
    token,
    body: { post: immediatePost }
  });
  const immediate = await api("/api/publish/telegram", {
    method: "POST",
    token,
    body: { post: immediatePost, media: null }
  });
  assert.equal(immediate.telegram.result.message_id, 902);

  const workspace = await api("/api/workspace", { token });
  const storedImmediate = workspace.workspace.queue.find((item) => item.id === immediateId);
  assert.equal(storedImmediate.status, "published");
  assert.equal(storedImmediate.telegramMessageId, 902);
  assert.equal(requests.length, 2);

  console.log("Telegram integration test passed: scheduled=901, immediate=902.");
} catch (error) {
  console.error(appLogs);
  throw error;
} finally {
  app.kill("SIGTERM");
  relay.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
