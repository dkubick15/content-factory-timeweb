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
const WORKER_TOKEN = "test-worker-token";
const relayRequests = [];

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
  if (req.method !== "POST" || req.url !== "/api/publish") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = String(req.headers["x-relay-timestamp"] || "");
    const signature = String(req.headers["x-relay-signature"] || "");
    const expected = crypto
      .createHmac("sha256", BOT_TOKEN)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    assert.equal(signature, expected);
    relayRequests.push(JSON.parse(body));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, messageId: 950 + relayRequests.length }));
  });
});

await new Promise((resolve) => relay.listen(RELAY_PORT, "127.0.0.1", resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-factory-worker-"));
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
    TELEGRAM_BROWSER_SCHEDULER_URL: RELAY_URL,
    TELEGRAM_PUBLISH_MODE: "external",
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_CHAT_ID: "@test-channel",
    TELEGRAM_WORKER_TOKEN: WORKER_TOKEN,
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
      ...(options.worker ? { Authorization: `Bearer ${WORKER_TOKEN}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${pathname}: HTTP ${response.status}`);
  return data;
}

async function executeWorkerJob(job) {
  const ticket = job.relayTicket;
  const relayResponse = await fetch(ticket.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Timestamp": ticket.timestamp,
      "X-Relay-Signature": ticket.signature
    },
    body: ticket.body
  });
  const result = await relayResponse.json();
  assert.equal(relayResponse.ok, true);
  return api("/api/telegram/worker/complete", {
    method: "POST",
    worker: true,
    body: {
      userId: job.userId,
      postId: job.postId,
      claimId: job.claimId,
      success: true,
      result
    }
  });
}

try {
  await waitFor(() => api("/api/health?json=true"));
  const login = await waitFor(() => api("/api/auth/login", {
    method: "POST",
    body: { email: "kubik", password: "kubik" }
  }));

  const connection = await api("/api/telegram/check-connection", { token: login.token });
  assert.equal(connection.ok, true);
  assert.equal(connection.chatId, "@test-channel");
  assert.equal(connection.transport, "signed-relay");

  await api("/api/queue", {
    method: "POST",
    token: login.token,
    body: {
      post: {
        id: "github-worker-test",
        title: "Публикация через GitHub Actions",
        body: "Timeweb только хранит очередь и выдаёт подписанное задание.",
        tags: "#test",
        platform: "telegram",
        contentFormat: "telegram",
        status: "scheduled_relay",
        scheduledAt: new Date(Date.now() - 1000).toISOString()
      }
    }
  });

  const firstClaim = await api("/api/telegram/worker/claim", { method: "POST", worker: true });
  assert.equal(firstClaim.job.postId, "github-worker-test");
  assert.equal(firstClaim.job.relayTicket.url, `${RELAY_URL}/api/publish`);
  await executeWorkerJob(firstClaim.job);

  const workspaceAfterPublish = await api("/api/workspace", { token: login.token });
  const publishedPost = workspaceAfterPublish.workspace.queue.find((item) => item.id === "github-worker-test");
  assert.equal(publishedPost.status, "published");
  assert.equal(publishedPost.telegramMessageId, 951);
  assert.equal(relayRequests.length, 1);

  const batchStart = Date.now() - 3 * 60 * 60 * 1000;
  for (let index = 0; index < 3; index += 1) {
    await api("/api/queue", {
      method: "POST",
      token: login.token,
      body: {
        post: {
          id: `recovered-batch-${index + 1}`,
          title: `Восстановленная пачка ${index + 1}`,
          body: "Планировщик сохраняет часовой интервал.",
          tags: "#test",
          platform: "telegram",
          contentFormat: "telegram",
          status: "scheduled_relay",
          scheduledAt: new Date(batchStart + index * 60 * 60 * 1000).toISOString()
        }
      }
    });
  }

  const batchClaim = await api("/api/telegram/worker/claim", { method: "POST", worker: true });
  assert.equal(batchClaim.job.postId, "recovered-batch-1");
  await executeWorkerJob(batchClaim.job);

  const workspaceAfterBatch = await api("/api/workspace", { token: login.token });
  const recoveredBatch = workspaceAfterBatch.workspace.queue
    .filter((item) => String(item.id).startsWith("recovered-batch-"))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  assert.equal(recoveredBatch[0].status, "published");
  assert.equal(recoveredBatch[1].status, "scheduled_local");
  assert.equal(recoveredBatch[2].status, "scheduled_local");
  assert.equal(new Date(recoveredBatch[1].scheduledAt).getTime() > Date.now() + 55 * 60 * 1000, true);
  assert.equal(
    new Date(recoveredBatch[2].scheduledAt).getTime() - new Date(recoveredBatch[1].scheduledAt).getTime(),
    60 * 60 * 1000
  );

  const emptyClaim = await api("/api/telegram/worker/claim", { method: "POST", worker: true });
  assert.equal(emptyClaim.job, null);

  const immediatePost = {
    id: "browser-relay-ticket-test",
    title: "Публикация через браузер",
    body: "Сервер возвращает подписанный relay-ticket.",
    tags: "#test",
    platform: "telegram",
    contentFormat: "telegram",
    status: "publishing"
  };
  const ticketResult = await api("/api/publish/telegram", {
    method: "POST",
    token: login.token,
    body: { post: immediatePost, media: null }
  });
  assert.equal(ticketResult.telegram.queued, true);
  assert.equal(ticketResult.telegram.relayTicket.url, `${RELAY_URL}/api/publish`);
  console.log("GitHub Actions Telegram worker and browser relay ticket tests passed.");
} catch (error) {
  console.error(appLogs);
  throw error;
} finally {
  app.kill("SIGTERM");
  relay.close();
}
