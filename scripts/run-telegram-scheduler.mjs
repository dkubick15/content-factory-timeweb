const baseUrl = String(
  process.env.CONTENT_FACTORY_BASE_URL || "https://cf-kubik.twc1.net"
).replace(/\/+$/, "");
const audience = "content-factory-telegram-scheduler";

async function getGithubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error("GitHub OIDC environment is missing");
  }

  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${requestToken}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.value) {
    throw new Error(`GitHub OIDC token request failed (${response.status})`);
  }
  return data.value;
}

async function appRequest(path, token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${path} failed (${response.status})`);
  }
  return data;
}

async function telegramRequest(job) {
  const isImage = String(job.mediaType || "").startsWith("image/");
  const method = job.mediaUrl ? (isImage ? "sendPhoto" : "sendVideo") : "sendMessage";
  const payload = job.mediaUrl
    ? {
        chat_id: job.chatId,
        [isImage ? "photo" : "video"]: job.mediaUrl,
        caption: job.text
      }
    : {
        chat_id: job.chatId,
        text: job.text
      };

  const response = await fetch(
    `https://api.telegram.org/bot${job.botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30000)
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram failed (${response.status})`);
  }
  return data.result;
}

const oidcToken = await getGithubOidcToken();
const claim = await appRequest("/api/scheduler/telegram/claim", oidcToken, {
  limit: 10
});
const jobs = Array.isArray(claim.jobs) ? claim.jobs : [];

if (!jobs.length) {
  console.log("Telegram scheduler: no due publications.");
  process.exit(0);
}

console.log(`Telegram scheduler: claimed ${jobs.length} publication(s).`);
let failed = 0;

for (const job of jobs) {
  let result;
  let errorMessage = "";
  try {
    result = await telegramRequest(job);
    console.log(`Published post ${job.postId}, Telegram message ${result.message_id}.`);
  } catch (error) {
    failed += 1;
    errorMessage = String(error?.message || "Telegram publication failed").slice(0, 500);
    console.error(`Post ${job.postId} failed: ${errorMessage}`);
  }

  await appRequest("/api/scheduler/telegram/complete", oidcToken, {
    userId: job.userId,
    postId: job.postId,
    claimId: job.claimId,
    ok: Boolean(result),
    messageId: result?.message_id || "",
    error: errorMessage
  });
}

if (failed) {
  throw new Error(`${failed} Telegram publication(s) failed and were queued for retry.`);
}
