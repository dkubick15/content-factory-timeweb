import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import http from "http";
import https from "https";
import net from "net";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const OAUTH_SCOPES = ["content.read", "content.write"];
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHATGPT_HOST = "chatgpt.com";
const MCP_PATH = "/mcp";

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function signOpaqueToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyOpaqueToken(token, secret) {
  if (!token || !String(token).includes(".")) return null;
  const [body, signature] = String(token).split(".");
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  try {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() >= Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeScopes(value) {
  const requested = String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => OAUTH_SCOPES.includes(item));
  return requested.length ? [...new Set(requested)] : [...OAUTH_SCOPES];
}

function parseAuthorizeParams(input = {}, baseUrl) {
  const responseType = cleanText(input.response_type, 30);
  const clientId = cleanText(input.client_id, 2000);
  const redirectUri = cleanText(input.redirect_uri, 2000);
  const state = cleanText(input.state, 2000);
  const codeChallenge = cleanText(input.code_challenge, 256);
  const codeChallengeMethod = cleanText(input.code_challenge_method, 20);
  const resource = cleanText(input.resource, 2000) || `${baseUrl}${MCP_PATH}`;
  const scopes = normalizeScopes(input.scope);

  if (responseType !== "code") {
    throw new Error("ChatGPT запросил неподдерживаемый способ авторизации.");
  }

  let clientUrl;
  let redirectUrl;
  try {
    clientUrl = new URL(clientId);
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new Error("Некорректные параметры приложения ChatGPT.");
  }

  const validClient = clientUrl.protocol === "https:"
    && clientUrl.hostname === CHATGPT_HOST
    && clientUrl.pathname.startsWith("/oauth/")
    && clientUrl.pathname.endsWith("/client.json");
  const validRedirect = redirectUrl.protocol === "https:"
    && redirectUrl.hostname === CHATGPT_HOST
    && (
      redirectUrl.pathname.startsWith("/connector/oauth/")
      || redirectUrl.pathname === "/connector_platform_oauth_redirect"
    );

  if (!validClient || !validRedirect) {
    throw new Error("Подключение разрешено только официальному приложению ChatGPT.");
  }

  if (resource !== `${baseUrl}${MCP_PATH}`) {
    throw new Error("ChatGPT запросил доступ не к тому ресурсу.");
  }

  if (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new Error("ChatGPT не передал безопасную PKCE-проверку.");
  }

  return {
    responseType,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    resource,
    scopes
  };
}

function renderOauthPage(template, params = {}, error = "") {
  const fields = [
    ["response_type", params.responseType || "code"],
    ["client_id", params.clientId || ""],
    ["redirect_uri", params.redirectUri || ""],
    ["state", params.state || ""],
    ["code_challenge", params.codeChallenge || ""],
    ["code_challenge_method", params.codeChallengeMethod || "S256"],
    ["resource", params.resource || ""],
    ["scope", Array.isArray(params.scopes) ? params.scopes.join(" ") : ""]
  ]
    .map(([name, value]) => (
      `<input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}">`
    ))
    .join("\n");

  const errorBlock = error
    ? `<div class="oauth-error" role="alert">${htmlEscape(error)}</div>`
    : "";

  return template
    .replace("{{FORM_FIELDS}}", fields)
    .replace("{{ERROR_BLOCK}}", errorBlock);
}

function isPrivateIp(address) {
  const value = String(address || "").trim().toLowerCase();
  if (!value) return true;
  if (value.startsWith("::ffff:")) return isPrivateIp(value.slice(7));

  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224
    );
  }

  if (net.isIPv6(value)) {
    return (
      value === "::"
      || value === "::1"
      || value.startsWith("fc")
      || value.startsWith("fd")
      || value.startsWith("fe8")
      || value.startsWith("fe9")
      || value.startsWith("fea")
      || value.startsWith("feb")
    );
  }

  return true;
}

async function assertPublicHttpsUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("ChatGPT передал некорректную ссылку на изображение.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Изображение принимается только по защищённой HTTPS-ссылке.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
  ) {
    throw new Error("Локальные адреса изображений запрещены.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Не удалось определить адрес файла ChatGPT.");
  }

  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error("Локальные и служебные адреса изображений запрещены.");
  }

  return parsed;
}

function publicDnsLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
        throw new Error("Локальные и служебные адреса изображений запрещены.");
      }

      if (options?.all) {
        callback(null, addresses);
        return;
      }

      const address = options?.family
        ? addresses.find((item) => item.family === Number(options.family))
        : addresses[0];
      if (!address) throw new Error("Не удалось определить публичный адрес файла.");
      callback(null, address.address, address.family);
    })
    .catch((error) => callback(error));
}

function requestPublicBinary(parsedUrl, maxBytes) {
  return new Promise((resolve, reject) => {
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const request = transport.get(parsedUrl, {
      headers: {
        "User-Agent": "ContentFactoryChatGPTApp/1.0",
        Accept: "image/png,image/jpeg,image/webp,image/gif,application/octet-stream;q=0.5"
      },
      lookup: publicDnsLookup,
      timeout: 30000
    }, (response) => {
      const status = Number(response.statusCode || 0);
      const location = String(response.headers.location || "");

      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ redirect: location });
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`ChatGPT-файл не открылся: HTTP ${status || "unknown"}.`));
        return;
      }

      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > maxBytes) {
        response.resume();
        reject(new Error("Изображение слишком большое для импорта."));
        return;
      }

      const chunks = [];
      let total = 0;
      let stopped = false;
      response.on("data", (chunk) => {
        if (stopped) return;
        total += chunk.length;
        if (total > maxBytes) {
          stopped = true;
          request.destroy(new Error("Изображение слишком большое для импорта."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (stopped) return;
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: String(response.headers["content-type"] || "")
            .split(";")[0]
            .trim()
            .toLowerCase()
        });
      });
      response.on("error", reject);
    });

    request.on("timeout", () => {
      request.destroy(new Error("ChatGPT-файл не загрузился за 30 секунд."));
    });
    request.on("error", reject);
  });
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89
    && buffer.subarray(1, 4).toString("ascii") === "PNG"
  ) {
    return "image/png";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  return "";
}

async function downloadChatGptImage(rawUrl, maxBytes) {
  let currentUrl = await assertPublicHttpsUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const result = await requestPublicBinary(currentUrl, maxBytes);
    if (result.redirect !== undefined) {
      if (!result.redirect || redirectCount === 3) {
        throw new Error("Слишком длинная цепочка перенаправлений файла.");
      }
      currentUrl = await assertPublicHttpsUrl(
        new URL(result.redirect, currentUrl).toString()
      );
      continue;
    }

    const detectedMime = detectImageMime(result.buffer);
    if (!detectedMime) {
      throw new Error("ChatGPT передал файл, который не является PNG, JPEG, WEBP или GIF.");
    }
    return {
      buffer: result.buffer,
      mimeType: detectedMime
    };
  }

  throw new Error("Не удалось загрузить изображение из ChatGPT.");
}

function extensionForMime(mimeType) {
  return {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  }[mimeType] || ".img";
}

function safeMediaName(name, headline, extension) {
  const original = path.basename(cleanText(name, 180));
  if (original) return original;
  const stem = cleanText(headline, 60).replace(/[^\p{L}\p{N}._ -]+/gu, "").trim();
  return `ChatGPT_${stem || "обложка"}${extension}`;
}

function issueAccessToken({ userId, clientId, resource, scopes, secret }) {
  const now = Date.now();
  return signOpaqueToken({
    typ: "oauth_access",
    sub: userId,
    clientId,
    aud: resource,
    scope: scopes.join(" "),
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_MS
  }, secret);
}

function issueRefreshToken({ userId, clientId, resource, scopes, secret }) {
  const now = Date.now();
  return signOpaqueToken({
    typ: "oauth_refresh",
    sub: userId,
    clientId,
    aud: resource,
    scope: scopes.join(" "),
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_MS
  }, secret);
}

function hasScope(payload, scope) {
  return String(payload?.scope || "").split(/\s+/).includes(scope);
}

function mcpError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

function createContentFactoryMcpServer(context) {
  const {
    access,
    baseUrl,
    loadStore,
    saveStore,
    resolveWorkspaceUser,
    sanitizeWorkspace,
    plainPublicationHeadline,
    plainPublicationText,
    createTelegramSchedulerTriggerUrl,
    uploadsDir,
    maxImageBytes
  } = context;

  const markChatGptActivity = (store, user, toolName, imported = false) => {
    const now = new Date().toISOString();
    user.settings = {
      ...(user.settings || {}),
      chatgptConnectedAt: user.settings?.chatgptConnectedAt || now,
      chatgptLastMcpAt: now,
      chatgptLastToolAt: now,
      chatgptLastToolName: toolName
    };
    if (imported) {
      user.settings.chatgptLastImportAt = now;
    }
  };

  const server = new McpServer(
    {
      name: "content-factory-motor-port",
      version: "1.0.0"
    },
    {
      instructions: [
        "Это личное приложение пользователя для проекта Motor Port.",
        "В начале работы с материалом обязательно вызови get_motor_port_context.",
        "Создавай русский plain text без Markdown: никаких #, ##, **, обратных кавычек и markdown-ссылок.",
        "Фразы пользователя «сохрани», «передай в Контент-завод», «добавь в черновики» означают обязательный вызов import_content_package.",
        "Когда пользователь одобрил текст и изображение, вызови import_content_package ровно один раз и дождись результата.",
        "Если пользователь явно одобрил автоматические публикации без ручного согласования, для запусков расписания передавай auto_publish=true.",
        "Если import_content_package присутствует в списке инструментов, не говори, что сохранение недоступно.",
        "Если инструментов приложения действительно нет в текущем чате, прямо попроси пользователя включить приложение «Контент-завод» в меню приложений этого чата.",
        "Без auto_publish инструмент сохраняет черновик. С auto_publish=true он также ставит Telegram-пост в очередь немедленной публикации."
      ].join(" ")
    }
  );

  const oauthMeta = {
    securitySchemes: [
      {
        type: "oauth2",
        scopes: ["content.read", "content.write"]
      }
    ]
  };

  server.registerTool(
    "get_motor_port_context",
    {
      title: "Получить контекст Motor Port",
      description: "Возвращает актуальный бриф проекта и правила текста перед генерацией поста и обложки.",
      inputSchema: {},
      outputSchema: {
        project: z.record(z.string()),
        publication_rules: z.array(z.string()),
        recent_headlines: z.array(z.string()),
        content_factory_url: z.string()
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      },
      _meta: oauthMeta
    },
    async () => {
      if (!hasScope(access, "content.read")) {
        return mcpError("Подключению не хватает права content.read.");
      }

      const store = loadStore();
      const user = store.users.find((item) => item.id === access.sub);
      if (!user) return mcpError("Аккаунт «Контент-завода» не найден.");
      const workspaceUser = resolveWorkspaceUser(store, user);
      const storedUser = store.users.find((item) => item.id === workspaceUser.id);
      if (!storedUser) return mcpError("Рабочее пространство не найдено.");
      markChatGptActivity(store, storedUser, "get_motor_port_context");
      saveStore(store);
      const workspace = sanitizeWorkspace(storedUser.workspace || {});
      const project = workspace.projects.find(
        (item) => item.id === workspace.activeProjectId
      ) || workspace.projects[0] || {};

      const structuredContent = {
        project: {
          name: cleanText(project.name, 160),
          niche: cleanText(project.niche, 1000),
          offer: cleanText(project.offer, 1000),
          audience: cleanText(project.audience, 1500),
          awareness: cleanText(project.awareness, 1000),
          pain: cleanText(project.pain, 1500),
          fear: cleanText(project.fear, 1500),
          proof: cleanText(project.proof, 2000),
          facts: cleanText(project.facts, 1500),
          advantages: cleanText(project.advantages, 1500),
          tone: cleanText(project.tone, 1000),
          common: cleanText(project.common, 1500),
          goal: cleanText(project.goal, 1000),
          next_step: cleanText(project.nextStep, 1000),
          site: cleanText(project.landingPage, 500)
        },
        publication_rules: [
          "Пиши по-русски, короткими абзацами, плотно и без выдуманных фактов.",
          "Не используй Markdown-маркеры #, ##, **, __, обратные кавычки и markdown-ссылки.",
          "Для списков используй символ •.",
          "Заголовок, тело и теги вместе должны помещаться в 4096 знаков Telegram.",
          "Изображение должно иллюстрировать реальную ситуацию материала, без текста и выдуманных деталей.",
          "Сначала покажи комплект пользователю. Исключение: заранее одобренная пользователем автоматическая серия публикаций по расписанию."
        ],
        recent_headlines: [...new Set([
          ...workspace.ideas.map((item) => item?.title || item?.formats?.telegram?.headline || ""),
          ...workspace.queue.map((item) => item?.title || "")
        ].map((item) => plainPublicationHeadline(item)).filter(Boolean))].slice(0, 24),
        content_factory_url: `${baseUrl}/`
      };

      return {
        structuredContent,
        content: [{
          type: "text",
          text: "Контекст Motor Port загружен. Подготовь один сильный материал и соответствующее изображение."
        }]
      };
    }
  );

  const imageFileSchema = z.object({
    download_url: z.string().url(),
    file_id: z.string().min(1),
    mime_type: z.string().optional(),
    file_name: z.string().optional()
  });

  server.registerTool(
    "import_content_package",
    {
      title: "Сохранить или опубликовать материал",
      description: "Сохраняет материал Motor Port в Контент-заводе. По умолчанию создаёт черновик. Передавай auto_publish=true только для заранее одобренной пользователем автоматической публикации в Telegram.",
      inputSchema: {
        request_id: z.string().min(8).max(120)
          .describe("Уникальный ID этой передачи. Повторный вызов с тем же ID не создаст дубль."),
        headline: z.string().min(3).max(300),
        body: z.string().min(20).max(10000),
        tags: z.string().max(1000).optional(),
        content_format: z.enum(["dzen", "telegram"]).default("dzen"),
        auto_publish: z.boolean().default(false)
          .describe("Поставить Telegram-пост в очередь немедленной публикации. Использовать только после явного одобрения автопубликации пользователем."),
        image: imageFileSchema.optional()
      },
      outputSchema: {
        ok: z.boolean(),
        duplicate: z.boolean(),
        draft_id: z.string(),
        headline: z.string(),
        image_saved: z.boolean(),
        telegram_ready: z.boolean(),
        total_characters: z.number(),
        queued: z.boolean(),
        scheduled_at: z.string(),
        scheduler_trigger_url: z.string(),
        content_factory_url: z.string()
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false,
        idempotentHint: true
      },
      _meta: {
        ...oauthMeta,
        "openai/fileParams": ["image"],
        "openai/toolInvocation/invoking": "Передаю комплект в Контент-завод…",
        "openai/toolInvocation/invoked": "Материал передан в Контент-завод"
      }
    },
    async (args) => {
      if (!hasScope(access, "content.write")) {
        return mcpError("Подключению не хватает права content.write.");
      }

      const store = loadStore();
      const user = store.users.find((item) => item.id === access.sub);
      if (!user) return mcpError("Аккаунт «Контент-завода» не найден.");
      const workspaceUser = resolveWorkspaceUser(store, user);
      const storedUser = store.users.find((item) => item.id === workspaceUser.id);
      if (!storedUser) return mcpError("Рабочее пространство не найдено.");
      markChatGptActivity(store, storedUser, "import_content_package");
      saveStore(store);

      const workspace = sanitizeWorkspace(storedUser.workspace || {});
      const requestId = cleanText(args.request_id, 120);
      const scheduledAutomationRequest = /^motor-port-telegram-\d{8}-\d{4}-msk$/.test(requestId);
      const autoPublish = args.content_format === "telegram"
        && (Boolean(args.auto_publish) || scheduledAutomationRequest);
      const existing = workspace.ideas.find(
        (item) => item.source === "chatgpt-app" && item.sourceRequestId === requestId
      );
      if (existing) {
        const existingContent = existing.formats?.[args.content_format]
          || existing.formats?.dzen
          || existing.formats?.telegram
          || {};
        const totalCharacters = [
          existingContent.headline,
          existingContent.body,
          existingContent.tags
        ].filter(Boolean).join("\n\n").length;
        if (autoPublish && totalCharacters > 4096) {
          return mcpError(`Публикация длиннее лимита Telegram: ${totalCharacters} из 4096 знаков.`);
        }
        let queuedPost = workspace.queue.find(
          (item) => item.sourceIdeaId === existing.id && item.platform === "telegram"
        );
        if (autoPublish && !queuedPost) {
          const scheduledAt = new Date().toISOString();
          queuedPost = {
            id: `q_${existing.id}`,
            projectId: workspace.activeProjectId,
            sourceIdeaId: existing.id,
            platform: "telegram",
            contentFormat: "telegram",
            title: plainPublicationHeadline(existingContent.headline || existing.title || ""),
            body: plainPublicationText(existingContent.body || ""),
            tags: plainPublicationText(existingContent.tags || ""),
            mediaId: existing.mediaId || "",
            status: "scheduled",
            state: "Запланировано",
            publishDate: scheduledAt.slice(0, 10),
            publishTime: scheduledAt.slice(11, 16),
            scheduledAt
          };
          workspace.queue = [queuedPost, ...workspace.queue].slice(0, 300);
          storedUser.workspace = sanitizeWorkspace(workspace);
          storedUser.queue = storedUser.workspace.queue;
        }
        markChatGptActivity(store, storedUser, "import_content_package", true);
        saveStore(store);
        const structuredContent = {
          ok: true,
          duplicate: true,
          draft_id: String(existing.id),
          headline: String(existingContent.headline || existing.title || ""),
          image_saved: Boolean(existing.mediaId),
          telegram_ready: totalCharacters <= 4096,
          total_characters: totalCharacters,
          queued: Boolean(queuedPost),
          scheduled_at: queuedPost?.scheduledAt || "",
          scheduler_trigger_url: autoPublish && queuedPost
            ? cleanText(createTelegramSchedulerTriggerUrl(), 2000)
            : "",
          content_factory_url: `${baseUrl}/`
        };
        return {
          structuredContent,
          content: [{ type: "text", text: "Этот комплект уже был сохранён — дубль не создан." }]
        };
      }

      const headline = plainPublicationHeadline(args.headline);
      const body = plainPublicationText(args.body);
      const tags = plainPublicationText(args.tags || "");
      const contentFormat = args.content_format === "telegram" ? "telegram" : "dzen";
      if (!headline || !body) return mcpError("После очистки разметки заголовок или текст оказался пустым.");
      const totalCharacters = [headline, body, tags].filter(Boolean).join("\n\n").length;
      if (autoPublish && totalCharacters > 4096) {
        return mcpError(`Публикация длиннее лимита Telegram: ${totalCharacters} из 4096 знаков.`);
      }

      let mediaItem = null;
      let savedPath = "";
      try {
        if (args.image?.download_url) {
          const downloaded = await downloadChatGptImage(
            args.image.download_url,
            maxImageBytes
          );
          const extension = extensionForMime(downloaded.mimeType);
          const fileId = `${workspaceUser.id}_chatgpt_${Date.now()}_${crypto.randomBytes(5).toString("hex")}${extension}`;
          savedPath = path.join(uploadsDir, fileId);
          fs.writeFileSync(savedPath, downloaded.buffer);
          mediaItem = {
            id: fileId,
            name: safeMediaName(args.image.file_name, headline, extension),
            type: downloaded.mimeType,
            size: downloaded.buffer.length,
            url: `${baseUrl}/uploads/${encodeURIComponent(fileId)}`,
            source: "chatgpt-app",
            sourceFileId: cleanText(args.image.file_id, 300),
            createdAt: new Date().toISOString()
          };
        }

        const draftId = `chatgpt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const content = {
          format: contentFormat === "dzen" ? "Статья для Дзена" : "Пост для Telegram",
          headline,
          body,
          tags
        };
        const idea = {
          id: draftId,
          title: headline,
          angle: "Подготовлено в ChatGPT",
          score: "",
          pillar: "ChatGPT",
          status: "Готово к проверке",
          source: "chatgpt-app",
          sourceRequestId: requestId,
          mediaId: mediaItem?.id || "",
          createdAt: new Date().toISOString(),
          formats: {
            dzen: {
              ...content,
              format: "Статья для Дзена"
            },
            telegram: {
              ...content,
              format: "Пост для Telegram"
            }
          }
        };

        let queuedPost = null;
        if (autoPublish) {
          const scheduledAt = new Date().toISOString();
          queuedPost = {
            id: `q_${draftId}`,
            projectId: workspace.activeProjectId,
            sourceIdeaId: draftId,
            platform: "telegram",
            contentFormat: "telegram",
            title: headline,
            body,
            tags,
            mediaId: mediaItem?.id || "",
            mediaUrl: mediaItem?.url || "",
            mediaType: mediaItem?.type || "",
            status: "scheduled",
            state: "Запланировано",
            publishDate: scheduledAt.slice(0, 10),
            publishTime: scheduledAt.slice(11, 16),
            scheduledAt
          };
          workspace.queue = [queuedPost, ...workspace.queue].slice(0, 300);
        }

        workspace.ideas = [
          idea,
          ...workspace.ideas.filter((item) => item.id !== draftId)
        ].slice(0, 50);
        if (mediaItem) {
          workspace.media = [
            mediaItem,
            ...workspace.media.filter((item) => item.id !== mediaItem.id)
          ].slice(0, 300);
        }
        workspace.selectedIdeaId = draftId;
        workspace.selectedMediaId = mediaItem?.id || "";
        workspace.activePlatform = contentFormat;
        workspace.logs = [
          {
            id: `log_${Date.now()}`,
            type: "good",
            time: new Date().toISOString(),
            text: autoPublish
              ? "Материал импортирован из ChatGPT и поставлен в очередь Telegram"
              : "Комплект импортирован из ChatGPT",
            meta: mediaItem ? "Текст и изображение" : "Только текст"
          },
          ...workspace.logs
        ].slice(0, 120);

        storedUser.workspace = sanitizeWorkspace(workspace);
        storedUser.queue = storedUser.workspace.queue;
        storedUser.updatedAt = new Date().toISOString();
        markChatGptActivity(store, storedUser, "import_content_package", true);
        saveStore(store);

        const structuredContent = {
          ok: true,
          duplicate: false,
          draft_id: draftId,
          headline,
          image_saved: Boolean(mediaItem),
          telegram_ready: totalCharacters <= 4096,
          total_characters: totalCharacters,
          queued: Boolean(queuedPost),
          scheduled_at: queuedPost?.scheduledAt || "",
          scheduler_trigger_url: autoPublish && queuedPost
            ? cleanText(createTelegramSchedulerTriggerUrl(), 2000)
            : "",
          content_factory_url: `${baseUrl}/`
        };

        return {
          structuredContent,
          content: [{
            type: "text",
            text: autoPublish
              ? "Текст сохранён и поставлен в очередь публикации Telegram."
              : mediaItem
                ? "Текст и изображение сохранены в «Контент-заводе» как черновик."
                : "Текст сохранён в «Контент-заводе» как черновик без изображения."
          }]
        };
      } catch (error) {
        if (savedPath && fs.existsSync(savedPath)) {
          try {
            fs.unlinkSync(savedPath);
          } catch {
            // Не маскируем основную ошибку импорта.
          }
        }
        return mcpError(`Не удалось сохранить комплект: ${error.message}`);
      }
    }
  );

  return server;
}

export function attachChatGptApp(app, options) {
  const {
    rootDir,
    appSecret,
    publicBaseUrl,
    uploadsDir,
    maxUploadMb,
    authLimiter,
    oauthAuthorizeLimiter,
    oauthTokenLimiter,
    loadStore,
    saveStore,
    verifyPassword,
    ensureDemoUser,
    demoEmail,
    demoPassword,
    clientDemoEmail,
    clientSharedWorkspace,
    sanitizeWorkspace,
    plainPublicationHeadline,
    plainPublicationText,
    createTelegramSchedulerTriggerUrl = () => "",
    baseUrlFromRequest
  } = options;

  const oauthTemplate = fs.readFileSync(path.join(rootDir, "oauth-login.html"), "utf8");
  const fallbackLimiter = authLimiter || ((req, res, next) => next());
  const authorizeLimiter = oauthAuthorizeLimiter || fallbackLimiter;
  const tokenLimiter = oauthTokenLimiter || fallbackLimiter;
  const configuredBaseUrl = normalizeBaseUrl(publicBaseUrl);
  const maxImageBytes = Math.min(Math.max(1, Number(maxUploadMb) || 20), 20) * 1024 * 1024;

  const baseForRequest = (req) => (
    configuredBaseUrl || normalizeBaseUrl(baseUrlFromRequest(req))
  );

  const resolveWorkspaceUser = (store, user) => {
    const isClient = user.email === clientDemoEmail;
    if (isClient && clientSharedWorkspace) {
      return store.users.find((item) => item.email === demoEmail) || user;
    }
    return user;
  };

  const authenticateContentFactoryUser = async (emailRaw, passwordRaw) => {
    const email = cleanText(emailRaw, 120).toLowerCase();
    const password = String(passwordRaw || "");
    const store = loadStore();

    if (demoEmail && demoPassword && email === demoEmail && password === demoPassword) {
      const result = await ensureDemoUser(
        store,
        demoEmail,
        demoPassword,
        "kubik-admin-id"
      );
      if (result.changed) saveStore(store);
    }

    const refreshedStore = loadStore();
    const user = refreshedStore.users.find((item) => item.email === email);
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    return valid ? { user, store: refreshedStore } : null;
  };

  const resourceMetadataUrl = (req) => (
    `${baseForRequest(req)}/.well-known/oauth-protected-resource`
  );

  const sendOauthChallenge = (req, res) => {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl(req)}", scope="${OAUTH_SCOPES.join(" ")}"`
    );
    return res.status(401).json({
      error: "authorization_required",
      error_description: "Подключи аккаунт «Контент-завода» через OAuth."
    });
  };

  app.get("/oauth.css", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(path.join(rootDir, "oauth.css"));
  });

  app.get([
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp"
  ], (req, res) => {
    const baseUrl = baseForRequest(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      resource: `${baseUrl}${MCP_PATH}`,
      authorization_servers: [baseUrl],
      scopes_supported: OAUTH_SCOPES,
      resource_documentation: `${baseUrl}/`
    });
  });

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const baseUrl = baseForRequest(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      client_id_metadata_document_supported: true,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: OAUTH_SCOPES
    });
  });

  app.get("/oauth/authorize", (req, res) => {
    const baseUrl = baseForRequest(req);
    try {
      const params = parseAuthorizeParams(req.query, baseUrl);
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(renderOauthPage(oauthTemplate, params));
    } catch (error) {
      res.status(400)
        .type("html")
        .send(renderOauthPage(oauthTemplate, {}, error.message));
    }
  });

  app.post("/oauth/authorize", authorizeLimiter, async (req, res) => {
    const baseUrl = baseForRequest(req);
    let params;
    try {
      params = parseAuthorizeParams(req.body, baseUrl);
      const authenticated = await authenticateContentFactoryUser(
        req.body?.email,
        req.body?.password
      );
      if (!authenticated) {
        return res.status(401)
          .type("html")
          .send(renderOauthPage(
            oauthTemplate,
            params,
            "Неверный логин или пароль от «Контент-завода»."
          ));
      }

      const code = crypto.randomBytes(32).toString("base64url");
      const now = Date.now();
      const store = authenticated.store;
      store.oauthCodes = (Array.isArray(store.oauthCodes) ? store.oauthCodes : [])
        .filter((item) => Number(item.expiresAt || 0) > now)
        .slice(-49);
      store.oauthCodes.push({
        codeHash: crypto.createHash("sha256").update(code).digest("base64url"),
        userId: authenticated.user.id,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        resource: params.resource,
        scopes: params.scopes,
        expiresAt: now + OAUTH_CODE_TTL_MS
      });
      saveStore(store);

      const callback = new URL(params.redirectUri);
      callback.searchParams.set("code", code);
      if (params.state) callback.searchParams.set("state", params.state);
      return res.redirect(302, callback.toString());
    } catch (error) {
      return res.status(400)
        .type("html")
        .send(renderOauthPage(oauthTemplate, params || {}, error.message));
    }
  });

  app.post("/oauth/token", tokenLimiter, (req, res) => {
    const baseUrl = baseForRequest(req);
    const canonicalResource = `${baseUrl}${MCP_PATH}`;
    const grantType = cleanText(req.body?.grant_type, 80);
    res.setHeader("Cache-Control", "no-store");

    if (grantType === "authorization_code") {
      const code = cleanText(req.body?.code, 300);
      const codeHash = crypto.createHash("sha256").update(code).digest("base64url");
      const now = Date.now();
      const store = loadStore();
      const storedIndex = (Array.isArray(store.oauthCodes) ? store.oauthCodes : [])
        .findIndex((item) => item.codeHash === codeHash);
      const stored = storedIndex >= 0 ? store.oauthCodes[storedIndex] : null;
      store.oauthCodes = (Array.isArray(store.oauthCodes) ? store.oauthCodes : [])
        .filter((item, index) => (
          index !== storedIndex && Number(item.expiresAt || 0) > now
        ));
      saveStore(store);

      if (!stored || stored.expiresAt <= Date.now()) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Код входа истёк или уже использован."
        });
      }

      const clientId = cleanText(req.body?.client_id, 2000);
      const redirectUri = cleanText(req.body?.redirect_uri, 2000);
      const resource = cleanText(req.body?.resource, 2000) || canonicalResource;
      const verifier = cleanText(req.body?.code_verifier, 256);
      const challenge = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");

      if (
        clientId !== stored.clientId
        || redirectUri !== stored.redirectUri
        || resource !== stored.resource
        || challenge !== stored.codeChallenge
      ) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "PKCE-проверка или параметры подключения не совпали."
        });
      }

      if (!store.users.some((item) => item.id === stored.userId)) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Аккаунт больше не существует."
        });
      }

      const connectedUser = store.users.find((item) => item.id === stored.userId);
      const connectedAt = new Date().toISOString();
      connectedUser.settings = {
        ...(connectedUser.settings || {}),
        chatgptConnectedAt: connectedUser.settings?.chatgptConnectedAt || connectedAt
      };
      connectedUser.updatedAt = connectedAt;
      saveStore(store);

      const tokenArgs = {
        userId: stored.userId,
        clientId,
        resource,
        scopes: stored.scopes,
        secret: appSecret
      };
      return res.json({
        access_token: issueAccessToken(tokenArgs),
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        refresh_token: issueRefreshToken(tokenArgs),
        scope: stored.scopes.join(" ")
      });
    }

    if (grantType === "refresh_token") {
      const refresh = verifyOpaqueToken(req.body?.refresh_token, appSecret);
      const clientId = cleanText(req.body?.client_id, 2000);
      const resource = cleanText(req.body?.resource, 2000) || canonicalResource;
      if (
        refresh?.typ !== "oauth_refresh"
        || refresh.clientId !== clientId
        || refresh.aud !== resource
      ) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Refresh token недействителен."
        });
      }

      const store = loadStore();
      if (!store.users.some((item) => item.id === refresh.sub)) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Аккаунт больше не существует."
        });
      }

      const scopes = normalizeScopes(refresh.scope);
      const tokenArgs = {
        userId: refresh.sub,
        clientId,
        resource,
        scopes,
        secret: appSecret
      };
      return res.json({
        access_token: issueAccessToken(tokenArgs),
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        refresh_token: issueRefreshToken(tokenArgs),
        scope: scopes.join(" ")
      });
    }

    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Поддерживаются authorization_code и refresh_token."
    });
  });

  app.options(MCP_PATH, (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    res.status(204).end();
  });

  app.all(MCP_PATH, async (req, res) => {
    const baseUrl = baseForRequest(req);
    const authorization = String(req.headers.authorization || "");
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const access = verifyOpaqueToken(accessToken, appSecret);
    if (
      access?.typ !== "oauth_access"
      || access.aud !== `${baseUrl}${MCP_PATH}`
      || !access.sub
    ) {
      return sendOauthChallenge(req, res);
    }

    const store = loadStore();
    const accessUser = store.users.find((item) => item.id === access.sub);
    if (!accessUser) {
      return sendOauthChallenge(req, res);
    }
    const workspaceUser = resolveWorkspaceUser(store, accessUser);
    const storedUser = store.users.find((item) => item.id === workspaceUser.id);
    if (!storedUser) return sendOauthChallenge(req, res);
    const lastMcpAt = new Date().toISOString();
    storedUser.settings = {
      ...(storedUser.settings || {}),
      chatgptConnectedAt: storedUser.settings?.chatgptConnectedAt || lastMcpAt,
      chatgptLastMcpAt: lastMcpAt
    };
    storedUser.updatedAt = lastMcpAt;
    saveStore(store);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    res.setHeader("Cache-Control", "no-store");

    const mcpServer = createContentFactoryMcpServer({
      access,
      baseUrl,
      loadStore,
      saveStore,
      resolveWorkspaceUser,
      sanitizeWorkspace,
      plainPublicationHeadline,
      plainPublicationText,
      createTelegramSchedulerTriggerUrl,
      uploadsDir,
      maxImageBytes
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[ChatGPT App] MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Внутренняя ошибка Content Factory MCP"
          },
          id: null
        });
      }
    }
  });
}
