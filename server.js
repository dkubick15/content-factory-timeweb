import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import http from "http";
import https from "https";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { attachChatGptApp } from "./chatgpt-app.js";

// Timeweb-контейнер может получать IPv6-адрес Telegram API без рабочего
// IPv6-маршрута. Предпочитаем IPv4, чтобы публикация не падала с fetch failed.
dns.setDefaultResultOrder("ipv4first");

dotenv.config();
dotenv.config({ path: "timeweb-env-ready.env" });

function loadPackedEnvVariable(name) {
  const raw = process.env[name];
  if (!raw) return;

  const parsed = dotenv.parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadPackedEnvVariable("logi");
loadPackedEnvVariable("LOGI");
loadPackedEnvVariable("TIMEWEB_ENV");

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '8080';


const APP_BUILD = "2026-07-21-telegram-direct-check-v52";
const TELEGRAM_RELAY_URL = (
  process.env.TELEGRAM_RELAY_URL
  || "https://motorports-telegram-relay.rabotarecldm.chatgpt.site"
).replace(/\/+$/, "");
const TELEGRAM_BROWSER_SCHEDULER_URL = (
  process.env.TELEGRAM_BROWSER_SCHEDULER_URL
  || "https://motorports-telegram-relay.rabotarecldm.chatgpt.site"
).replace(/\/+$/, "");
const TELEGRAM_SCHEDULER_URL = (
  process.env.TELEGRAM_SCHEDULER_URL
  || "https://telegram-relay.motorport-dvs.ru"
).replace(/\/+$/, "");
const TELEGRAM_API_BASE_URL = (
  process.env.TELEGRAM_API_BASE_URL
  || "https://api.telegram.org"
).replace(/\/+$/, "");
const TELEGRAM_PUBLISH_MODE = String(process.env.TELEGRAM_PUBLISH_MODE || "external").trim().toLowerCase();
const TELEGRAM_EXTERNAL_SCHEDULER = TELEGRAM_PUBLISH_MODE !== "direct";
const TELEGRAM_SCHEDULED_STATUS = TELEGRAM_EXTERNAL_SCHEDULER ? "scheduled_relay" : "scheduled_local";
const externalTelegramSchedulerState = {
  lastAttemptAt: "",
  lastSuccessAt: "",
  lastError: "",
  lastProcessed: 0
};

function extractJwt(value) {
  const text = String(value || "").trim();
  const match = text.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  return match ? match[0] : "";
}

function extractUuid(value) {
  const text = String(value || "").trim();
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : "";
}

function resolveTimewebEnv() {
  const apiKey = extractJwt(process.env.TIMEWEB_API_KEY || process.env.TIMEWEB_KEY);
  const agentId = extractUuid(process.env.TIMEWEB_AGENT_ID || process.env.AGENT_ID);
  return {
    apiKey,
    apiKeySource: apiKey ? (process.env.TIMEWEB_API_KEY ? "TIMEWEB_API_KEY" : "TIMEWEB_KEY") : "missing",
    agentId,
    agentIdSource: agentId ? (process.env.TIMEWEB_AGENT_ID ? "TIMEWEB_AGENT_ID" : "AGENT_ID") : "missing"
  };
}

process.on("uncaughtException", (err) => {
  console.error("КРИТИЧЕСКАЯ ОШИБКА ПРИ СТАРТЕ:", err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

const app = express();
const PORT = safeNumber(process.env.PORT, 8080);

const DEFAULT_AI_MODEL = process.env.DEFAULT_MODEL || process.env.DEFAULT_AI_MODEL || "timeweb-agent";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const SCHEDULER_BASE_URL = (
  process.env.SCHEDULER_BASE_URL
  || PUBLIC_BASE_URL
  || "https://cf-kubik.twc1.net"
).replace(/\/+$/, "");
const MAX_UPLOAD_MB = safeNumber(process.env.MAX_UPLOAD_MB, 200);
const AI_TIMEOUT_MS = safeNumber(process.env.AI_TIMEOUT_MS, 300000);
const AI_MAX_TOKENS = safeNumber(process.env.AI_MAX_TOKENS, 8000);
const DEMO_EMAIL = normalizeEmail(process.env.DEMO_EMAIL || "kubik");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "kubik";
const CLIENT_DEMO_EMAIL = normalizeEmail(process.env.CLIENT_DEMO_EMAIL);
const CLIENT_DEMO_PASSWORD = process.env.CLIENT_DEMO_PASSWORD || "";
const TEST_DEMO_EMAIL = normalizeEmail(process.env.TEST_DEMO_EMAIL);
const TEST_DEMO_PASSWORD = process.env.TEST_DEMO_PASSWORD || "";
const ENABLE_DEMO_LOGIN = process.env.ENABLE_DEMO_LOGIN !== "false";
const CLIENT_SHARED_WORKSPACE = process.env.CLIENT_SHARED_WORKSPACE !== "false";
const CLIENT_DAILY_GENERATION_LIMIT = safeNumber(process.env.CLIENT_DAILY_GENERATION_LIMIT, 5);
const DEBUG_HEALTH = process.env.DEBUG_HEALTH === "true";
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const AUTH_RATE_LIMIT_WINDOW_MS = safeNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = safeNumber(process.env.AUTH_RATE_LIMIT_MAX, 20);
const AI_RATE_LIMIT_WINDOW_MS = safeNumber(process.env.AI_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000);
const AI_RATE_LIMIT_MAX = safeNumber(process.env.AI_RATE_LIMIT_MAX, 60);
const PUBLISH_RATE_LIMIT_WINDOW_MS = safeNumber(process.env.PUBLISH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const PUBLISH_RATE_LIMIT_MAX = safeNumber(process.env.PUBLISH_RATE_LIMIT_MAX, 60);
const SCHEDULER_INTERVAL_MS = Math.max(1000, safeNumber(process.env.SCHEDULER_INTERVAL_MS, 60 * 1000));

// YouTube OAuth2 config (Google Cloud Console)
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";

const TIMEWEB_ENV = resolveTimewebEnv();
const TIMEWEB_API_KEY = TIMEWEB_ENV.apiKey;
const TIMEWEB_AGENT_ID = TIMEWEB_ENV.agentId;

const runsInsideAppContainer = process.cwd() === "/app";
const defaultDataDir = runsInsideAppContainer
  ? "/app/data"
  : path.join(process.cwd(), "data");
const envDataDir = process.env.DATA_DIR || "";
let DATA_DIR = envDataDir || defaultDataDir;

function tryInitStorage(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
    const testFile = path.join(dir, ".write-test");
    fs.writeFileSync(testFile, String(Date.now()));
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    console.error(`[Storage Init] Directory ${dir} is not writable:`, error.message);
    return false;
  }
}

if (!tryInitStorage(DATA_DIR)) {
  console.warn(`[Storage Warning] Failed to initialize primary DATA_DIR: ${DATA_DIR}. Attempting fallback to temp directory...`);
  const fallbackDir = path.join("/tmp", "content-factory-data");
  if (tryInitStorage(fallbackDir)) {
    DATA_DIR = fallbackDir;
    console.log(`[Storage Success] Successfully fell back to writable temp directory: ${DATA_DIR}`);
  } else {
    console.error(`[Storage Critical] Failed to write to fallback temp directory as well. Exiting.`);
    process.exit(1);
  }
}

const usersFile = path.join(DATA_DIR, "users.json");
const uploadsDir = path.join(DATA_DIR, "uploads");

// Автоматическая генерация и сохранение надежного секрета сессий при первом запуске
// ВНИМАНИЕ: никогда не используем временный/небезопасный секрет — иначе токены можно подделать.
let APP_SECRET = process.env.APP_SECRET;
if (!APP_SECRET) {
  const secretFile = path.join(DATA_DIR, "secret.key");
  try {
    if (fs.existsSync(secretFile)) {
      APP_SECRET = fs.readFileSync(secretFile, "utf8").trim();
    } else {
      APP_SECRET = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(secretFile, APP_SECRET, "utf8");
    }
  } catch (e) {
    console.warn("[APP_SECRET] Не удалось использовать secret.key в DATA_DIR:", e.message);
    console.warn("[APP_SECRET] Генерируем временный сессионный секрет для запуска...");
    APP_SECRET = crypto.randomBytes(32).toString("hex");
  }
}

if (!APP_SECRET) {
  APP_SECRET = crypto.randomBytes(32).toString("hex");
} else if (APP_SECRET.length < 32) {
  console.warn(`[APP_SECRET] Предупреждение: заданный APP_SECRET слишком короткий (${APP_SECRET.length} симв.). Хэшируем его для безопасности.`);
  APP_SECRET = crypto.createHash("sha256").update(APP_SECRET).digest("hex");
}

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean)
  : process.env.NODE_ENV === "production" ? false : true;
const oauthFormActionOrigin = (() => {
  try {
    return new URL(PUBLIC_BASE_URL || SCHEDULER_BASE_URL).origin;
  } catch {
    return "https://cf-kubik.twc1.net";
  }
})();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:"],
      connectSrc: ["'self'", TELEGRAM_BROWSER_SCHEDULER_URL],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      // Разрешаем отправку формы на наш OAuth endpoint и последующий
      // официальный redirect ChatGPT после успешного входа.
      formAction: ["'self'", oauthFormActionOrigin, "https://chatgpt.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Слишком много попыток входа. Подожди немного и попробуй снова." }
});

const oauthAuthorizeLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "Слишком много неудачных попыток подключения. Подожди немного и попробуй снова."
  }
});

const oauthTokenLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: Math.max(AUTH_RATE_LIMIT_MAX * 6, 120),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "Слишком много неудачных обменов OAuth-токена. Запусти подключение заново."
  }
});

const aiLimiter = rateLimit({
  windowMs: AI_RATE_LIMIT_WINDOW_MS,
  limit: AI_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много запросов к ИИ. Подожди немного и попробуй снова." }
});

const publishLimiter = rateLimit({
  windowMs: PUBLISH_RATE_LIMIT_WINDOW_MS,
  limit: PUBLISH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много запросов на публикацию или загрузку. Подожди немного и попробуй снова." }
});

function isLimitedDemoEmail(email) {
  const normalized = normalizeEmail(email);
  return [CLIENT_DEMO_EMAIL, TEST_DEMO_EMAIL]
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(normalized);
}

function debugLog(...args) {
  if (DEBUG_LOGS) console.log(...args);
}

for (const iconFile of [
  "favicon.ico",
  "favicon.png",
  "favicon-32x32.png",
  "favicon-16x16.png",
  "apple-touch-icon.png"
]) {
  app.get(`/${iconFile}`, (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(__dirname, iconFile));
  });
}

for (const assetFile of ["style.css", "script.js"]) {
  app.get(`/${assetFile}`, (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(__dirname, assetFile));
  });
}

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeRegex = /^(image|video)\//i;
    const allowedExts = [
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
      ".mp4", ".mov", ".avi", ".webm", ".mkv", ".mpeg", ".mpg", ".3gp"
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();
    const isMimeValid = allowedMimeRegex.test(file.mimetype || "");
    const isExtValid = allowedExts.includes(ext);

    if (isMimeValid && isExtValid) {
      cb(null, true);
    } else {
      cb(new Error("Недопустимый тип файла. Разрешены только изображения и видео."));
    }
  }
});

function baseUrlFromRequest(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${proto}://${req.get("host")}`;
}

function loadStore() {
  try {
    if (!fs.existsSync(usersFile)) return { users: [], oauthCodes: [] };
    const raw = fs.readFileSync(usersFile, "utf8");
    const data = JSON.parse(raw || "{}");
    return {
      users: Array.isArray(data.users) ? data.users : [],
      oauthCodes: Array.isArray(data.oauthCodes) ? data.oauthCodes : []
    };
  } catch (error) {
    console.error("Ошибка чтения users.json:", error);
    try {
      if (fs.existsSync(usersFile)) {
        const brokenFile = `${usersFile}.broken-${Date.now()}`;
        fs.copyFileSync(usersFile, brokenFile);
        console.error("Поврежденный users.json сохранен как:", brokenFile);
      }
    } catch (backupError) {
      console.error("Не удалось сохранить копию поврежденного users.json:", backupError.message);
    }
    return { users: [], oauthCodes: [] };
  }
}

function saveStore(store) {
  const tmp = `${usersFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, usersFile);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidLogin(login) {
  return /^[a-z0-9._-]{3,80}$/i.test(login);
}

function cleanText(value, maxLength = 2000) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function cleanOptionalText(value, maxLength = 2000) {
  if (value === undefined || value === null) return undefined;
  return cleanText(value, maxLength);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrivateIp(address) {
  const value = String(address || "").trim().toLowerCase();
  if (!value) return true;

  if (value.startsWith("::ffff:")) {
    return isPrivateIp(value.slice(7));
  }

  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (net.isIPv6(value)) {
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb")
    );
  }

  return true;
}

async function assertPublicHttpUrl(rawUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("Укажи полную ссылку, например https://site.ru");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Ссылка должна начинаться с http:// или https://");
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Локальные адреса нельзя импортировать.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Не удалось определить адрес сайта.");
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error("Локальные и служебные адреса нельзя импортировать.");
  }

  return parsedUrl;
}

function publicDnsLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
        throw new Error("Локальные и служебные адреса нельзя импортировать.");
      }

      if (options?.all) {
        callback(null, addresses);
        return;
      }

      const address = options?.family
        ? addresses.find((item) => item.family === Number(options.family))
        : addresses[0];
      if (!address) {
        throw new Error("Не удалось определить публичный адрес сайта.");
      }
      callback(null, address.address, address.family);
    })
    .catch((error) => callback(error));
}

function requestPublicPage(parsedUrl, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const request = transport.get(parsedUrl, {
      headers: {
        "User-Agent": "ContentFactoryBot/1.0",
        Accept: "text/html,text/plain;q=0.9"
      },
      lookup: publicDnsLookup,
      timeout: 15000
    }, (response) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers.location || "";
      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ redirect: location });
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Сайт не открылся: HTTP ${status || "unknown"}`));
        return;
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
        response.resume();
        reject(new Error("По ссылке нет HTML-страницы с текстом."));
        return;
      }

      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > maxBytes) {
        response.resume();
        reject(new Error("Страница слишком большая для импорта."));
        return;
      }

      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error("Страница слишком большая для импорта."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({ html: Buffer.concat(chunks).toString("utf8") });
      });
      response.on("error", reject);
    });

    request.on("timeout", () => {
      request.destroy(new Error("Сайт не ответил вовремя."));
    });
    request.on("error", reject);
  });
}

async function fetchPublicHtml(rawUrl) {
  let currentUrl = await assertPublicHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await requestPublicPage(currentUrl);

    if (response.redirect !== undefined) {
      const location = response.redirect;
      if (!location || redirectCount === 3) {
        throw new Error("Сайт отправляет по слишком длинной цепочке перенаправлений.");
      }
      currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl).toString());
      continue;
    }

    return {
      html: response.html,
      url: currentUrl.toString()
    };
  }

  throw new Error("Не удалось открыть сайт.");
}

function validateAuthBody(body = {}, mode = "login") {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (mode === "register" && !isValidEmail(email)) {
    return { error: "Укажи нормальный email." };
  }

  if (mode === "login" && !isValidEmail(email) && !isValidLogin(email)) {
    return { error: "Укажи email или логин." };
  }

  if (mode === "register" && password.length < 6) {
    return { error: "Пароль должен быть минимум 6 символов." };
  }

  if (mode === "login" && !password) {
    return { error: "Укажи пароль." };
  }

  return { email, password };
}

function validateConfigBody(body = {}) {
  const allowed = {
    telegramBotToken: 120,
    telegramChatId: 160,
    telegramSchedulerAccessToken: 500,
    instagramAccessToken: 600,
    instagramUserId: 160
  };
  const output = {};

  for (const [key, maxLength] of Object.entries(allowed)) {
    const value = cleanOptionalText(body[key], maxLength);
    if (value !== undefined) output[key] = value;
  }

  return output;
}

function uploadPathFromUrl(fileUrl) {
  const raw = String(fileUrl || "");
  if (!raw) return "";

  let filename = "";
  try {
    const parsed = new URL(raw, PUBLIC_BASE_URL || "http://localhost");
    filename = decodeURIComponent(path.basename(parsed.pathname));
  } catch {
    filename = decodeURIComponent(path.basename(raw.split("?")[0]));
  }

  if (!filename || filename.includes("/") || filename.includes("\\")) return "";
  const localPath = path.resolve(uploadsDir, filename);
  const root = path.resolve(uploadsDir) + path.sep;
  return localPath.startsWith(root) ? localPath : "";
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(String(password), salt, 120000, 32, "sha256", (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, expected] = String(stored || "").split(":");
    if (!salt || !expected) return resolve(false);

    crypto.pbkdf2(String(password), salt, 120000, 32, "sha256", (err, derivedKey) => {
      if (err) return reject(err);
      const actual = derivedKey.toString("hex");
      const a = Buffer.from(actual, "hex");
      const b = Buffer.from(expected, "hex");
      resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
    });
  });
}

function encryptionKey() {
  return crypto.createHash("sha256").update(APP_SECRET).digest();
}

function encryptSecret(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!raw.startsWith("enc:v1:")) return raw;

  try {
    const [, , ivRaw, tagRaw, encryptedRaw] = raw.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Ошибка расшифровки секрета:", error.message);
    return "";
  }
}

function defaultUserSettings() {
  return {
    openaiApiKeyEnc: "",
    model: DEFAULT_AI_MODEL,
    telegramBotTokenEnc: "",
    telegramChatId: "",
    telegramSchedulerAccessTokenEnc: "",
    // Instagram Graph API
    instagramAccessTokenEnc: "",
    instagramUserId: "",
    // YouTube OAuth2
    youtubeRefreshTokenEnc: "",
    youtubeChannelId: "",
    chatgptConnectedAt: "",
    chatgptLastMcpAt: "",
    chatgptLastToolAt: "",
    chatgptLastToolName: "",
    chatgptLastImportAt: ""
  };
}

function getPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}

function getUserSettingsForServer(user) {
  const settings = { ...defaultUserSettings(), ...(user.settings || {}) };
  return {
    openaiApiKey: TIMEWEB_API_KEY,
    model: settings.model || DEFAULT_AI_MODEL,
    telegramBotToken: decryptSecret(settings.telegramBotTokenEnc) || process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || (TELEGRAM_EXTERNAL_SCHEDULER ? "@motorports" : ""),
    telegramSchedulerAccessToken: decryptSecret(settings.telegramSchedulerAccessTokenEnc)
      || process.env.TELEGRAM_SITES_ACCESS_TOKEN
      || "",
    instagramAccessToken: decryptSecret(settings.instagramAccessTokenEnc) || "",
    instagramUserId: settings.instagramUserId || "",
    youtubeRefreshToken: decryptSecret(settings.youtubeRefreshTokenEnc) || "",
    youtubeChannelId: settings.youtubeChannelId || "",
    chatgptConnectedAt: settings.chatgptConnectedAt || "",
    chatgptLastMcpAt: settings.chatgptLastMcpAt || "",
    chatgptLastToolAt: settings.chatgptLastToolAt || "",
    chatgptLastToolName: settings.chatgptLastToolName || "",
    chatgptLastImportAt: settings.chatgptLastImportAt || ""
  };
}

function getUserSettingsForClient(user) {
  const serverSettings = getUserSettingsForServer(user);

  const maskKey = (key) => {
    if (!key) return "";
    if (key.length <= 8) return "***";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  return {
    openaiApiKey: maskKey(serverSettings.openaiApiKey),
    model: serverSettings.model,
    telegramBotToken: maskKey(serverSettings.telegramBotToken),
    telegramChatId: serverSettings.telegramChatId,
    telegramSchedulerAccessToken: maskKey(serverSettings.telegramSchedulerAccessToken),
    instagramAccessToken: maskKey(serverSettings.instagramAccessToken),
    instagramUserId: serverSettings.instagramUserId,
    instagramReady: Boolean(serverSettings.instagramAccessToken && serverSettings.instagramUserId),
    youtubeConnected: Boolean(serverSettings.youtubeRefreshToken),
    youtubeChannelId: serverSettings.youtubeChannelId,
    youtubeOAuthEnabled: Boolean(YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET),
    chatgptConnectedAt: serverSettings.chatgptConnectedAt,
    chatgptLastMcpAt: serverSettings.chatgptLastMcpAt,
    chatgptLastToolAt: serverSettings.chatgptLastToolAt,
    chatgptLastToolName: serverSettings.chatgptLastToolName,
    chatgptLastImportAt: serverSettings.chatgptLastImportAt
  };
}

let resolvedTimewebAgentId = "";

async function resolveTimewebAgentId(apiKey, agentId) {
  const rawAgentId = String(agentId || "").trim();
  if (!rawAgentId) return rawAgentId;
  if (resolvedTimewebAgentId) return resolvedTimewebAgentId;

  // Timeweb management API returns both an internal numeric id and access_id.
  // The call endpoint expects access_id, so we resolve common wrong values once.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAgentId)) {
    resolvedTimewebAgentId = rawAgentId;
    return resolvedTimewebAgentId;
  }

  try {
    const response = await fetch("https://api.timeweb.cloud/api/v1/cloud-ai/agents", {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });
    if (!response.ok) return rawAgentId;

    const data = await response.json();
    const agents = Array.isArray(data?.agents) ? data.agents : [];
    const found = agents.find((agent) => {
      const id = String(agent.id || "");
      const accessId = String(agent.access_id || "");
      const name = String(agent.name || "");
      return rawAgentId === id || rawAgentId === accessId || rawAgentId === name || rawAgentId.includes(name);
    });

    if (found?.access_id) {
      resolvedTimewebAgentId = String(found.access_id);
      return resolvedTimewebAgentId;
    }
  } catch (error) {
    console.warn("Не удалось получить access_id агента Timeweb:", error.message);
  }

  return rawAgentId;
}

async function callTimewebAgentApi(apiKey, agentId, payload, options = {}) {
  const activeAgentId = await resolveTimewebAgentId(apiKey, agentId);
  const url = `https://api.timeweb.cloud/api/v1/cloud-ai/agents/${encodeURIComponent(activeAgentId)}/call`;
  const messages = payload.messages || [];

  // Собираем системные инструкции и пользовательский промпт в единый текст для агента
  let combinedPrompt = "";
  for (const msg of messages) {
    if (msg.role === "system") {
      combinedPrompt += `[Системная инструкция]\n${msg.content}\n\n`;
    } else if (msg.role === "user") {
      combinedPrompt += `[Запрос пользователя]\n${msg.content}\n`;
    } else {
      combinedPrompt += `${msg.content}\n`;
    }
  }

  const body = {
    message: combinedPrompt
  };

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  const fetchPromise = fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body)
  }).then(async (response) => {
    const errText = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(errText);
    } catch {
      parsedData = { error: { message: errText } };
    }

    if (!response.ok) {
      throw new Error(parsedData?.error?.message || parsedData?.message || `Ошибка API Timeweb (${response.status})`);
    }
    return parsedData;
  });

  const data = await withTimeout(
    fetchPromise,
    AI_TIMEOUT_MS,
    `Timeweb Cloud AI Agent (${agentId})`
  );

  const text = data?.message || "";
  if (!text) {
    throw new Error("Timeweb Cloud AI Agent не вернул текстовый ответ");
  }

  return {
    completion: {
      choices: [
        {
          message: {
            content: text
          }
        }
      ]
    },
    provider: "Timeweb Cloud AI Agent",
    model: activeAgentId
  };
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", APP_SECRET)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(body)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createUserToken(user) {
  return signToken({
    sub: user.id,
    email: user.email,
    role: "user",
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14
  });
}

async function ensureDemoUser(store, email, password, id) {
  let user = store.users.find((item) => item.email === email);
  let changed = false;

  if (!user) {
    user = {
      id,
      email,
      passwordHash: await hashPassword(password),
      settings: defaultUserSettings(),
      createdAt: new Date().toISOString()
    };
    store.users.push(user);
    changed = true;
  } else {
    const isCorrect = await verifyPassword(password, user.passwordHash);
    if (!isCorrect) {
      user.passwordHash = await hashPassword(password);
      user.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  return { user, changed };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);

  if (!payload?.sub) {
    return res.status(401).json({
      error: "Нет доступа. Войди заново."
    });
  }

  const store = loadStore();
  const user = store.users.find((item) => item.id === payload.sub);

  if (!user) {
    return res.status(401).json({
      error: "Аккаунт не найден. Войди заново."
    });
  }

  req.user = user;
  req.store = store;

  // Редирект рабочего пространства для гостевого/клиентского входа
  const isClient = user.email === CLIENT_DEMO_EMAIL;
  if (isClient && CLIENT_SHARED_WORKSPACE) {
    const adminUser = store.users.find((item) => item.email === DEMO_EMAIL);
    if (adminUser) {
      req.workspaceUser = adminUser;
    } else {
      req.workspaceUser = user;
    }
  } else {
    req.workspaceUser = user;
  }

  next();
}

function enforceGenerationLimit(req, res, next) {
  // Лимит применяется только к тестовым демо-аккаунтам. Только ПРОВЕРКА:
  // само списание делаем в consumeGenerationLimit() после успешного результата,
  // чтобы неудачные/отвалившиеся по таймауту попытки не съедали дневной лимит.
  if (req.user && isLimitedDemoEmail(req.user.email)) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const dbUser = req.store.users.find((u) => u.id === req.user.id);
    if (dbUser) {
      // Очищаем старые метки времени
      dbUser.generationTimestamps = (dbUser.generationTimestamps || []).filter((t) => t > oneDayAgo);

      if (dbUser.generationTimestamps.length >= CLIENT_DAILY_GENERATION_LIMIT) {
        return res.status(429).json({
          error: `Превышен суточный лимит генераций. Демо-аккаунт ограничен ${CLIENT_DAILY_GENERATION_LIMIT} генерациями в день.`
        });
      }
    }
  }
  next();
}

// Списываем одну генерацию с дневного лимита демо-аккаунта.
// Вызывать строго перед успешным res.json в обработчиках /api/generate,
// /api/refine и /api/generate-image.
function consumeGenerationLimit(req) {
  if (req.user && isLimitedDemoEmail(req.user.email)) {
    const dbUser = req.store.users.find((u) => u.id === req.user.id);
    if (dbUser) {
      dbUser.generationTimestamps = dbUser.generationTimestamps || [];
      dbUser.generationTimestamps.push(Date.now());
      saveStore(req.store);
    }
  }
}

function getLimitInfo(req) {
  const info = {
    limit: CLIENT_DAILY_GENERATION_LIMIT,
    remaining: CLIENT_DAILY_GENERATION_LIMIT,
    isUnlimited: true
  };

  if (req.user && isLimitedDemoEmail(req.user.email)) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const dbUser = req.store.users.find((u) => u.id === req.user.id);
    if (dbUser) {
      dbUser.generationTimestamps = (dbUser.generationTimestamps || []).filter((t) => t > oneDayAgo);
      info.remaining = Math.max(0, CLIENT_DAILY_GENERATION_LIMIT - dbUser.generationTimestamps.length);
      info.isUnlimited = false;
    }
  }

  return info;
}

function stripAiReasoning(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

function plainPublicationText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/```(?:[a-z0-9_-]+)?\s*/gi, "")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2")
    .split("\n")
    .map((line) => line
      .replace(/^\s*#{1,6}\s+(?=\S)/, "")
      .replace(/^\s*#{2,6}(?=\S)/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^(\s*)[*+]\s+/, "$1• ")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/~~([^~\n]+)~~/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainPublicationHeadline(value) {
  return plainPublicationText(value)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeClarification(text) {
  const value = String(text || "").toLowerCase();
  return (
    value.includes("please provide") ||
    value.includes("could you please") ||
    value.includes("i need to clarify") ||
    value.includes("нужно уточнить") ||
    value.includes("подскажите") ||
    value.includes("не хватает информации") ||
    value.includes("уточните") ||
    value.includes("задайте вопрос")
  );
}

function buildFallbackImagePrompt(originalText) {
  const source = cleanText(originalText, 1200);
  return [
    "Реалистичная редакционная фотография по теме материала ниже.",
    "Покажи главный предмет, процесс или ситуацию из исходного текста без выдуманных брендов, цифр, документов и обещаний.",
    "Естественный свет, правдоподобная среда, спокойная коммерческая композиция, без ощущения случайного стока.",
    "Без текста, логотипов, водяных знаков и коллажей.",
    "",
    `Тема материала: ${source}`
  ].join("\n");
}

function tryParseJson(value) {
  if (!value) return null;

  let text = stripAiReasoning(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const attempts = [
    text,
    text.replace(/,\s*([}\]])/g, "$1"),
    text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch { }
  }

  return null;
}

function balancedJsonCandidates(text) {
  const source = stripAiReasoning(text);
  const candidates = [];
  const openers = new Set(["{", "["]);
  const closers = { "{": "}", "[": "]" };

  for (let start = 0; start < source.length; start++) {
    const first = source[start];
    if (!openers.has(first)) continue;

    const stack = [closers[first]];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < source.length; i++) {
      const ch = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (openers.has(ch)) {
        stack.push(closers[ch]);
        continue;
      }

      if (ch === stack[stack.length - 1]) {
        stack.pop();
        if (!stack.length) {
          candidates.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function extractJson(text) {
  const cleaned = stripAiReasoning(text);

  const direct = tryParseJson(cleaned);
  if (direct) return direct;

  const fencedBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const block of fencedBlocks) {
    const parsed = tryParseJson(block);
    if (parsed) return parsed;
  }

  for (const candidate of balancedJsonCandidates(cleaned)) {
    const parsed = tryParseJson(candidate);
    if (parsed) return parsed;
  }

  // Regex bracket matcher repair fallback
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = tryParseJson(match[0]);
    if (parsed) return parsed;
  }

  throw new Error("AI вернул не JSON. Сервер не нашёл JSON-объект в ответе модели.");
}

function safeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(100, Math.round(number)));
}

function normalizeIdeas(data) {
  const ideas = Array.isArray(data)
    ? data
    : Array.isArray(data?.ideas)
      ? data.ideas
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.contentIdeas)
          ? data.contentIdeas
          : [];

  return ideas.map((item, index) => {
    const title = plainPublicationHeadline(item.title || item.hook || item.headline || item.name || `Идея ${index + 1}`);
    const angle = plainPublicationHeadline(item.angle || item.type || "ИИ-угол");
    const score = safeScore(item.score, 90 - index);
    const pillar = plainPublicationHeadline(item.pillar || item.category || item.rubric || "Контент");
    const rawFormats = item.formats || {};
    const rawTelegram = rawFormats.telegram || item.telegram || {};
    const rawDzen = rawFormats.dzen || item.dzen || item.article || {};
    const body = plainPublicationText(item.body || item.text || item.description || item.explanation || "");
    const tags = plainPublicationText(item.tags || "");

    const formats = {
      dzen: {
        format: plainPublicationHeadline(rawDzen.format || "SEO-статья"),
        headline: plainPublicationHeadline(rawDzen.headline || rawDzen.title || title),
        body: plainPublicationText(rawDzen.body || rawDzen.text || body || title),
        tags: plainPublicationText(rawDzen.tags || tags || "")
      },
      telegram: {
        format: plainPublicationHeadline(rawTelegram.format || "Инфо-пост"),
        headline: plainPublicationHeadline(rawTelegram.headline || rawTelegram.title || title),
        body: plainPublicationText(rawTelegram.body || rawTelegram.text || body || title),
        tags: plainPublicationText(rawTelegram.tags || tags || "")
      }
    };

    return {
      title,
      angle,
      score,
      pillar,
      status: "Готово",
      formats
    };
  }).filter((item) => item.title && item.title !== "Идея");
}

function uniqueTexts(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = item.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PROJECT_FIELD_DEFINITIONS = [
  ["name", "Название проекта", 180],
  ["niche", "Ниша", 240],
  ["offer", "Что продвигаем / оффер", 1000],
  ["price", "Цена / вилка цен", 500],
  ["timelines", "Сроки", 500],
  ["warranty", "Гарантии", 500],
  ["geo", "Гео / регион", 500],
  ["landingPage", "Сайт / посадочная страница", 500],
  ["audience", "Сегменты аудитории", 1000],
  ["awareness", "Стадия осознанности: Холодный / Теплый / Горячий", 120],
  ["pain", "Главная боль аудитории", 1000],
  ["fear", "Главное возражение / страх", 500],
  ["reason", "Почему не покупают сейчас", 500],
  ["proof", "Факты и доказательства", 1500],
  ["facts", "Кейсы / отзывы / результаты", 2000],
  ["goal", "Цель контента", 500],
  ["nextStep", "Следующий шаг", 500],
  ["leadMagnet", "Лид-магнит", 500],
  ["tone", "Тон общения", 500],
  ["stopWords", "Стоп-слова", 500],
  ["competitors", "Конкуренты / альтернативы", 700],
  ["advantages", "Преимущества", 1000],
  ["details", "Тема для ближайшей генерации", 1000]
];

function normalizeProjectPatch(data = {}) {
  const patch = {};
  for (const [key, , maxLength] of PROJECT_FIELD_DEFINITIONS) {
    if (data[key] === undefined || data[key] === null) continue;
    patch[key] = cleanText(data[key], maxLength);
  }
  if (patch.awareness && !["Холодный", "Теплый", "Горячий"].includes(patch.awareness)) {
    patch.awareness = "Теплый";
  }
  return patch;
}

function projectBriefTemplate({ project = {}, template = {}, ideaCount = 3 } = {}) {
  const selectedFormat = template?.name || "выбранный формат контента";
  const selectedGoal = template?.goal || project.goal || "получить заявки";
  const formatNote = template?.briefAdd || template?.formatNote || "Опиши, какой материал нужен и какой результат должен получить читатель.";

  return [
    `Задача: сгенерировать ${ideaCount} варианта контента под формат "${selectedFormat}".`,
    `Цель: ${selectedGoal}.`,
    "",
    "1. Проект и ниша:",
    `- Название проекта: ${project.name || ""}`,
    `- Ниша: ${project.niche || ""}`,
    `- Гео: ${project.geo || ""}`,
    `- Сайт / посадочная: ${project.landingPage || ""}`,
    "",
    "2. Что продвигаем:",
    `- Оффер: ${project.offer || ""}`,
    `- Цена / вилка: ${project.price || ""}`,
    `- Сроки: ${project.timelines || ""}`,
    `- Гарантии: ${project.warranty || ""}`,
    "",
    "3. Клиент:",
    `- Кто покупает: ${project.audience || ""}`,
    `- Стадия готовности: ${project.awareness || "Теплый"}`,
    `- Главная боль: ${project.pain || ""}`,
    `- Главное возражение: ${project.fear || ""}`,
    `- Почему откладывают покупку: ${project.reason || ""}`,
    "",
    "4. Доказательства:",
    `- Факты, цифры, документы, гарантия: ${project.proof || ""}`,
    `- Кейсы, отзывы, результаты: ${project.facts || ""}`,
    `- Чем отличаемся от конкурентов: ${project.advantages || ""}`,
    "",
    "5. Действие:",
    `- Что должен сделать человек после материала: ${project.nextStep || ""}`,
    `- Лид-магнит / безопасное обещание: ${project.leadMagnet || ""}`,
    "",
    "6. Тон и ограничения:",
    `- Тон: ${project.tone || "уверенно, по-человечески, без воды"}`,
    `- Не использовать: ${project.stopWords || "уникальный, качественный, профессиональный, надежный"}`,
    "",
    "7. Детали для этой генерации:",
    `- Тема: ${project.details || ""}`,
    `- Требования к формату: ${formatNote}`,
    "",
    "Важно: не придумывать факты, цены и гарантии. Если данных нет, писать аккуратно без выдуманных цифр."
  ].join("\n");
}

function projectFieldsPrompt(sourceText, sourceLabel) {
  const schema = PROJECT_FIELD_DEFINITIONS
    .map(([key, label]) => `- "${key}": ${label}`)
    .join("\n");

  return [
    "Разбери вводные по бизнесу и верни строго JSON-объект для заполнения базы проекта.",
    "Пиши только те поля, которые можно уверенно извлечь или аккуратно сформулировать из исходника.",
    "Не придумывай цены, гарантии, сроки, кейсы и цифры, если их нет в тексте.",
    "Для пустых данных верни пустую строку.",
    "Поле awareness должно быть только: Холодный, Теплый или Горячий.",
    "",
    "Поля JSON:",
    schema,
    "",
    `Источник: ${sourceLabel}`,
    sourceText,
    "",
    "Верни строго JSON без пояснений."
  ].join("\n");
}

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackIdeasFromText(text, ideaCount, project = {}) {
  let titles = [];

  if (text && !looksLikeClarification(text)) {
    const cleaned = stripAiReasoning(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[{}\[\]"]/g, " ")
      .replace(/\r/g, "\n");

    const rawLines = cleaned
      .split(/\n+/)
      .map((line) => line
        .replace(/^\s*(?:[-*•]|\d+[.)]|#+)\s*/g, "")
        .replace(/^(title|headline|hook|идея|хук|заголовок)\s*[:\u2014-]\s*/i, "")
        .trim())
      .filter((line) => line.length >= 12 && line.length <= 180)
      .filter((line) => !/^(json|формат|rules|правила|```)/i.test(line));

    titles = uniqueTexts(rawLines).slice(0, ideaCount);
  }
  const seed = [
    project.pain ? `Почему ${project.pain} и где бизнес теряет деньги` : "Почему контент не приводит заявки",
    project.offer ? `Как работает связка: ${project.offer}` : "Как собрать контент, который ведёт к заявке",
    project.common ? `Главная ошибка в теме: ${project.common}` : "Главная ошибка в воронке контента",
    project.proof ? `Что доказывает результат: ${project.proof}` : "Какие доказательства нужны аудитории перед заявкой",
    project.audience ? `Что важно показать аудитории: ${project.audience}` : "Что показать клиенту до первого контакта"
  ];

  const finalTitles = uniqueTexts([...titles, ...seed]).slice(0, Math.max(1, Math.min(ideaCount, 20)));

  return finalTitles.map((title, index) => {
    const proofItems = [project.proof, project.facts].filter(Boolean);
    const nextStep = project.nextStep || project.leadMagnet || "";
    const articleBody = [
      title,
      "",
      project.pain ? `В материале разберём проблему: ${project.pain}.` : "В материале разберём тему по шагам и отделим подтверждённые факты от предположений.",
      "",
      "Что важно понять до выбора решения",
      project.offer
        ? `Рассматриваем решение: ${project.offer}.`
        : "Сначала зафиксируй исходную задачу, ограничения и критерии выбора. Не подменяй их общими обещаниями.",
      "",
      proofItems.length ? "Что можно подтвердить" : "Какие данные нужно проверить",
      ...(proofItems.length
        ? proofItems.map((item) => `• ${item}`)
        : [
          "• условия и ограничения",
          "• реальные сроки и стоимость",
          "• примеры и документы, которые можно показать читателю"
        ]),
      "",
      "Вывод",
      nextStep
        ? nextStep
        : "Перед публикацией дополни черновик фактами из проекта и сформулируй безопасный следующий шаг для читателя."
    ].join("\n");

    return {
      title,
      angle: index % 2 ? "Разбор ошибки" : "Боль клиента",
      score: 90 - index,
      pillar: project.common || "Контент",
      status: "Черновик — проверь факты",
      formats: {
        dzen: {
          format: "SEO-статья",
          headline: title,
          body: articleBody,
          tags: ""
        },
        telegram: {
          format: "Инфо-пост",
          headline: title,
          body: articleBody,
          tags: ""
        }
      }
    };
  });
}

function defaultWorkspace() {
  return {
    activeProjectId: "motor-port",
    activePlatform: "dzen",
    activeTemplateId: "telegram-reach",
    selectedIdeaId: "",
    selectedMediaId: "",
    planner: {
      placement: "Telegram",
      goal: "получить охват, доверие и целевые обращения",
      reason: "Полезный материал отвечает на дорогой вопрос автовладельца и даёт понятный критерий выбора.",
      formatNote: "Plain text без Markdown. Один материал раскрывает один вопрос и заканчивается естественным следующим шагом."
    },
    projects: [
      {
        id: "motor-port",
        name: "Motor Port",
        briefText: "Продажа и установка контрактных двигателей. Подбираем совместимый ДВС, проверяем его до оплаты, оформляем документы и отвечаем за результат установки.",
        niche: "Продажа, подбор и установка контрактных двигателей (ДВС)",
        offer: "Подбор, проверка и установка контрактного ДВС под ключ с документами и гарантией",
        landingPage: "https://motorport-dvs.ru/",
        audience: "Автовладельцы, у которых двигатель вышел из строя или возник риск дорогого капитального ремонта",
        awareness: "Проблема уже осознана: нужно решить, ремонтировать двигатель или менять, найти совместимый исправный ДВС и безопасно установить",
        pain: "Нужно срочно вернуть автомобиль в работу, но сложно проверить состояние и совместимость двигателя, понять документы и определить, кто отвечает после установки",
        fear: "Купить неисправный или несовместимый двигатель, потерять деньги на раздельной покупке и установке, остаться без понятной ответственности по гарантии",
        proof: "Проверка эндоскопом, замер компрессии, проверка поддона на металл, контроль давления масла, фото- и видеоотчёт, ДКП, ГТД и зафиксированные условия гарантии",
        facts: "В базе более 7000 двигателей и более 30 поставщиков",
        goal: "Охват целевой аудитории, доверие к экспертизе Motor Port и обращения за подбором двигателя",
        nextStep: "Предложить проверить совместимость, наличие и стоимость двигателя под конкретный автомобиль",
        tone: "Экспертно, честно, спокойно и прозрачно",
        common: "Не обещать идеальный двигатель без диагностики, не пугать искусственно и не перечислять все преимущества компании в каждом материале",
        advantages: "Один подрядчик отвечает за подбор, проверку и установку; состояние двигателя проверяется до оплаты; клиент получает документы и фото- или видеоотчёт",
        details: "Практические посты о дорогих ошибках при выборе ДВС, диагностике до оплаты, совместимости, документах, гарантии и выборе между ремонтом и заменой",
        status: "активный"
      }
    ],
    ideas: [],
    media: [],
    queue: [],
    logs: [],
    critic: null
  };
}

function sanitizeWorkspace(input = {}) {
  const base = defaultWorkspace();
  const workspace = {
    activeProjectId: String(input.activeProjectId || base.activeProjectId),
    activePlatform: ["dzen", "telegram"].includes(input.activePlatform)
      ? input.activePlatform
      : base.activePlatform,
    activeTemplateId: cleanText(input.activeTemplateId || base.activeTemplateId, 120),
    selectedIdeaId: String(input.selectedIdeaId || ""),
    selectedMediaId: String(input.selectedMediaId || ""),
    planner: {
      ...base.planner,
      ...(input.planner && typeof input.planner === "object" ? input.planner : {})
    },
    projects: Array.isArray(input.projects) && input.projects.length ? input.projects : base.projects,
    ideas: Array.isArray(input.ideas) ? input.ideas.slice(0, 50) : [],
    media: Array.isArray(input.media) ? input.media.slice(0, 300) : [],
    queue: Array.isArray(input.queue) ? input.queue.slice(0, 300) : [],
    logs: Array.isArray(input.logs) ? input.logs.slice(0, 120) : [],
    critic: isPlainObject(input.critic)
      ? {
        ...input.critic,
        critique: plainPublicationText(input.critic.critique || ""),
        improvementsMade: plainPublicationText(input.critic.improvementsMade || "")
      }
      : null
  };

  workspace.ideas = workspace.ideas.map((idea) => {
    const formats = isPlainObject(idea?.formats)
      ? Object.fromEntries(
        Object.entries(idea.formats).map(([key, content]) => [
          key,
          {
            ...(isPlainObject(content) ? content : {}),
            format: plainPublicationHeadline(content?.format || ""),
            headline: plainPublicationHeadline(content?.headline || content?.title || ""),
            body: plainPublicationText(content?.body || content?.text || ""),
            tags: plainPublicationText(content?.tags || "")
          }
        ])
      )
      : {};

    return {
      ...idea,
      title: plainPublicationHeadline(idea?.title || ""),
      angle: plainPublicationHeadline(idea?.angle || ""),
      pillar: plainPublicationHeadline(idea?.pillar || ""),
      formats
    };
  });

  workspace.queue = workspace.queue.map((post) => {
    const media = workspace.media.find((item) => item.id && item.id === post.mediaId) || {};
    const publishDate = post.publishDate || datePartServer(post.scheduledAt);
    const publishTime = post.publishTime || timePartServer(post.scheduledAt);
    const contentFormat = post.contentFormat || (post.platform === "dzen" ? "dzen" : "telegram");
    const platform = "telegram";
    const sourceStatus = post.status || (post.state === "Опубликовано" ? "published" : TELEGRAM_SCHEDULED_STATUS);
    const normalizedStatus = sourceStatus === "ready" ? TELEGRAM_SCHEDULED_STATUS : sourceStatus;
    const status = ["scheduled", "scheduled_local", "scheduled_relay"].includes(normalizedStatus)
      ? TELEGRAM_SCHEDULED_STATUS
      : normalizedStatus;
    return {
      ...post,
      id: String(post.id || crypto.randomUUID()),
      platform,
      contentFormat: ["dzen", "telegram"].includes(contentFormat) ? contentFormat : "telegram",
      title: plainPublicationHeadline(post.title || ""),
      body: plainPublicationText(post.body || ""),
      tags: plainPublicationText(post.tags || ""),
      status,
      state: statusLabel(status),
      publishDate,
      publishTime,
      scheduledAt: post.scheduledAt || [publishDate, publishTime].filter(Boolean).join("T"),
      mediaUrl: post.mediaUrl || media.url || "",
      mediaType: post.mediaType || media.type || ""
    };
  });

  return workspace;
}

function datePartServer(value) {
  return String(value || "").slice(0, 10);
}

function timePartServer(value) {
  const text = String(value || "");
  return text.includes("T") ? text.split("T")[1]?.slice(0, 5) || "" : "";
}

function statusLabel(status) {
  const map = {
    draft: "Черновик",
    ready: "Готово к публикации",
    scheduled: "Запланировано",
    scheduled_local: "Запланировано",
    scheduled_relay: "Запланировано",
    publishing: "Публикуется",
    published: "Опубликовано",
    error: "Ошибка"
  };
  return map[status] || "Запланировано";
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} не ответил за ${Math.round(ms / 1000)} секунд. Попробуй запустить ещё раз.`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getHealthPayload() {
  const hasTimeweb = Boolean(TIMEWEB_API_KEY && TIMEWEB_AGENT_ID);

  const payload = {
    ok: true,
    service: "content-factory-backend",
    appBuild: APP_BUILD,
    mode: hasTimeweb ? "private-timeweb-agent" : "timeweb-agent-not-configured",
    maxUploadMb: MAX_UPLOAD_MB,
    aiTimeoutMs: AI_TIMEOUT_MS,
    provider: "Timeweb Cloud AI Agent",
    timeweb: hasTimeweb,
    demoLoginEnabled: ENABLE_DEMO_LOGIN
  };

  if (DEBUG_HEALTH) {
    const store = loadStore();
    payload.users = store.users.length;
    payload.agent = hasTimeweb ? TIMEWEB_AGENT_ID : "";
    payload.env = {
      keyFound: Boolean(TIMEWEB_API_KEY),
      keySource: TIMEWEB_ENV.apiKeySource || "",
      agentFound: Boolean(TIMEWEB_AGENT_ID),
      agentSource: TIMEWEB_ENV.agentIdSource || "",
      hasLogi: Boolean(process.env.logi || process.env.LOGI),
      hasTimewebApiKey: Boolean(process.env.TIMEWEB_API_KEY)
    };
    payload.node = process.version;
    payload.port = PORT;
    payload.dataDir = DATA_DIR;
  }

  return payload;
}

app.get(["/api/health", "/health", "/healthz"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (req.query.json === "true" || (req.headers.accept && req.headers.accept.includes("application/json"))) {
    return res.json(getHealthPayload());
  }
  res.type("text/plain").status(200).send("ok");
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const auth = validateAuthBody(req.body, "register");
  if (auth.error) return res.status(400).json({ error: auth.error });
  const { email, password } = auth;

  const store = loadStore();
  if (store.users.some((user) => user.email === email)) {
    return res.status(409).json({ error: "Такой аккаунт уже есть. Войди через форму входа." });
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    settings: defaultUserSettings(),
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  saveStore(store);

  res.json({
    ok: true,
    token: createUserToken(user),
    user: getPublicUser(user)
  });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const auth = validateAuthBody(req.body, "login");
  if (auth.error) return res.status(400).json({ error: auth.error });
  const { email, password } = auth;
  const store = loadStore();

  if (ENABLE_DEMO_LOGIN) {
    let demoChanged = false;

    if (DEMO_EMAIL && DEMO_PASSWORD && email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      const result = await ensureDemoUser(store, DEMO_EMAIL, DEMO_PASSWORD, "kubik-admin-id");
      demoChanged = demoChanged || result.changed;
    } else if (CLIENT_DEMO_EMAIL && CLIENT_DEMO_PASSWORD && email === CLIENT_DEMO_EMAIL && password === CLIENT_DEMO_PASSWORD) {
      const result = await ensureDemoUser(store, CLIENT_DEMO_EMAIL, CLIENT_DEMO_PASSWORD, "client-demo-id");
      demoChanged = demoChanged || result.changed;
    } else if (TEST_DEMO_EMAIL && TEST_DEMO_PASSWORD && email === TEST_DEMO_EMAIL && password === TEST_DEMO_PASSWORD) {
      const result = await ensureDemoUser(store, TEST_DEMO_EMAIL, TEST_DEMO_PASSWORD, "test-demo-2-id");
      demoChanged = demoChanged || result.changed;
    }

    if (demoChanged) {
      saveStore(store);
    }
  }

  const user = store.users.find((item) => item.email === email);

  const isPasswordCorrect = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !isPasswordCorrect) {
    return res.status(401).json({
      error: "Неверный email или пароль"
    });
  }

  res.json({
    ok: true,
    token: createUserToken(user),
    user: getPublicUser(user)
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: getPublicUser(req.user)
  });
});

app.get("/api/config", requireAuth, (req, res) => {
  const settings = getUserSettingsForClient(req.workspaceUser);
  const telegramSchedulerReady = TELEGRAM_EXTERNAL_SCHEDULER
    || Boolean(settings.telegramBotToken && settings.telegramChatId);
  const chatgptMcpUrl = `${baseUrlFromRequest(req)}/mcp`;

  res.json({
    ok: true,
    user: getPublicUser(req.user),
    openaiReady: Boolean(settings.openaiApiKey),
    telegramReady: telegramSchedulerReady,
    telegramSchedulerReady,
    telegramManagedExternally: TELEGRAM_EXTERNAL_SCHEDULER,
    telegramSchedulerIntervalMinutes: 1,
    chatgptAppReady: true,
    chatgptConnected: Boolean(settings.chatgptConnectedAt || settings.chatgptLastMcpAt),
    chatgptMcpUrl,
    instagramReady: settings.instagramReady,
    youtubeConnected: settings.youtubeConnected,
    youtubeOAuthEnabled: settings.youtubeOAuthEnabled,
    maxUploadMb: MAX_UPLOAD_MB,
    limitInfo: getLimitInfo(req),
    ...settings
  });
});

app.get("/api/workspace", requireAuth, (req, res) => {
  const workspace = sanitizeWorkspace(req.workspaceUser.workspace || {
    projects: req.workspaceUser.projects,
    ideas: req.workspaceUser.ideas,
    media: req.workspaceUser.media,
    queue: req.workspaceUser.queue
  });

  res.json({
    ok: true,
    workspace,
    limitInfo: getLimitInfo(req),
    openaiReady: Boolean(TIMEWEB_API_KEY)
  });
});

app.put("/api/workspace", requireAuth, (req, res) => {
  try {
    const user = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (!user) return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });

    if (!isPlainObject(req.body?.workspace)) {
      return res.status(400).json({ error: "Не передано рабочее пространство." });
    }

    const workspace = sanitizeWorkspace(req.body?.workspace || {});
    user.workspace = workspace;
    user.queue = workspace.queue;
    user.updatedAt = new Date().toISOString();
    saveStore(req.store);

    res.json({
      ok: true,
      workspace
    });
  } catch (error) {
    console.error("workspace save error:", error);
    res.status(500).json({ error: "Не удалось сохранить рабочее пространство: " + error.message });
  }
});

app.post("/api/queue", requireAuth, (req, res) => {
  try {
    const user = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (!user) return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });

    const workspace = sanitizeWorkspace(user.workspace || {});
    const post = sanitizeWorkspace({
      ...workspace,
      queue: [req.body?.post || {}]
    }).queue[0];

    workspace.queue = [post, ...workspace.queue.filter((item) => item.id !== post.id)].slice(0, 300);
    user.workspace = workspace;
    user.queue = workspace.queue;
    user.updatedAt = new Date().toISOString();
    saveStore(req.store);

    res.json({
      ok: true,
      post,
      queue: workspace.queue
    });
  } catch (error) {
    console.error("queue save error:", error);
    res.status(500).json({ error: "Не удалось сохранить публикацию: " + error.message });
  }
});

app.post("/api/config", requireAuth, (req, res) => {
  const {
    telegramBotToken,
    telegramChatId,
    telegramSchedulerAccessToken,
    instagramAccessToken,
    instagramUserId
  } = validateConfigBody(req.body || {});

  try {
    const user = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (!user) return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });

    user.settings = { ...defaultUserSettings(), ...(user.settings || {}) };

    if (telegramBotToken !== undefined) {
      const trimmed = String(telegramBotToken).trim();
      const isMasked = trimmed.includes("...") || trimmed.includes("***");
      if (!(isMasked && user.settings.telegramBotTokenEnc)) {
        user.settings.telegramBotTokenEnc = encryptSecret(trimmed);
      }
    }

    if (telegramChatId !== undefined) {
      user.settings.telegramChatId = String(telegramChatId || "").trim();
    }

    if (telegramSchedulerAccessToken !== undefined) {
      const trimmed = String(telegramSchedulerAccessToken).trim();
      const isMasked = trimmed.includes("...") || trimmed.includes("***");
      if (!(isMasked && user.settings.telegramSchedulerAccessTokenEnc)) {
        user.settings.telegramSchedulerAccessTokenEnc = encryptSecret(trimmed);
      }
    }

    if (instagramAccessToken !== undefined) {
      const trimmed = String(instagramAccessToken).trim();
      const isMasked = trimmed.includes("...") || trimmed.includes("***");
      if (!(isMasked && user.settings.instagramAccessTokenEnc)) {
        user.settings.instagramAccessTokenEnc = encryptSecret(trimmed);
      }
    }

    if (instagramUserId !== undefined) {
      user.settings.instagramUserId = String(instagramUserId || "").trim();
    }

    user.updatedAt = new Date().toISOString();
    saveStore(req.store);

    const settings = getUserSettingsForClient(user);
    const telegramSchedulerReady = TELEGRAM_EXTERNAL_SCHEDULER
      || Boolean(settings.telegramBotToken && settings.telegramChatId);
    res.json({
      ok: true,
      user: getPublicUser(req.user),
      openaiReady: Boolean(settings.openaiApiKey),
      telegramReady: telegramSchedulerReady,
      telegramSchedulerReady,
      telegramManagedExternally: TELEGRAM_EXTERNAL_SCHEDULER,
      telegramSchedulerIntervalMinutes: 1,
      instagramReady: settings.instagramReady,
      youtubeConnected: settings.youtubeConnected,
      youtubeOAuthEnabled: settings.youtubeOAuthEnabled,
      ...settings
    });
  } catch (error) {
    console.error("Не удалось сохранить конфигурацию:", error);
    res.status(500).json({ error: "Не удалось сохранить настройки аккаунта: " + error.message });
  }
});

app.get("/api/telegram/scheduler-status", requireAuth, (req, res) => {
  res.json({
    ok: true,
    managedExternally: TELEGRAM_EXTERNAL_SCHEDULER,
    schedulerUrl: TELEGRAM_SCHEDULER_URL,
    ...externalTelegramSchedulerState
  });
});

app.get("/api/telegram/scheduler-ticket", requireAuth, publishLimiter, (req, res) => {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return res.status(503).json({
      error: "Не настроен ключ внешнего Telegram-планировщика."
    });
  }

  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", botToken)
    .update(`${timestamp}.scheduler`)
    .digest("hex");

  return res.json({
    ok: true,
    url: `${TELEGRAM_BROWSER_SCHEDULER_URL}/api/run-scheduler`,
    timestamp,
    signature,
    expiresAt: Number(timestamp) + 5 * 60 * 1000
  });
});

app.get("/api/telegram/check-connection", requireAuth, publishLimiter, async (req, res) => {
  try {
    const { telegramBotToken, telegramChatId } = getUserSettingsForServer(req.workspaceUser);
    if (!telegramBotToken || !telegramChatId) {
      return res.status(503).json({ error: "Telegram настроен не полностью" });
    }

    const response = await withTimeout(
      fetch(`${TELEGRAM_API_BASE_URL}/bot${telegramBotToken}/getMe`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ContentFactoryTelegramCheck/1.0"
        },
        cache: "no-store"
      }),
      15000,
      "Telegram"
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.description || data.error || `Telegram API: HTTP ${response.status}`);
    }

    res.json({
      ok: true,
      chatId: telegramChatId,
      botUsername: String(data.result?.username || "")
    });
  } catch (error) {
    res.status(502).json({ error: error.message || "Telegram недоступен" });
  }
});

app.post("/api/telegram/run-scheduler", requireAuth, publishLimiter, async (req, res) => {
  try {
    const result = await triggerExternalTelegramScheduler({
      sitesAccessToken: cleanOptionalText(req.body?.sitesAccessToken, 500) || ""
    });
    res.json({ ok: true, ...result, state: externalTelegramSchedulerState });
  } catch (error) {
    res.status(502).json({
      error: error.message || "Не удалось запустить Telegram-планировщик.",
      state: externalTelegramSchedulerState
    });
  }
});

app.post("/api/ai/test", requireAuth, aiLimiter, async (req, res) => {
  try {
    if (!TIMEWEB_API_KEY || !TIMEWEB_AGENT_ID) {
      return res.status(400).json({ error: "Timeweb-агент не настроен на сервере." });
    }

    const result = await callTimewebAgentApi(TIMEWEB_API_KEY, TIMEWEB_AGENT_ID, {
      messages: [
        { role: "system", content: "Ответь одним словом: OK" },
        { role: "user", content: "Проверка подключения" }
      ]
    });

    res.json({
      ok: true,
      message: "Timeweb Cloud AI Agent работает",
      provider: result.provider,
      model: result.model,
      endpoint: "timeweb",
      reply: String(result.completion.choices?.[0]?.message?.content || "").slice(0, 120)
    });
  } catch (error) {
    console.error("ai test error:", error);
    const message = String(error?.message || "Ошибка проверки подключения к AI");
    let hint = "";
    if (/API_KEY_INVALID|invalid|401|403/i.test(message)) {
      hint = "API токен Timeweb не принят. Убедись, что токен верный и активен.";
    } else if (/agent_not_found|Agent not found|404/i.test(message)) {
      hint = "Timeweb-агент не найден. Проверь TIMEWEB_AGENT_ID.";
    } else if (/не ответил за|timeout|timed out|aborted|504/i.test(message)) {
      hint = "Timeweb-агент отвечает слишком долго.";
    } else if (/Connection error|fetch/i.test(message)) {
      hint = "Сервер не смог подключиться к API Timeweb.";
    }
    res.status(500).json({ error: hint ? `${message}. ${hint}` : message });
  }
});

app.post("/api/project/brief-template", requireAuth, (req, res) => {
  const project = isPlainObject(req.body?.project) ? req.body.project : {};
  const template = isPlainObject(req.body?.template) ? req.body.template : {};
  const ideaCount = Math.max(1, Math.min(Number(req.body?.ideaCount || 3), 5));

  res.json({
    ok: true,
    brief: projectBriefTemplate({ project, template, ideaCount })
  });
});

app.post("/api/project/import-brief", requireAuth, aiLimiter, async (req, res) => {
  try {
    if (!TIMEWEB_API_KEY || !TIMEWEB_AGENT_ID) {
      return res.status(400).json({ error: "Timeweb-агент не настроен на сервере." });
    }

    const text = cleanText(req.body?.text || "", 20000);
    if (text.length < 20) {
      return res.status(400).json({ error: "Вставь бриф хотя бы на несколько строк." });
    }

    const result = await callTimewebAgentApi(TIMEWEB_API_KEY, TIMEWEB_AGENT_ID, {
      temperature: 0.15,
      max_tokens: 2500,
      messages: [
        { role: "system", content: "Ты аккуратный маркетолог-аналитик. Извлекаешь факты из брифа и возвращаешь только валидный JSON." },
        { role: "user", content: projectFieldsPrompt(text, "вставленный бриф") }
      ]
    });

    const raw = result.completion.choices?.[0]?.message?.content || "";
    const patch = normalizeProjectPatch(extractJson(raw));
    res.json({ ok: true, project: patch });
  } catch (error) {
    console.error("project import brief error:", error);
    res.status(500).json({ error: cleanText(error.message || "Не удалось разобрать бриф", 500) });
  }
});

app.post("/api/project/import-url", requireAuth, aiLimiter, async (req, res) => {
  try {
    if (!TIMEWEB_API_KEY || !TIMEWEB_AGENT_ID) {
      return res.status(400).json({ error: "Timeweb-агент не настроен на сервере." });
    }

    const rawUrl = cleanText(req.body?.url || "", 1000);
    const importedPage = await fetchPublicHtml(rawUrl);
    const html = importedPage.html;
    const pageText = cleanText(stripHtmlToText(html), 18000);
    if (pageText.length < 80) {
      return res.status(400).json({ error: "На странице мало текста для автозаполнения." });
    }

    const result = await callTimewebAgentApi(TIMEWEB_API_KEY, TIMEWEB_AGENT_ID, {
      temperature: 0.12,
      max_tokens: 3000,
      messages: [
        { role: "system", content: "Ты маркетолог-аналитик. Извлекаешь коммерческие факты с сайта и возвращаешь только валидный JSON." },
        { role: "user", content: projectFieldsPrompt(pageText, importedPage.url) }
      ]
    });

    const raw = result.completion.choices?.[0]?.message?.content || "";
    const patch = normalizeProjectPatch(extractJson(raw));
    patch.landingPage = importedPage.url;
    res.json({ ok: true, project: patch });
  } catch (error) {
    const message = cleanText(error.message || "Не удалось разобрать сайт", 500);
    const isClientError = /ссылк|адрес|локальн|служебн|HTML|страниц|сайт не открылся|перенаправлен|слишком большая/i.test(message);
    if (isClientError) debugLog("project import url rejected:", message);
    else console.error("project import url error:", error);
    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

app.post("/api/generate", requireAuth, aiLimiter, enforceGenerationLimit, async (req, res) => {
  try {
    const timewebApiKey = TIMEWEB_API_KEY;
    const timewebAgentId = TIMEWEB_AGENT_ID;

    if (!timewebApiKey || !timewebAgentId) {
      return res.status(400).json({
        error: "Timeweb-агент не настроен на сервере. Обратись к администратору сайта."
      });
    }

    const { project, settings, platform, planner, templateId } = req.body || {};
    if (!isPlainObject(project)) {
      return res.status(400).json({
        error: "Не передан project"
      });
    }

    const ideaCount = Math.max(1, Math.min(Number(settings?.ideaCount || 3), 5));
    const safeProject = {
      name: cleanText(project.name, 180),
      briefText: cleanText(project.briefText, 12000),
      niche: cleanText(project.niche || "", 240),
      offer: cleanText(project.offer || "", 1000),
      price: cleanText(project.price || "", 500),
      timelines: cleanText(project.timelines || "", 500),
      warranty: cleanText(project.warranty || "", 500),
      geo: cleanText(project.geo || "", 500),
      landingPage: cleanText(project.landingPage || "", 500),
      audience: cleanText(project.audience || "", 1000),
      awareness: cleanText(project.awareness || "", 120),
      pain: cleanText(project.pain || "", 1000),
      fear: cleanText(project.fear || "", 500),
      reason: cleanText(project.reason || "", 500),
      common: cleanText(project.common || "", 1000),
      proof: cleanText(project.proof || "", 1000),
      facts: cleanText(project.facts || "", 2000),
      goal: cleanText(project.goal || "", 500),
      nextStep: cleanText(project.nextStep || "", 500),
      leadMagnet: cleanText(project.leadMagnet || "", 500),
      tone: cleanText(project.tone || "", 240),
      stopWords: cleanText(project.stopWords || "", 500),
      competitors: cleanText(project.competitors || "", 700),
      advantages: cleanText(project.advantages || "", 1000),
      details: cleanText(project.details || "", 1000)
    };
    const safeSettings = {
      objective: cleanText(settings?.objective || "заявка", 240),
      style: cleanText(settings?.style || "коротко, по делу", 240)
    };
    const safePlanner = {
      placement: cleanText(planner?.placement || "", 120),
      publishDate: cleanText(planner?.publishDate || "", 40),
      publishTime: cleanText(planner?.publishTime || "", 40),
      goal: cleanText(planner?.goal || "", 240),
      reason: cleanText(planner?.reason || "", 1000),
      formatNote: cleanText(planner?.formatNote || "", 1000)
    };

    const platformLabel = {
      dzen: "Яндекс Дзен (SEO-статьи)",
      telegram: "Telegram-канал"
    }[platform] || "все площадки";

    let platformRequirements = "";
    let jsonSchema = "";

    if (platform === "dzen") {
      platformRequirements = [
        "- dzen.body: универсальная статья, которая сначала публикуется одним сообщением в Telegram, а затем переносится в Дзен.",
        "- Объём body: ориентир 2200–3400 знаков, чтобы заголовок, текст и теги вместе помещались в лимит Telegram 4096.",
        "- Структура: сильное введение, 3–5 смысловых блоков, конкретный вывод и безопасный следующий шаг.",
        "- Названия смысловых блоков пиши обычными строками без #, ##, ** и другой Markdown-разметки.",
        "- Списки оформляй символом «•». Не повторяй headline первой строкой body.",
        "- Вплетай поисковые формулировки естественно в headline и первые два абзаца, без переспама.",
        "- Все факты бери только из базы проекта. Не подставляй вымышленные цены, сроки, гарантии, кейсы и цифры."
      ].join("\n");
      jsonSchema = '{"ideas":[{"title":"","angle":"","score":95,"pillar":"","formats":{"dzen":{"format":"SEO-статья","headline":"","body":"","tags":""}}}]}';
    } else if (platform === "telegram") {
      platformRequirements = [
        "- telegram.body: готовый пост на 700–1800 знаков, одна сильная мысль, короткие абзацы.",
        "- Первые 2 предложения должны сразу называть ситуацию, риск, цену ошибки или неожиданный полезный вывод для целевой аудитории.",
        "- Дай конкретную пользу, проверку, наблюдение, мини-инструкцию или фрагмент внутренней кухни, который хочется сохранить или переслать.",
        "- Не используй #, ##, **, обратные кавычки и другую Markdown-разметку. Для списка используй «•».",
        "- Не повторяй headline первой строкой body. Используй не более 2 уместных эмодзи и не более 3 тематических хэштегов.",
        "- Заверши одним естественным действием: задать вопрос, узнать наличие/стоимость, сохранить, переслать или перейти по переданной ссылке."
      ].join("\n");
      jsonSchema = '{"ideas":[{"title":"","angle":"","score":95,"pillar":"","formats":{"telegram":{"format":"Инфо-пост","headline":"","body":"","tags":""}}}]}';
    } else {
      platformRequirements = [
        "- dzen.body: универсальная plain-text статья до 3400 знаков с обычными названиями смысловых блоков, фактами и безопасным следующим шагом.",
        "- telegram.body: живой plain-text пост на 700–1800 знаков с сильным первым абзацем, одной мыслью и конкретной пользой."
      ].join("\n");
      jsonSchema = '{"ideas":[{"title":"","angle":"","score":95,"pillar":"","formats":{"dzen":{"format":"SEO-статья","headline":"","body":"","tags":""},"telegram":{"format":"Инфо-пост","headline":"","body":"","tags":""}}}]}';
    }

    if (templateId === "faq-objection" && platform === "dzen") {
      platformRequirements = "- dzen.body: plain-text статья FAQ до 3400 знаков. После короткого введения дай 4–6 реальных вопросов клиента обычными строками без #, ## и Markdown, затем ответ под каждым. Каждый ответ опирается только на базу проекта. Заверши конкретным выводом и безопасным следующим шагом.";
    }

    const systemPrompt = [
      "Ты сильный контент-стратег, редактор медийных бизнес-каналов и конверсионный копирайтер на русском.",
      `Твоя задача - превращать бриф в готовые материалы только для выбранной площадки (${platformLabel}).`,
      "Пиши для конкретного человека в конкретной ситуации, а не для абстрактной аудитории.",
      "Совмещай охват и коммерческий смысл: сначала полезность, узнавание или интрига, затем доказательство, после этого естественный следующий шаг.",
      "Пиши емко, конкретно, разговорно, без воды, без англицизмов, без длинного тире и без рекламного крика.",
      "Внутри headline, body и tags запрещена Markdown-разметка: # или ## перед заголовками, **, __, обратные кавычки, markdown-ссылки. Хэштеги вида #тема разрешены только в tags.",
      "Не обещай вирусность и не используй обманный кликбейт. Заголовок обязан честно соответствовать содержанию.",
      "Не придумывай несуществующие факты. Если факта нет, используй аккуратную формулировку без цифр.",
      "Верни строго один JSON-объект. Без markdown. Без пояснений. Без вопросов пользователю.",
      "Если данных мало, не маскируй пробелы вымышленными фактами: дай полезную структуру и нейтральные объяснения только в пределах известного.",
      "Тебе КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любые вводные или пояснительные слова, задавать вопросы пользователю или просить уточнения.",
      "Если информации в брифе мало или он полностью пустой, предложи темы на основе названия проекта без неподтвержденных характеристик и обязательно верни строго валидный JSON по указанной схеме."
    ].join(" ");

    const dbFields = [
      safeProject.niche ? `- Ниша: ${safeProject.niche}` : "",
      safeProject.offer ? `- Что продвигаем / Оффер: ${safeProject.offer}` : "",
      safeProject.price ? `- Цена / вилка: ${safeProject.price}` : "",
      safeProject.timelines ? `- Сроки: ${safeProject.timelines}` : "",
      safeProject.warranty ? `- Гарантии: ${safeProject.warranty}` : "",
      safeProject.geo ? `- Гео: ${safeProject.geo}` : "",
      safeProject.landingPage ? `- Сайт / посадочная: ${safeProject.landingPage}` : "",
      safeProject.audience ? `- Целевая аудитория: ${safeProject.audience}` : "",
      safeProject.awareness ? `- Стадия осознанности: ${safeProject.awareness}` : "",
      safeProject.pain ? `- Боли и проблемы аудитории: ${safeProject.pain}` : "",
      safeProject.fear ? `- Возражения и страхи: ${safeProject.fear}` : "",
      safeProject.reason ? `- Почему не покупают сейчас: ${safeProject.reason}` : "",
      safeProject.common ? `- Что нельзя писать банально: ${safeProject.common}` : "",
      safeProject.proof ? `- Факты и доказательства: ${safeProject.proof}` : "",
      safeProject.facts ? `- Кейсы / отзывы / результаты: ${safeProject.facts}` : "",
      safeProject.nextStep ? `- Следующий шаг: ${safeProject.nextStep}` : "",
      safeProject.leadMagnet ? `- Лид-магнит: ${safeProject.leadMagnet}` : "",
      safeProject.advantages ? `- Преимущества: ${safeProject.advantages}` : "",
      safeProject.tone ? `- Тон общения: ${safeProject.tone}` : "",
      safeProject.stopWords ? `- Стоп-слова: ${safeProject.stopWords}` : ""
    ].filter(Boolean).join("\n");

    const briefTextPart = safeProject.briefText && safeProject.briefText.trim()
      ? `Общее описание брифа:\n${safeProject.briefText}`
      : "";

    let briefSection = [briefTextPart, dbFields].filter(Boolean).join("\n\n");
    if (!briefSection) {
      briefSection = "Нет подробного брифа.";
    }

    const nicheEditorialNote = /motor\s*port|двигател|д\s*в\s*с|контрактн.*мотор/i.test(
      `${safeProject.name} ${safeProject.niche} ${safeProject.offer}`
    )
      ? [
        "Редакционная логика Motor Port:",
        "• Пиши для автовладельца, у которого двигатель уже сломался или есть риск капитального ремонта. У него мало времени, высокий страх ошибки и недоверие к продавцам моторов.",
        "• Приоритетные медийные углы: дорогие ошибки при раздельной покупке и установке; как проверить ДВС до оплаты; ремонт или замена; совместимость; документы и гарантийная ответственность; разбор диагностики изнутри; мифы о контрактных моторах.",
        "• В каждом материале раскрывай один вопрос. Не перечисляй все преимущества Motor Port подряд.",
        "• Показывай экспертность через механизм: эндоскопия, компрессия, проверка стружки, давление масла, документы, фото- и видеоотчёт. Используй только те пункты, которые есть в базе проекта.",
        "• Используй формулировки, которыми реально думает автовладелец: «двигатель застучал», «есть ли стружка», «подойдёт ли мотор», «кто отвечает после установки», но не придумывай марку, модель или поломку.",
        "• Коммерческий переход делай нативно: сначала объясни риск и критерий решения, затем предложи проверить совместимость, наличие или стоимость под конкретный автомобиль."
      ].join("\n")
      : "";

    const userPrompt = [
      `Сгенерируй ровно ${ideaCount} идею/идеи для контента в формате JSON.`,
      "",
      `Проект: ${safeProject.name || ""}`,
      safeProject.details ? `ГЛАВНАЯ ТЕМА / ФОКУС ГЕНЕРАЦИИ: "${safeProject.details}"` : "ГЛАВНАЯ ТЕМА: Разработать серию качественных постов по проекту.",
      "",
      `Вводные данные проекта (База коммерческого контекста):`,
      briefSection,
      nicheEditorialNote ? `\n${nicheEditorialNote}` : "",
      "",
      `Цель: ${safeSettings.objective}`,
      `Тон: ${safeSettings.style}`,
      "",
      "План публикации:",
      `Основная площадка сейчас: ${platformLabel}`,
      `Куда публикуем: ${safePlanner.placement || platformLabel}`,
      `Дата: ${safePlanner.publishDate}`,
      `Время: ${safePlanner.publishTime}`,
      `Зачем публикуем: ${safePlanner.goal || safeSettings.objective}`,
      `Почему это должно сработать: ${safePlanner.reason}`,
      `Особые требования: ${safePlanner.formatNote}`,
      "",
      "Требования:",
      "- title: до 90 символов, конкретный сильный хук без кликбейта и без точки в конце.",
      "- angle и pillar: коротко.",
      platformRequirements,
      "- В первых 350 знаках читатель должен узнать свою ситуацию и понять, зачем читать дальше.",
      "- Один материал = одна главная мысль. Не пытайся рассказать всё о компании сразу.",
      "- Добавь минимум один подтверждённый факт, механизм проверки, критерий выбора или наблюдение из практики.",
      "- Добавь элемент пересылаемости: предупреждение о дорогой ошибке, чек-лист, понятный критерий, неожиданное сравнение или полезный вывод.",
      "- Если идей несколько, разведи их по углам: дорогая ошибка, практический выбор, внутренняя кухня/доказательство, кейс или разбор мифа. Не повторяй один сюжет.",
      "- Не превращай каждый материал в прямую рекламу. Польза и доверие должны занимать основную часть текста.",
      "- CTA должен соответствовать цели и стадии аудитории: холодной аудитории предложи сохранить/переслать/проверить, горячей - узнать наличие, стоимость или отправить данные на подбор.",
      "- Каждый формат должен быть самостоятельным, а не копией одного текста.",
      "- Учитывай выбранную площадку и не добавляй форматы других площадок.",
      "- Не используй слова: уникальный, профессиональный, качественный, надежный, индивидуальный подход.",
      "- Не используй символ длинного тире.",
      "- В headline и body не используй Markdown. Хэштеги допустимы только в tags, максимум 3.",
      "",
      `Верни строго JSON по схеме: ${jsonSchema}`,
      "Верни только валидный JSON-объект. Без markdown. Без пояснений. Без вопросов пользователю. Если данных мало, всё равно сделай рабочую версию на основе переданного текста."
    ].join("\n");

    const requestPayload = {
      temperature: 0.45,
      max_tokens: AI_MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    let aiResult;
    aiResult = await callTimewebAgentApi(timewebApiKey, timewebAgentId, requestPayload);
    const completion = aiResult.completion;
    const modelToUse = aiResult.model;
    const providerToUse = aiResult.provider;
    const text = completion.choices?.[0]?.message?.content || "";
    let ideas = [];
    let warning = "";

    try {
      const data = extractJson(text);
      ideas = normalizeIdeas(data);
    } catch (jsonError) {
      warning = "AI ответил не чистым JSON. Сервер собрал идеи из текстового ответа модели.";
      ideas = fallbackIdeasFromText(text, ideaCount, safeProject);
      console.warn("generate json fallback:", jsonError.message, String(text || "").slice(0, 800));
    }

    if (!ideas.length) {
      ideas = fallbackIdeasFromText(text || "", ideaCount, safeProject);
    }

    if (!ideas.length) {
      return res.status(500).json({
        error: "AI не вернул идеи. Попробуй другую модель или проверь настройки.",
        rawPreview: String(text || "").slice(0, 800)
      });
    }

    // --- ЭТАП 2: ВЫЗОВ AI-КРИТИКА ДЛЯ ОЦЕНКИ И ШЛИФОВКИ ПАКЕТА ---
    let finalPayload = { ideas };
    if (ideas.length > 0) {
      try {
        console.log("[AI-Critic] Запуск маркетинговой проверки контента...");

        const criticSystemPrompt = `You are a strict editor of high-reach Russian business media and a conversion copywriter.
Review the generated content as if publication quality, audience fit, forwards, saves, trust and qualified leads all matter.

Score every metric from 0 to 100:
   - "hookScore": the first 350 characters make the right reader stop without deceptive clickbait.
   - "audienceScore": the situation, language and problem precisely match the stated target audience and awareness stage.
   - "painScore": the reader's real risk or difficulty is described precisely without artificial fearmongering.
   - "retentionScore": one clear narrative line, short readable paragraphs, no repetition, useful payoff before the end.
   - "shareScore": there is a concrete warning, checklist, criterion, comparison or insight worth saving or forwarding.
   - "proofScore": only explicit project facts, mechanisms, documents, figures and trust markers are used. Punish vague claims.
   - "ctaScore": the next step is natural, low-friction and appropriate for the reader's readiness.
   - "platformScore": the text fits the requested platform and length, uses plain text, and contains no Markdown markers.
   - "reachScore": overall organic reach potential based on relevance, clarity, topical specificity and discussion value. This is an editorial estimate, never a guarantee.

Write a concise critique in Russian. Then rewrite every item scoring below 82. Preserve only facts explicitly present in the project profile. Never invent proof, results, prices, deadlines, warranties, models or customer stories.

Mandatory output rules for headline/body/tags:
- no Markdown headings (#, ##), bold markers (** or __), backticks or markdown links;
- use normal paragraph breaks and «•» for bullets;
- hashtags are allowed only in tags, maximum 3;
- do not repeat the headline at the start of body;
- output plain text strings inside valid JSON.

Output the polished JSON package in the EXACT SAME schema but add a top-level "critic" object:
"critic": {
  "hookScore": 92,
  "audienceScore": 94,
  "painScore": 92,
  "retentionScore": 91,
  "shareScore": 88,
  "proofScore": 88,
  "ctaScore": 90,
  "platformScore": 94,
  "reachScore": 90,
  "summaryScore": 92,
  "critique": "Критика маркетолога в 2-4 предложениях...",
  "improvementsMade": "Какие улучшения были внесены..."
}
Do not write any introductory or conversational text, output ONLY strictly valid JSON starting with { and ending with }.`;

        const criticUserPrompt = `
Маркетинговая база проекта:
${briefSection}

Сгенерированный пакет контента:
${JSON.stringify({ ideas }, null, 2)}

Оцени и отшлифуй этот пакет согласно системной инструкции. Верни строго JSON.`;

        const criticRequestPayload = {
          temperature: 0.25,
          max_tokens: AI_MAX_TOKENS,
          messages: [
            { role: "system", content: criticSystemPrompt },
            { role: "user", content: criticUserPrompt }
          ]
        };

        const criticAiResult = await callTimewebAgentApi(timewebApiKey, timewebAgentId, criticRequestPayload);
        const criticText = criticAiResult.completion.choices?.[0]?.message?.content || "";

        try {
          const polishedData = extractJson(criticText);
          if (polishedData && polishedData.ideas) {
            finalPayload = polishedData;
            console.log("[AI-Critic] Маркетинговая проверка завершена успешно, пакет отшлифован!");
          }
        } catch (jsonError) {
          console.warn("[AI-Critic] Критик вернул невалидный JSON, используем исходную версию:", jsonError.message);
        }
      } catch (criticError) {
        console.error("[AI-Critic] Ошибка при вызове ИИ-Критика:", criticError.message);
      }
    }

    const finalIdeas = normalizeIdeas({ ideas: finalPayload.ideas || ideas });
    const finalCritic = finalPayload.critic && isPlainObject(finalPayload.critic)
      ? {
        ...finalPayload.critic,
        critique: plainPublicationText(finalPayload.critic.critique || ""),
        improvementsMade: plainPublicationText(finalPayload.critic.improvementsMade || "")
      }
      : null;

    consumeGenerationLimit(req);
    res.json({
      ok: true,
      provider: providerToUse,
      model: modelToUse,
      warning,
      rawWasJson: !warning,
      ideas: finalIdeas.length ? finalIdeas : ideas,
      critic: finalCritic,
      limitInfo: getLimitInfo(req)
    });
  } catch (error) {
    console.error("generate error:", error);
    const message = String(error?.message || "Ошибка генерации");
    let hint = "";

    if (/agent_not_found|Agent not found|404/i.test(message)) {
      hint = "Timeweb-агент не найден. Проверь TIMEWEB_AGENT_ID.";
    } else if (/не ответил за|timeout|timed out|aborted|504/i.test(message)) {
      hint = "Timeweb-агент отвечает слишком долго. Попробуй запустить генерацию снова.";
    } else if (/Connection error/i.test(message)) {
      hint = "Сервер не смог подключиться к API Timeweb.";
    }

    res.status(500).json({
      error: hint ? `${message}. ${hint}` : message
    });
  }
});

// --- ЭНДПОИНТ AI-УЛУЧШАЙЗЕРОВ (КНОПКИ В РЕДАКТОРЕ) ---
app.post("/api/refine", requireAuth, aiLimiter, enforceGenerationLimit, async (req, res) => {
  try {
    const timewebApiKey = TIMEWEB_API_KEY;
    const timewebAgentId = TIMEWEB_AGENT_ID;

    if (!timewebApiKey || !timewebAgentId) {
      return res.status(400).json({
        error: "Timeweb-агент не настроен на сервере."
      });
    }

    const { text, action, project } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Не передан текст для улучшения" });
    }
    if (!action) {
      return res.status(400).json({ error: "Не передано действие (action)" });
    }

    const safeProject = isPlainObject(project) ? {
      name: cleanText(project.name || "", 180),
      niche: cleanText(project.niche || "", 240),
      offer: cleanText(project.offer || "", 1000),
      pain: cleanText(project.pain || "", 1000),
      proof: cleanText(project.proof || "", 1000),
      facts: cleanText(project.facts || "", 2000),
      stopWords: cleanText(project.stopWords || "", 1000)
    } : {};

    let instruction = "";
    if (action === "amplify-pain") {
      instruction = `Усиль эмоциональную боль и проблему аудитории в следующем тексте. Сделай проблему более острой, затронь глубокие страхи клиентов, но пиши без воды и штампов.
      Контекст боли: ${safeProject.pain || "проблема клиента"}.`;
    } else if (action === "add-proof") {
      instruction = `Интегрируй в следующий текст убедительные конкретные факты, цифры или гарантии из Банка доказательств проекта. Замени любые общие слова типа "качественно", "надежно" на конкретику.
      Банк доказательств: ${safeProject.proof || ""} ${safeProject.facts || ""}.`;
    } else if (action === "shorten") {
      instruction = `Максимально сократи следующий текст, убери из него всю "воду" и лишние вводные слова. Сделай его емким, плотным и коротким, но сохрани ключевой оффер и CTA.`;
    } else if (action === "adapt-dzen") {
      instruction = `Переделай текст в полезную универсальную статью, которая помещается в одно сообщение Telegram и затем переносится в Дзен. Ориентир 2200–3400 знаков. Используй обычные названия смысловых блоков без #, ## и Markdown, короткие абзацы и списки через «•». Начни с узнаваемой ситуации или дорогой ошибки, дай конкретную пользу и проверяемые факты, заверши естественным следующим шагом без давления.`;
    } else if (action === "adapt-telegram") {
      instruction = `Переделай текст в сильный Telegram-пост на 700–1800 знаков. Первые два предложения должны точно попадать в ситуацию целевой аудитории и создавать честное желание читать дальше. Оставь одну главную мысль, добавь конкретный критерий, предупреждение, чек-лист или наблюдение, которое хочется сохранить или переслать. Используй короткие абзацы, максимум 2 уместных эмодзи и один естественный следующий шаг.`;
    } else {
      instruction = `Улучши следующий текст: сделай его более вовлекающим, чистым и продающим.`;
    }

    const systemPrompt = `You are a professional conversion copywriter.
Your task is to take the user's text and refine it strictly according to the instruction.
Maintain the original Russian language.
Do not include any chat prefix, introductions, questions or explanations.
Return plain text only. Never use Markdown headings (#, ##), bold markers (** or __), backticks or markdown links. Use «•» for bullets. Output ONLY the improved final text string.`;

    const userPrompt = `
Бизнес-контекст проекта:
- Ниша: ${safeProject.niche || ""}
- Оффер: ${safeProject.offer || ""}
- Запреты/Стоп-слова: ${safeProject.stopWords || ""}

Исходный текст:
"${text}"

Инструкция по улучшению:
${instruction}

Выдай только улучшенный текст.`;

    const requestPayload = {
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    const result = await callTimewebAgentApi(timewebApiKey, timewebAgentId, requestPayload);
    const refinedText = plainPublicationText(result.completion.choices?.[0]?.message?.content || "");

    consumeGenerationLimit(req);
    res.json({ ok: true, refinedText });
  } catch (err) {
    console.error("Ошибка в /api/refine:", err.message);
    res.status(500).json({ error: `Не удалось улучшить текст: ${err.message}` });
  }
});

app.post("/api/upload", requireAuth, publishLimiter, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `Файл слишком большой. Максимальный размер: ${MAX_UPLOAD_MB} МБ.`
        });
      }
      return res.status(400).json({
        error: "Ошибка загрузки: " + err.message
      });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Файл не загружен"
      });
    }

    let ext = path.extname(req.file.originalname || "");
    if (!ext) {
      const mimeMap = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4"
      };
      ext = mimeMap[req.file.mimetype] || "";
    }

    const safeName = `${req.workspaceUser.id}_${req.file.filename}${ext}`;
    const oldPath = req.file.path;
    const newPath = path.join(uploadsDir, safeName);

    fs.renameSync(oldPath, newPath);

    const publicUrl = `${baseUrlFromRequest(req)}/uploads/${encodeURIComponent(safeName)}`;
    const mediaItem = {
      id: safeName,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
      url: publicUrl
    };

    const user = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (!user) {
      fs.unlinkSync(newPath);
      return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });
    }

    const workspace = sanitizeWorkspace(user.workspace || {});
    workspace.media = [mediaItem, ...workspace.media.filter((item) => item.id !== safeName)].slice(0, 300);
    user.workspace = workspace;
    user.updatedAt = new Date().toISOString();
    saveStore(req.store);

    res.json({
      ok: true,
      ...mediaItem
    });
  } catch (error) {
    console.error("upload error:", error);
    res.status(500).json({
      error: error.message || "Ошибка загрузки файла"
    });
  }
});

app.delete("/api/media/:id", requireAuth, publishLimiter, (req, res) => {
  try {
    const fileId = path.basename(String(req.params.id || ""));
    if (!fileId || fileId !== String(req.params.id || "")) {
      return res.status(400).json({ error: "Некорректный идентификатор файла." });
    }

    const user = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (!user) {
      return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });
    }

    const workspace = sanitizeWorkspace(user.workspace || {});
    const mediaExists = workspace.media.some((item) => item.id === fileId);
    if (!mediaExists) {
      return res.status(404).json({ error: "Медиафайл не найден в рабочем пространстве." });
    }

    const filePath = path.resolve(uploadsDir, fileId);
    const uploadsRoot = path.resolve(uploadsDir) + path.sep;
    if (!filePath.startsWith(uploadsRoot)) {
      return res.status(400).json({ error: "Некорректный путь к файлу." });
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    workspace.media = workspace.media.filter((item) => item.id !== fileId);
    workspace.queue = workspace.queue.map((item) => item.mediaId === fileId
      ? { ...item, mediaId: "", mediaUrl: "", mediaType: "" }
      : item);
    user.workspace = workspace;
    user.queue = workspace.queue;
    user.updatedAt = new Date().toISOString();
    saveStore(req.store);

    res.json({ ok: true });
  } catch (error) {
    console.error("media delete error:", error);
    res.status(500).json({ error: "Не удалось удалить медиафайл." });
  }
});

async function enhancePromptWithAi(userPrompt) {
  if (!TIMEWEB_API_KEY || !TIMEWEB_AGENT_ID) {
    debugLog("enhancePromptWithAi: no Timeweb credentials, using original prompt.");
    return userPrompt;
  }
  try {
    const systemPrompt = `You are a professional prompt engineer for AI image generators (such as Midjourney, Stable Diffusion, Pollinations).
Your task is to take the input text (which can be a short Russian image description, a post headline, or a visual scenic brief) and generate a detailed, photography-centric prompt in English or Russian that illustrates only the facts and subject present in the source.
Ты не задаёшь уточняющие вопросы. Если входной текст похож на статью, сам извлеки из него визуальную сцену. Верни только финальный промпт для генерации. Без markdown, без списков, без объяснений, без вводных фраз.
Describe the subject, setting, action, lighting and composition. Do not invent brands, documents, product features, numbers, guarantees or visible text that are absent from the source.
Do not include any conversational prefix, introductory chat, explanation, questions, or markdown formatting. Output ONLY the final prompt string. Do not ask questions under any circumstances.`;

    const requestPayload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a detailed image prompt to illustrate the following text: "${userPrompt}"` }
      ]
    };

    const result = await callTimewebAgentApi(TIMEWEB_API_KEY, TIMEWEB_AGENT_ID, requestPayload);
    const enhanced = result?.completion?.choices?.[0]?.message?.content?.trim();
    if (enhanced && !looksLikeClarification(enhanced)) {
      debugLog("enhancePromptWithAi: prompt enhanced.");
      return enhanced;
    } else if (enhanced) {
      console.warn("enhancePromptWithAi: AI returned clarification, using fallback image prompt:", enhanced);
    }
  } catch (err) {
    console.error("Failed to enhance prompt with AI agent:", err);
  }
  return buildFallbackImagePrompt(userPrompt);
}

async function callImageGenerator(prompt) {
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}&private=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка генерации изображения: ${response.statusText} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildImagePromptFromPost(postText, project = {}) {
  return `
Создай визуальный промт для рекламного изображения.
Ниша: ${project.niche || ""}
Оффер: ${project.offer || ""}
Текст поста: ${postText}

Верни только описание сцены для изображения, без вопросов, без пояснений.
Формат: реалистичная фотография, кто в кадре, где находится, что делает, какой объект, свет, композиция.
Не пиши текст на картинке.
`.trim();
}

app.post("/api/generate-image", requireAuth, aiLimiter, enforceGenerationLimit, async (req, res) => {
  try {
    const prompt = cleanText(req.body?.prompt, 2000);
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Не передан текст промпта" });
    }

    debugLog("POST /api/generate-image: request accepted.");

    // Retrieve active project context to build a visual scene brief
    const user = req.store.users.find((u) => u.id === req.workspaceUser.id);
    const workspace = user?.workspace || {};
    const projects = workspace.projects || [];
    const activeProjectId = workspace.activeProjectId || "";
    const project = projects.find((p) => p.id === activeProjectId) || projects[0] || {};

    const visualBrief = buildImagePromptFromPost(prompt.trim(), project);

    // 1. Улучшение промпта с помощью ИИ
    const enhancedPrompt = await enhancePromptWithAi(visualBrief);

    // 2. Генерация изображения
    const buffer = await callImageGenerator(enhancedPrompt);

    // 3. Сохранение файла на диск в uploadsDir
    const fileId = `${req.workspaceUser.id}_gen_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
    const newPath = path.join(uploadsDir, fileId);

    fs.writeFileSync(newPath, buffer);
    debugLog("POST /api/generate-image: generated image saved.");

    // 4. Формирование публичной ссылки и ответ
    const publicUrl = `${baseUrlFromRequest(req)}/uploads/${encodeURIComponent(fileId)}`;

    // Имя для библиотеки
    const truncatedPrompt = prompt.slice(0, 30).trim() + (prompt.length > 30 ? "..." : "");
    const originalName = `ИИ_${truncatedPrompt}.jpg`;

    consumeGenerationLimit(req);
    res.json({
      ok: true,
      id: fileId,
      name: originalName,
      type: "image/jpeg",
      size: buffer.length,
      url: publicUrl,
      limitInfo: getLimitInfo(req)
    });
  } catch (error) {
    console.error("POST /api/generate-image error:", error);
    res.status(500).json({
      error: error.message || "Не удалось сгенерировать изображение"
    });
  }
});

function buildTelegramText(post) {
  return [
    plainPublicationHeadline(post?.title),
    plainPublicationText(post?.body),
    plainPublicationText(post?.tags)
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function validateTelegramPayload(text, mediaUrl = "") {
  const limit = 4096;
  if (!text) throw new Error("Пустой текст публикации.");
  if (text.length > limit) {
    throw new Error(`Текст длиннее лимита Telegram: ${text.length} из ${limit} знаков.`);
  }
}

async function telegramRelayCall(payload, botToken) {
  if (!TELEGRAM_RELAY_URL) throw new Error("Telegram-ретранслятор не настроен.");
  if (!botToken) throw new Error("Не настроена защищённая публикация Telegram.");

  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", botToken)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const response = await withTimeout(
    fetch(`${TELEGRAM_RELAY_URL}/api/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "ContentFactoryTelegramRelay/1.0",
        "X-Relay-Timestamp": timestamp,
        "X-Relay-Signature": signature
      },
      body
    }),
    45000,
    "Telegram"
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Telegram-ретранслятор: HTTP ${response.status}`);
  }
  return data;
}

function storedTelegramSchedulerAccessToken() {
  const envToken = String(process.env.TELEGRAM_SITES_ACCESS_TOKEN || "").trim();
  if (envToken) return envToken;

  try {
    const store = loadStore();
    for (const user of store.users || []) {
      const token = String(getUserSettingsForServer(user).telegramSchedulerAccessToken || "").trim();
      if (token) return token;
    }
  } catch (error) {
    console.error("[Scheduler] Не удалось прочитать служебный токен:", error.message);
  }
  return "";
}

async function triggerExternalTelegramScheduler(options = {}) {
  externalTelegramSchedulerState.lastAttemptAt = new Date().toISOString();
  try {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!botToken) {
      throw new Error("Не настроен ключ внешнего Telegram-планировщика.");
    }
    const sitesAccessToken = String(
      options.sitesAccessToken
      || storedTelegramSchedulerAccessToken()
      || ""
    ).trim();

    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac("sha256", botToken)
      .update(`${timestamp}.scheduler`)
      .digest("hex");
    const schedulerUrls = [...new Set([
      TELEGRAM_SCHEDULER_URL,
      TELEGRAM_BROWSER_SCHEDULER_URL
    ].filter(Boolean))];
    let lastSchedulerError = null;

    for (const schedulerUrl of schedulerUrls) {
      const accessTokens = sitesAccessToken ? [sitesAccessToken, ""] : [""];

      for (const accessToken of accessTokens) {
        try {
          const response = await withTimeout(
            fetch(`${schedulerUrl}/api/run-scheduler`, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; ContentFactoryScheduler/1.0)",
                "X-Relay-Timestamp": timestamp,
                "X-Relay-Signature": signature,
                ...(accessToken
                  ? { "OAI-Sites-Authorization": `Bearer ${accessToken}` }
                  : {})
              },
              cache: "no-store"
            }),
            55000,
            "Telegram-планировщик"
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            const error = new Error(data.error || `Telegram-планировщик: HTTP ${response.status}`);
            error.status = response.status;
            throw error;
          }

          externalTelegramSchedulerState.lastSuccessAt = new Date().toISOString();
          externalTelegramSchedulerState.lastError = "";
          externalTelegramSchedulerState.lastProcessed = Number(data.processed || 0);
          return data;
        } catch (error) {
          lastSchedulerError = error;
          const retryWithoutAccessToken = Boolean(accessToken)
            && [401, 403].includes(Number(error?.status || 0));
          if (retryWithoutAccessToken) {
            console.warn(`Telegram-планировщик отклонил служебный токен: ${schedulerUrl}. Повтор без него.`);
            continue;
          }
          console.warn(`Telegram-планировщик недоступен: ${schedulerUrl}`, error.message);
          break;
        }
      }
    }

    throw lastSchedulerError || new Error("Не настроен адрес Telegram-планировщика.");
  } catch (error) {
    const cause = String(error?.cause?.message || "").trim();
    const message = cause
      ? `${error.message || "Ошибка соединения"}: ${cause}`
      : String(error?.message || "Ошибка внешнего Telegram-планировщика");
    externalTelegramSchedulerState.lastError = message.slice(0, 500);
    throw new Error(message);
  }
}

async function publishTelegramThroughRelay(payload, botToken) {
  const text = String(payload?.text || "").trim();
  const mediaUrl = String(payload?.mediaUrl || "").trim();
  if (!mediaUrl || text.length <= 1024) {
    return telegramRelayCall(payload, botToken);
  }

  const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const caption = String(blocks.shift() || "Motor Port").slice(0, 1024);
  const followupText = blocks.join("\n\n").trim() || text;
  const mediaResult = await telegramRelayCall({
    text: caption,
    mediaUrl,
    mediaType: String(payload?.mediaType || "")
  }, botToken);
  const textResult = await telegramRelayCall({
    text: followupText,
    mediaUrl: "",
    mediaType: ""
  }, botToken);

  return {
    ...textResult,
    mediaMessageId: mediaResult.messageId || ""
  };
}

async function telegramDirectCall(payload, botToken, chatId) {
  if (!botToken || !chatId) throw new Error("Telegram настроен не полностью");

  const text = String(payload?.text || "").trim();
  const mediaUrl = String(payload?.mediaUrl || "").trim();
  const mediaType = String(payload?.mediaType || "");
  const isVideo = mediaType.startsWith("video/");
  const method = mediaUrl ? (isVideo ? "sendVideo" : "sendPhoto") : "sendMessage";
  const body = mediaUrl
    ? {
        chat_id: chatId,
        [isVideo ? "video" : "photo"]: mediaUrl,
        caption: text
      }
    : {
        chat_id: chatId,
        text
      };

  const response = await withTimeout(
    fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "ContentFactoryTelegramDirect/1.0"
      },
      body: JSON.stringify(body)
    }),
    45000,
    "Telegram"
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.description || data.error || `Telegram API: HTTP ${response.status}`);
  }

  return {
    ok: true,
    messageId: data.result?.message_id || "",
    chatId: data.result?.chat?.id || chatId
  };
}

async function publishTelegramDirect(payload, botToken, chatId) {
  const text = String(payload?.text || "").trim();
  const mediaUrl = String(payload?.mediaUrl || "").trim();
  if (!mediaUrl || text.length <= 1024) {
    return telegramDirectCall(payload, botToken, chatId);
  }

  const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const caption = String(blocks.shift() || "Motor Port").slice(0, 1024);
  const followupText = blocks.join("\n\n").trim() || text;
  const mediaResult = await telegramDirectCall({
    text: caption,
    mediaUrl,
    mediaType: String(payload?.mediaType || "")
  }, botToken, chatId);
  const textResult = await telegramDirectCall({
    text: followupText,
    mediaUrl: "",
    mediaType: ""
  }, botToken, chatId);

  return {
    ...textResult,
    mediaMessageId: mediaResult.messageId || ""
  };
}

app.post("/api/publish/telegram", requireAuth, publishLimiter, async (req, res) => {
  try {
    const userSettings = getUserSettingsForServer(req.workspaceUser);
    const botToken = userSettings.telegramBotToken;
    const chatId = userSettings.telegramChatId;

    if (!TELEGRAM_EXTERNAL_SCHEDULER && (!botToken || !chatId)) {
      return res.status(400).json({
        error: "Telegram настроен не полностью. Сохрани Bot Token и Chat ID."
      });
    }

    const { post, media } = req.body || {};
    if (!post) {
      return res.status(400).json({
        error: "Не передан post"
      });
    }

    const mediaUrl = absoluteMediaUrl(req, media?.url);
    const text = buildTelegramText(post);
    validateTelegramPayload(text, mediaUrl);

    if (TELEGRAM_EXTERNAL_SCHEDULER) {
      const storedUser = req.store.users.find((item) => item.id === req.workspaceUser.id);
      if (!storedUser) {
        return res.status(401).json({ error: "Аккаунт не найден. Войди заново." });
      }
      const workspace = sanitizeWorkspace(storedUser.workspace || {});
      let storedPost = workspace.queue.find((item) => String(item.id) === String(post.id));
      if (!storedPost) {
        storedPost = sanitizeWorkspace({
          ...workspace,
          queue: [{ ...post, mediaUrl, mediaType: String(media?.type || "") }]
        }).queue[0];
        workspace.queue.unshift(storedPost);
      }
      storedPost.status = TELEGRAM_SCHEDULED_STATUS;
      storedPost.state = statusLabel(storedPost.status);
      storedPost.scheduledAt = new Date().toISOString();
      storedPost.publishDate = datePartServer(storedPost.scheduledAt);
      storedPost.publishTime = timePartServer(storedPost.scheduledAt);
      storedPost.lastError = "";
      storedPost.claimId = "";
      storedPost.claimExpiresAt = 0;
      storedUser.workspace = workspace;
      syncQueueToWorkspace(storedUser, workspace.queue);
      saveStore(req.store);

      return res.json({
        ok: true,
        telegram: {
          queued: true,
          scheduledAt: storedPost.scheduledAt
        }
      });
    }

    const result = await publishTelegramThroughRelay({
      text,
      mediaUrl,
      mediaType: String(media?.type || "")
    }, botToken);

    const storedUser = req.store.users.find((item) => item.id === req.workspaceUser.id);
    if (storedUser && post.id) {
      const queue = Array.isArray(storedUser.queue)
        ? storedUser.queue
        : Array.isArray(storedUser.workspace?.queue)
          ? storedUser.workspace.queue
          : [];
      const storedPost = queue.find((item) => String(item.id) === String(post.id));
      if (storedPost) {
        storedPost.status = "published";
        storedPost.state = statusLabel(storedPost.status);
        storedPost.publishedAt = new Date().toISOString();
        storedPost.telegramMessageId = result.messageId || "";
        storedPost.lastError = "";
        storedPost.claimId = "";
        storedPost.claimExpiresAt = 0;
        storedPost.publishAttempts = Number(storedPost.publishAttempts || 0) + 1;
        syncQueueToWorkspace(storedUser, queue);
        saveStore(req.store);
      }
    }

    res.json({
      ok: true,
      telegram: {
        ok: true,
        result: {
          message_id: result.messageId,
          chat: { id: result.chatId || chatId }
        }
      }
    });
  } catch (error) {
    console.error("telegram publish error:", error);
    res.status(500).json({
      error: error.message || "Ошибка публикации в Telegram"
    });
  }
});

function syncQueueToWorkspace(user, queue) {
  user.queue = queue;
  user.workspace = user.workspace && typeof user.workspace === "object"
    ? { ...user.workspace, queue }
    : { ...defaultWorkspace(), queue };
  user.updatedAt = new Date().toISOString();
}

function absoluteMediaUrl(req, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrlFromRequest(req)).href;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────
// INSTAGRAM PUBLISHING
// ─────────────────────────────────────────────────────────────
async function instagramPublishReel(accessToken, userId, videoUrl, caption) {
  const baseUrl = "https://graph.instagram.com/v19.0";

  // Step 1: Create media container
  const containerRes = await fetch(`${baseUrl}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption: caption.slice(0, 2200),
      access_token: accessToken
    })
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok || containerData.error) {
    throw new Error(containerData.error?.message || `Instagram API error (container): ${containerRes.status}`);
  }
  const containerId = containerData.id;
  if (!containerId) throw new Error("Instagram: не получен ID контейнера");

  // Step 2: Poll until FINISHED (max 120s)
  let ready = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(`${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const statusData = await statusRes.json();
    if (statusData.status_code === "FINISHED") { ready = true; break; }
    if (statusData.status_code === "ERROR") throw new Error("Instagram: ошибка обработки видео на серверах Meta");
  }
  if (!ready) throw new Error("Instagram: видео не обработалось за 120 секунд. Попробуй снова.");

  // Step 3: Publish
  const publishRes = await fetch(`${baseUrl}/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken })
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw new Error(publishData.error?.message || `Instagram API error (publish): ${publishRes.status}`);
  }
  return publishData;
}

app.post("/api/publish/instagram", requireAuth, publishLimiter, async (req, res) => {
  try {
    const userSettings = getUserSettingsForServer(req.workspaceUser);
    const { instagramAccessToken, instagramUserId } = userSettings;

    if (!instagramAccessToken || !instagramUserId) {
      return res.status(400).json({
        error: "Instagram не подключён. Добавь токен доступа и ID пользователя в настройках."
      });
    }

    const { post, media } = req.body || {};
    if (!post) return res.status(400).json({ error: "Не передан post" });

    if (!media?.url || !media.type?.startsWith("video/")) {
      return res.status(400).json({
        error: "Для публикации в Instagram Reels нужно видео. Прикрепи видеофайл к посту."
      });
    }

    const caption = [post.title, "", post.body, "", post.tags]
      .filter(Boolean).join("\n").slice(0, 2200);

    const result = await instagramPublishReel(instagramAccessToken, instagramUserId, media.url, caption);

    res.json({ ok: true, instagram: result });
  } catch (error) {
    console.error("instagram publish error:", error);
    res.status(500).json({ error: error.message || "Ошибка публикации в Instagram" });
  }
});

// ─────────────────────────────────────────────────────────────
// YOUTUBE OAUTH + PUBLISHING
// ─────────────────────────────────────────────────────────────
function makeYouTubeOAuth(redirectUri) {
  return new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, redirectUri);
}

app.get("/api/auth/youtube", requireAuth, publishLimiter, (req, res) => {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return res.status(400).json({
      error: "YouTube OAuth не настроен. Добавь YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET в .env."
    });
  }

  const redirectUri = `${baseUrlFromRequest(req)}/api/auth/youtube/callback`;
  const oauth2Client = makeYouTubeOAuth(redirectUri);

  // Embed userId in state so callback knows which user to update
  const state = Buffer.from(JSON.stringify({ userId: req.workspaceUser.id })).toString("base64url");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly"
    ],
    state
  });

  res.redirect(url);
});

app.get("/api/auth/youtube/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(`<h2>Ошибка: ${String(error)}</h2><p>Закрой эту вкладку и попробуй снова.</p>`);
    }

    if (!code || !state) {
      return res.status(400).send("<h2>Нет кода авторизации</h2>");
    }

    let userId;
    try {
      userId = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8")).userId;
    } catch {
      return res.status(400).send("<h2>Неверный state</h2>");
    }

    const redirectUri = `${baseUrlFromRequest(req)}/api/auth/youtube/callback`;
    const oauth2Client = makeYouTubeOAuth(redirectUri);
    const { tokens } = await oauth2Client.getToken(String(code));

    if (!tokens.refresh_token) {
      return res.send("<h2>YouTube не вернул refresh_token.</h2><p>Отзови доступ приложению в настройках Google и попробуй снова.</p>");
    }

    // Get channel info
    oauth2Client.setCredentials(tokens);
    const yt = google.youtube({ version: "v3", auth: oauth2Client });
    const channelRes = await yt.channels.list({ part: "snippet", mine: true });
    const channel = channelRes.data.items?.[0];

    const store = loadStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) return res.status(404).send("<h2>Пользователь не найден</h2>");

    user.settings = { ...defaultUserSettings(), ...(user.settings || {}) };
    user.settings.youtubeRefreshTokenEnc = encryptSecret(tokens.refresh_token);
    user.settings.youtubeChannelId = channel?.id || "";
    user.updatedAt = new Date().toISOString();
    saveStore(store);

    const channelTitle = channel?.snippet?.title || "канал";
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>YouTube подключён</title><style>body{font-family:sans-serif;display:grid;place-items:center;min-height:100vh;background:#0b0d18;color:#fff;margin:0}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:32px 40px;text-align:center;max-width:400px}h2{margin:0 0 12px;font-size:24px}p{color:rgba(255,255,255,.7);margin:0 0 20px}button{background:#45d3ff;color:#07101a;border:none;border-radius:12px;padding:12px 24px;font-weight:900;font-size:15px;cursor:pointer}</style></head><body><div class="card"><h2>✅ YouTube подключён</h2><p>Канал: <b>${channelTitle}</b></p><button onclick="window.close()">Закрыть</button></div></body></html>`);
  } catch (error) {
    console.error("YouTube OAuth callback error:", error);
    res.status(500).send(`<h2>Ошибка OAuth: ${String(error.message)}</h2>`);
  }
});

app.post("/api/auth/youtube/disconnect", requireAuth, publishLimiter, (req, res) => {
  try {
    const store = loadStore();
    const user = store.users.find((u) => u.id === req.workspaceUser.id);
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });

    user.settings = { ...defaultUserSettings(), ...(user.settings || {}) };
    user.settings.youtubeRefreshTokenEnc = "";
    user.settings.youtubeChannelId = "";
    user.updatedAt = new Date().toISOString();
    saveStore(store);

    res.json({ ok: true, youtubeConnected: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/publish/youtube", requireAuth, publishLimiter, async (req, res) => {
  try {
    const userSettings = getUserSettingsForServer(req.workspaceUser);
    const { youtubeRefreshToken } = userSettings;

    if (!youtubeRefreshToken) {
      return res.status(400).json({
        error: "YouTube не подключён. Нажми \"Подключить YouTube\" в настройках."
      });
    }

    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
      return res.status(400).json({
        error: "YouTube OAuth не настроен на сервере. Добавь YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET в .env."
      });
    }

    const { post, media, scheduledAt } = req.body || {};
    if (!post) return res.status(400).json({ error: "Не передан post" });

    if (!media?.url || !media.type?.startsWith("video/")) {
      return res.status(400).json({
        error: "Для загрузки YouTube Shorts нужно видео. Прикрепи видеофайл к посту."
      });
    }

    const oauth2Client = makeYouTubeOAuth("");
    oauth2Client.setCredentials({ refresh_token: youtubeRefreshToken });
    const yt = google.youtube({ version: "v3", auth: oauth2Client });

    // Get video file from local uploads
    const localPath = uploadPathFromUrl(media.url);

    if (!fs.existsSync(localPath)) {
      return res.status(400).json({ error: "Файл не найден на сервере. Загрузи видео через Медиа." });
    }

    const title = String(post.title || "Видео").slice(0, 100);
    const description = [post.body, "", post.tags].filter(Boolean).join("\n").slice(0, 5000);

    // If scheduledAt is in the future, set publishAt
    const publishAt = scheduledAt && new Date(scheduledAt) > new Date()
      ? new Date(scheduledAt).toISOString()
      : null;

    const insertRes = await yt.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: "22" // People & Blogs
        },
        status: {
          privacyStatus: "private",
          ...(publishAt ? { publishAt } : {}),
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(localPath)
      }
    });

    const videoId = insertRes.data.id;
    res.json({
      ok: true,
      youtube: {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        scheduledAt: publishAt,
        status: publishAt ? "scheduled" : "uploaded_private"
      }
    });
  } catch (error) {
    console.error("youtube publish error:", error);
    const msg = error?.response?.data?.error?.message || error.message || "Ошибка загрузки на YouTube";
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────
// Планировщик автопостинга из очереди, каждые 60 секунд
// ─────────────────────────────────────────────────────────────
let schedulerRunning = false;

async function runScheduledPublishing() {
  if (schedulerRunning) {
    console.warn("[Scheduler] Предыдущий запуск ещё не завершён, пропускаем тик.");
    return;
  }

  schedulerRunning = true;
  try {
    let useDirectTelegramFallback = !TELEGRAM_EXTERNAL_SCHEDULER;
    if (TELEGRAM_EXTERNAL_SCHEDULER) {
      try {
        const result = await triggerExternalTelegramScheduler();
        if (Number(result.processed || 0) > 0) {
          console.log(`[Scheduler] Telegram: обработано публикаций ${result.processed}.`);
        }
      } catch (error) {
        console.error("[Scheduler] Внешний Telegram-планировщик недоступен:", error.message);
        useDirectTelegramFallback = true;
      }
    }

    const store = loadStore();
    const now = Date.now();

    for (const user of store.users) {
      const queue = Array.isArray(user.queue)
        ? user.queue
        : Array.isArray(user.workspace?.queue)
          ? user.workspace.queue
          : [];
      let changed = false;

      for (const post of queue) {
        if (!post.status) post.status = post.state === "Опубликовано" ? "published" : TELEGRAM_SCHEDULED_STATUS;
        if (post.platform === "dzen") {
          post.contentFormat = "dzen";
          post.platform = "telegram";
          if (post.status === "ready") post.status = TELEGRAM_SCHEDULED_STATUS;
          post.state = statusLabel(post.status);
          changed = true;
        }
        const platform = post.platform || "telegram";

        if (post.status === "publishing" && Number(post.claimExpiresAt || 0) <= now) {
          post.status = TELEGRAM_SCHEDULED_STATUS;
          post.state = statusLabel(post.status);
          post.claimId = "";
          post.claimExpiresAt = 0;
          changed = true;
        }
        if (platform === "telegram" && post.status === "ready") {
          post.status = TELEGRAM_SCHEDULED_STATUS;
          post.state = statusLabel(post.status);
          changed = true;
        }
        if (platform === "telegram" && TELEGRAM_EXTERNAL_SCHEDULER && !useDirectTelegramFallback) {
          continue;
        }

        if (post.status !== TELEGRAM_SCHEDULED_STATUS || !post.scheduledAt) continue;
        const postTime = new Date(post.scheduledAt).getTime();
        if (!Number.isFinite(postTime) || postTime > now) continue;

        const userSettings = getUserSettingsForServer(user);

        try {
          if (platform === "telegram") {
            const {
              telegramBotToken,
              telegramChatId
            } = userSettings;
            if (!telegramBotToken || !telegramChatId) {
              post.status = "error";
              post.state = statusLabel(post.status);
              post.lastError = "Telegram настроен не полностью";
              changed = true;
              continue;
            }

            const media = Array.isArray(user.workspace?.media)
              ? user.workspace.media.find((item) => item.id && item.id === post.mediaId)
              : null;
            const rawMediaUrl = String(post.mediaUrl || media?.url || "").trim();
            const mediaUrl = rawMediaUrl
              ? new URL(rawMediaUrl, `${SCHEDULER_BASE_URL}/`).href
              : "";
            const mediaType = String(post.mediaType || media?.type || "");
            const text = buildTelegramText(post);
            validateTelegramPayload(text, mediaUrl);

            post.status = "publishing";
            post.state = statusLabel(post.status);
            post.claimId = crypto.randomUUID();
            post.claimExpiresAt = now + 15 * 60 * 1000;
            post.lastError = "";
            syncQueueToWorkspace(user, queue);
            saveStore(store);

            const telegramPayload = { text, mediaUrl, mediaType };
            const result = TELEGRAM_EXTERNAL_SCHEDULER
              ? await publishTelegramDirect(telegramPayload, telegramBotToken, telegramChatId)
              : await publishTelegramThroughRelay(telegramPayload, telegramBotToken);

            post.status = "published";
            post.state = statusLabel(post.status);
            post.publishedAt = new Date().toISOString();
            post.telegramMessageId = result.messageId || "";
            post.telegramMediaMessageId = result.mediaMessageId || "";
            post.lastError = "";
            post.claimId = "";
            post.claimExpiresAt = 0;
            post.publishAttempts = Number(post.publishAttempts || 0) + 1;
          } else if (platform === "instagram") {
            const { instagramAccessToken, instagramUserId } = userSettings;
            if (!instagramAccessToken || !instagramUserId) { post.status = "error"; post.lastError = "Instagram не настроен"; changed = true; continue; }
            if (!post.mediaUrl || !post.mediaType?.startsWith("video/")) { post.status = "error"; post.lastError = "Нет видео для Instagram Reels"; changed = true; continue; }

            const caption = [post.title, "", post.body, "", post.tags].filter(Boolean).join("\n").slice(0, 2200);
            await instagramPublishReel(instagramAccessToken, instagramUserId, post.mediaUrl, caption);
            post.status = "published"; post.state = statusLabel(post.status); post.publishedAt = new Date().toISOString();

          } else if (platform === "youtube") {
            const { youtubeRefreshToken } = userSettings;
            if (!youtubeRefreshToken || !YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) { post.status = "error"; post.lastError = "YouTube не настроен"; changed = true; continue; }
            if (!post.mediaUrl || !post.mediaType?.startsWith("video/")) { post.status = "error"; post.lastError = "Нет видео для YouTube Shorts"; changed = true; continue; }

            const oauth2Client = makeYouTubeOAuth("");
            oauth2Client.setCredentials({ refresh_token: youtubeRefreshToken });
            const yt = google.youtube({ version: "v3", auth: oauth2Client });

            const localPath = uploadPathFromUrl(post.mediaUrl);
            if (!fs.existsSync(localPath)) { post.status = "error"; post.lastError = "Файл не найден"; changed = true; continue; }

            await yt.videos.insert({
              part: ["snippet", "status"],
              requestBody: {
                snippet: { title: String(post.title || "Видео").slice(0, 100), description: String(post.body || "").slice(0, 5000), categoryId: "22" },
                status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
              },
              media: { body: fs.createReadStream(localPath) }
            });
            post.status = "published"; post.state = statusLabel(post.status); post.publishedAt = new Date().toISOString();
          } else {
            post.status = "error";
            post.state = statusLabel(post.status);
            post.lastError = `Автопубликация для платформы "${platform}" не поддерживается`;
            changed = true;
            continue;
          }

          changed = true;
          console.log(`[Scheduler] ${platform} published for user ${user.email}: ${post.title}`);
        } catch (pubErr) {
          const attempts = Number(post.publishAttempts || 0) + 1;
          post.publishAttempts = attempts;
          post.claimId = "";
          post.claimExpiresAt = 0;
          post.lastError = String(pubErr.message || "Ошибка публикации");
          if (platform === "telegram" && attempts < 3) {
            post.status = TELEGRAM_SCHEDULED_STATUS;
            post.scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          } else {
            post.status = "error";
          }
          post.state = statusLabel(post.status);
          changed = true;
          console.error(`[Scheduler] ${platform} error for user ${user.email}:`, pubErr.message);
        }
      }

      if (changed) {
        syncQueueToWorkspace(user, queue);
      }
    }

    saveStore(store);
  } catch (err) {
    console.error("[Scheduler] Ошибка планировщика:", err.message);
  } finally {
    schedulerRunning = false;
  }
}

attachChatGptApp(app, {
  rootDir: __dirname,
  appSecret: APP_SECRET,
  publicBaseUrl: PUBLIC_BASE_URL || SCHEDULER_BASE_URL,
  uploadsDir,
  maxUploadMb: MAX_UPLOAD_MB,
  authLimiter,
  oauthAuthorizeLimiter,
  oauthTokenLimiter,
  loadStore,
  saveStore,
  verifyPassword,
  ensureDemoUser,
  demoEmail: DEMO_EMAIL,
  demoPassword: DEMO_PASSWORD,
  clientDemoEmail: CLIENT_DEMO_EMAIL,
  clientSharedWorkspace: CLIENT_SHARED_WORKSPACE,
  sanitizeWorkspace,
  plainPublicationHeadline,
  plainPublicationText,
  baseUrlFromRequest
});

const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API endpoint не найден"
    });
  }

  const distIndex = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.sendFile(path.join(__dirname, "index.html"));
  }
});

async function seedDemoUsers() {
  try {
    if (!ENABLE_DEMO_LOGIN) return;
    const store = loadStore();
    let changed = false;

    // Seed admin
    const adminResult = await ensureDemoUser(store, DEMO_EMAIL, DEMO_PASSWORD, "kubik-admin-id");
    if (adminResult.changed) {
      changed = true;
      console.log(`Пользователь администратора '${DEMO_EMAIL}' успешно зарегистрирован по умолчанию.`);
    }

    // Seed client
    if (CLIENT_DEMO_EMAIL) {
      const clientResult = await ensureDemoUser(store, CLIENT_DEMO_EMAIL, CLIENT_DEMO_PASSWORD, "client-demo-id");
      if (clientResult.changed) {
        changed = true;
        console.log(`Пользователь клиента '${CLIENT_DEMO_EMAIL}' успешно зарегистрирован по умолчанию.`);
      }
    }

    // Seed second limited test account
    if (TEST_DEMO_EMAIL) {
      const testResult = await ensureDemoUser(store, TEST_DEMO_EMAIL, TEST_DEMO_PASSWORD, "test-demo-2-id");
      if (testResult.changed) {
        changed = true;
        console.log(`Тестовый пользователь '${TEST_DEMO_EMAIL}' успешно зарегистрирован по умолчанию.`);
      }
    }

    if (changed) {
      saveStore(store);
    }
  } catch (e) {
    console.error("Не удалось создать пользователей по умолчанию:", e.message);
  }
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Content Factory backend ${APP_BUILD} started on port ${PORT}`);
  console.log(`[Startup] NODE_ENV=${process.env.NODE_ENV || "development"} DATA_DIR=${DATA_DIR}`);
  console.log('[Startup env]', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATA_DIR_ENV: process.env.DATA_DIR,
    cwd: process.cwd()
  });

  setInterval(runScheduledPublishing, SCHEDULER_INTERVAL_MS);
  console.log(`[Scheduler] Планировщик автопостинга запущен (интервал: ${SCHEDULER_INTERVAL_MS} мс)`);

  // Инициализация демо-пользователей только если включена переменная окружения SEED_DEMO_USERS
  if (process.env.SEED_DEMO_USERS === "true") {
    console.log("[Startup] Запуск асинхронного сидирования демо-пользователей...");
    seedDemoUsers().then(() => {
      console.log("[Startup] Асинхронное сидирование демо-пользователей успешно завершено.");
    }).catch((err) => {
      console.error("[Startup] Ошибка при сидировании демо-пользователей:", err.message);
    });
  }
});

// Обработка сигналов завершения для корректного graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Shutdown] Получен сигнал SIGTERM. Запуск graceful shutdown...");
  server.close(() => {
    console.log("[Shutdown] HTTP сервер Express успешно закрыт. Завершение процесса.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Shutdown] Получен сигнал SIGINT. Запуск graceful shutdown...");
  server.close(() => {
    console.log("[Shutdown] HTTP сервер Express успешно закрыт. Завершение процесса.");
    process.exit(0);
  });
});
