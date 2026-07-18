// Build: 2026-07-19-chatgpt-first-workspace-v33
document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cf_full_token_v2";
  const USER_KEY = "cf_full_user_v2";
  const STORE_KEY = "cf_ui_clean_state_v1";
  const SECRET_FIELDS = ["openaiApiKey", "telegramBotToken"];
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  const el = {
    authScreen: document.getElementById("authScreen"),
    authForm: document.getElementById("authForm"),
    emailInput: document.getElementById("emailInput"),
    passwordInput: document.getElementById("passwordInput"),
    authText: document.getElementById("authText"),
    authSubmitBtn: document.getElementById("authSubmitBtn"),
    authModeToggle: document.getElementById("authModeToggle"),
    authError: document.getElementById("authError"),
    app: document.getElementById("app"),
    burgerBtn: document.getElementById("burgerBtn"),
    sidebar: document.getElementById("sidebar"),
    nav: document.getElementById("nav"),
    main: document.getElementById("main"),
    modalRoot: document.getElementById("modalRoot"),
    toast: document.getElementById("toast"),
    loadingLine: document.getElementById("loadingLine"),
    accountPill: document.getElementById("accountPill"),
    generationOverlay: document.getElementById("generationOverlay"),
    generationText: document.getElementById("generationText")
  };

  let lastFocusedBeforeModal = null;
  let kanbanDragCard = null;

  function syncNavA11y() {
    if (!el.burgerBtn || !el.sidebar) return;
    const isOpen = el.sidebar.classList.contains("open");
    el.burgerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function toggleNavMenu() {
    if (!el.sidebar) return;
    el.sidebar.classList.toggle("open");
    syncNavA11y();
  }
  function closeNavMenu() {
    if (!el.sidebar) return;
    el.sidebar.classList.remove("open");
    syncNavA11y();
  }

  function getFocusable(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((node) => node.offsetParent !== null || node === document.activeElement);
  }

  function trapModalFocus(event) {
    if (event.key !== "Tab") return;
    const modalCard = el.modalRoot.querySelector(".modal-card");
    if (!modalCard) return;
    const focusables = getFocusable(modalCard);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function activateModalA11y() {
    const modalCard = el.modalRoot.querySelector(".modal-card");
    if (!modalCard) return;

    modalCard.setAttribute("role", "dialog");
    modalCard.setAttribute("aria-modal", "true");
    if (!modalCard.hasAttribute("tabindex")) modalCard.setAttribute("tabindex", "-1");

    const title = modalCard.querySelector(".modal-title");
    if (title && !title.id) title.id = `modal-title-${Date.now()}`;
    if (title) modalCard.setAttribute("aria-labelledby", title.id);

    const focusables = getFocusable(modalCard);
    const target = focusables.find((item) => item.matches("input, textarea, select, button")) || modalCard;
    target.focus();
  }

  function mountModal(markup) {
    lastFocusedBeforeModal = document.activeElement;
    el.modalRoot.innerHTML = markup;
    activateModalA11y();
  }

  const icons = {
    factory: icon("M3 21h18M6 18V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v12M9 9h6M9 13h6"),
    media: icon("M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H4z M8 9h.01 M4 15l4-4 3 3 3-3 6 6"),
    queue: icon("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"),
    projects: icon("M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
    settings: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.6.8 1 1.5 1H21a2 2 0 0 1 0 4h-.1c-.7 0-1.3.4-1.5 1z"),
    logs: icon("M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8"),
    logout: icon("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"),
    spark: icon("M12 3l1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8z"),
    key: icon("M21 2l-2 2M11.4 11.6a5 5 0 1 1-2.8-2.8L21 2v5h-5v5h-4.6z"),
    send: icon("M22 2L11 13M22 2l-7 20-4-9-9-4z"),
    copy: icon("M8 8h10v12H8z M6 16H4V4h12v2"),
    file: icon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8M8 17h8M8 9h2"),
    close: icon("M18 6L6 18M6 6l12 12"),
    upload: icon("M12 16V4M7 9l5-5 5 5M4 20h16"),
    trash: icon("M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"),
    eye: icon("M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
    eyeOff: icon("M17.9 17.9A10.5 10.5 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M10 4.2A9.3 9.3 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22"),
    check: icon("M20 6L9 17l-5-5"),
    board: icon("M3 3h7v18H3zm11 0h7v10h-7zm0 14h7v4h-7z")
  };

  const tabs = [
    ["materials", "Материалы"],
    ["queue", "Очередь"],
    ["media", "Медиа"],
    ["project", "Проект"],
    ["settings", "Настройки"],
    ["logout", "Выйти"]
  ];

  const platforms = {
    dzen: { name: "Статья для Дзена", short: "публикация через Telegram", icon: "DZ" },
    telegram: { name: "Пост для Telegram", short: "публикация через Telegram", icon: "TG" }
  };

  const contentTemplates = [
    {
      id: "dzen-seo-sales",
      name: "Продающая SEO-статья Дзен",
      platform: "dzen",
      goal: "получить поисковый трафик и заявки",
      style: "экспертно, подробно, с разбором боли, доказательствами и CTA",
      formatNote: "Структура: цепляющий заголовок, введение, раскрытие проблемы, метод решения с фактами, интеграция ключевых слов, призыв к действию с предложением оставить заявку.",
      briefAdd: "Нужна SEO-статья для Дзена. Напиши глубокий текст, закрывающий боли целевой аудитории, с логичным переходом к нашему офферу.",
      tag: "статьи"
    },
    {
      id: "dzen-useful-info",
      name: "SEO-инструкция / Гайд Дзен",
      platform: "dzen",
      goal: "привлечь целевых клиентов через пользу и SEO",
      style: "пошагово, практически, понятно",
      formatNote: "Пошаговая SEO-инструкция с обычными названиями смысловых блоков без Markdown. Дай конкретные критерии и действия, закрой проблему клиента и естественно покажи роль нашего решения.",
      briefAdd: "Нужен полезный гайд-инструкция для Дзена. Важно: дать практическую пользу и естественно встроить рекламу наших услуг.",
      tag: "инструкции"
    },
    {
      id: "dzen-case",
      name: "SEO-кейс Дзен",
      platform: "dzen",
      goal: "доказать экспертность и получить заявки",
      style: "по фактам, с разбором процесса, цифрами и результатами",
      formatNote: "Подробный кейс для Дзена: исходная задача, как решали шаг за шагом, итоговый результат в цифрах и выводы. Оптимизируй заголовок и текст под поиск.",
      briefAdd: "Нужен кейс в Дзен. Опиши процесс работы, покажи результаты и подкрепи их нашими преимуществами.",
      tag: "кейсы"
    },
    {
      id: "telegram-reach",
      name: "Охватный экспертный пост",
      platform: "telegram",
      goal: "получить охват, пересылки и обращения от целевой аудитории",
      style: "живо, конкретно, с сильным первым абзацем, без кликбейта",
      formatNote: "Одна узнаваемая ситуация или дорогая ошибка, конкретный критерий/чек-лист, доказательство из практики и естественный следующий шаг. Plain text без Markdown, 700–1800 знаков.",
      briefAdd: "Нужен медийный пост для Telegram: заинтересовать именно целевую аудиторию, дать пользу, которую хочется сохранить или переслать, и нативно привести к обращению.",
      tag: "охват"
    },
    {
      id: "telegram-info",
      name: "Инфо-пост Telegram",
      platform: "telegram",
      goal: "вовлечь аудиторию и показать продукт/услугу",
      style: "живо, по-человечески, с эмодзи, без канцеляризмов",
      formatNote: "Информационный пост для Telegram: интересные детали о проекте, процессе, внутренней кухне или процессах работы, короткие факты.",
      briefAdd: "Нужен пост в Telegram. Опиши наши процессы, покажи внутреннюю кухню бизнеса или расскажи свежую новость.",
      tag: "инфо"
    },
    {
      id: "telegram-dzen-copy",
      name: "Анонс статьи Дзен в Telegram",
      platform: "telegram",
      goal: "перевести читателей из Telegram в Дзен",
      style: "интригующе, кратко, с призывом перейти по ссылке",
      formatNote: "Короткий тизер-анонс статьи из Дзена: обозначь главную проблему, дай интригующую зацепку и призови прочитать полную статью по ссылке.",
      briefAdd: "Нужен короткий пост-анонс. Задача - завлечь читателя кликнуть по ссылке на Дзен.",
      tag: "анонсы"
    },
    {
      id: "faq-objection",
      name: "FAQ-статья Дзен",
      platform: "dzen",
      goal: "снять сомнения и страхи клиентов",
      style: "честно, убедительно, с фактами и доказательствами",
      formatNote: "Статья для Дзена в формате FAQ: короткое введение, 4–6 реальных вопросов клиента, ответы только на основе базы проекта, итог и безопасный следующий шаг.",
      briefAdd: "Нужна FAQ-статья для Дзена по главным возражениям. Не придумывай цены, гарантии и факты, которых нет в базе проекта.",
      tag: "доверие"
    }
  ];

  const defaultState = {
    activeTab: "materials",
    calendarView: "strip",
    activeTemplateId: "dzen-seo-sales",
    activeProjectId: "p_1",
    activePlatform: "dzen",
    briefMode: "text",
    selectedIdeaId: "",
    selectedMediaId: "",
    busy: false,
    secretVisible: {},
    critic: null,
    settings: {
      model: "",
      ideaCount: "3",
      style: "живой, экспертный, конкретный, без воды и кликбейта",
      objective: "охват, доверие и целевые заявки",
      openaiApiKey: "",
      telegramBotToken: "",
      telegramChatId: "",
      maxUploadMb: 50,
      backendStatus: "не проверен"
    },
    planner: {
      publishDate: undefined,
      publishTime: undefined,
      placement: "Telegram",
      goal: "получить заявку",
      reason: "",
      formatNote: ""
    },
    projects: [
      {
        id: "p_1",
        name: "Новый проект",
        briefText: "",
        niche: "",
        offer: "",
        audience: "",
        pain: "",
        proof: "",
        common: "",
        tone: "",
        details: "",
        status: "активный",
        price: "",
        timelines: "",
        warranty: "",
        geo: "",
        landingPage: "",
        awareness: "Теплый",
        fear: "",
        reason: "",
        facts: "",
        goal: "",
        nextStep: "",
        leadMagnet: "",
        stopWords: "",
        competitors: "",
        advantages: ""
      }
    ],
    ideas: [],
    media: [],
    queue: [],
    logs: []
  };

  let authMode = "login";
  let state = loadState();
  let selectedMaterialIds = new Set();
  let selectedQueueIds = new Set();
  let serverSyncReady = false;
  let serverSaveTimer = null;

  init();

  function init() {
    ensurePlanner();
    syncActiveTemplatePlatform();
    renderAuthMode();
    syncNavA11y();
    el.authForm.addEventListener("submit", submitAuth);
    el.authModeToggle.addEventListener("click", toggleAuthMode);
    document.querySelector("[data-auth-password-toggle]")?.addEventListener("click", toggleAuthPassword);

    if (token()) {
      showApp();
      fetchConfig();
      fetchWorkspace();
      checkBackend(false);
    } else {
      showAuth();
    }
  }

  function icon(path) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg>`;
  }

  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function currentEmail() { return localStorage.getItem(USER_KEY) || ""; }
  function storageKey() { return `${STORE_KEY}_${(currentEmail() || "guest").toLowerCase().replace(/[^a-z0-9@._-]+/g, "_")}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function loadState() {
    try {
      let raw = localStorage.getItem(storageKey());
      if (!raw && currentEmail()) {
        const guestKey = `${STORE_KEY}_guest`;
        const guestRaw = localStorage.getItem(guestKey);
        if (guestRaw) {
          raw = guestRaw;
          localStorage.setItem(storageKey(), raw);
        }
      }
      if (!raw) return clone(defaultState);
      const parsed = JSON.parse(raw);
      const merged = clone(defaultState);
      const legacyTabs = ["dashboard", "factory", "board"];
      merged.activeTab = legacyTabs.includes(parsed.activeTab)
        ? "materials"
        : ["database", "projects"].includes(parsed.activeTab)
          ? "project"
          : ["materials", "queue", "media", "project", "settings"].includes(parsed.activeTab)
            ? parsed.activeTab
            : defaultState.activeTab;
      merged.settings = { ...clone(defaultState.settings), ...(parsed.settings || {}) };
      merged.planner = { ...clone(defaultState.planner), ...(parsed.planner || {}) };
      merged.activeTemplateId = parsed.activeTemplateId || defaultState.activeTemplateId;
      if (!contentTemplates.some((item) => item.id === merged.activeTemplateId)) {
        merged.activeTemplateId = defaultState.activeTemplateId;
      }
      merged.briefMode = parsed.briefMode || defaultState.briefMode;
      if (!merged.planner.publishDate || merged.planner.publishDate < todayInputValue()) merged.planner.publishDate = todayInputValue();
      if (!merged.planner.publishTime) merged.planner.publishTime = nextHourInputValue();

      merged.settings.openaiApiKey = "";
      merged.settings.telegramBotToken = "";

      merged.ideas = sanitizeContentItems(parsed.ideas || []);
      merged.queue = sanitizeQueueItems(parsed.queue || []);
      merged.media = parsed.media || [];
      merged.logs = parsed.logs || [];
      merged.selectedIdeaId = parsed.selectedIdeaId || "";
      merged.selectedMediaId = parsed.selectedMediaId || "";
      if (parsed.projects && parsed.projects.length) {
        merged.projects = parsed.projects;
        merged.activeProjectId = parsed.activeProjectId || parsed.projects[0].id;
      } else {
        merged.projects = clone(defaultState.projects);
        merged.activeProjectId = "p_1";
      }
      if (parsed.limitInfo) {
        merged.limitInfo = parsed.limitInfo;
      }
      merged.secretVisible = {};
      return merged;
    } catch {
      return clone(defaultState);
    }
  }

  function saveState() {
    const data = clone(state);
    SECRET_FIELDS.forEach((field) => { if (data.settings) data.settings[field] = ""; });
    localStorage.setItem(storageKey(), JSON.stringify(data));
    scheduleWorkspaceSave();
  }

  function showAuth() {
    serverSyncReady = false;
    document.body.classList.remove("logged-in");
    setTimeout(() => el.emailInput.focus(), 80);
  }

  function showApp() {
    document.body.classList.add("logged-in");
    render();
  }

  function toggleAuthMode() {
    authMode = authMode === "login" ? "register" : "login";
    setAuthError("");
    renderAuthMode();
  }

  function renderAuthMode() {
    const isRegister = authMode === "register";
    el.authText.textContent = isRegister
      ? "Регистрация профиля в системе."
      : "Подготовка и публикация материалов в Telegram.";
    el.authSubmitBtn.textContent = isRegister ? "Зарегистрироваться" : "Войти";
    el.passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
    document.querySelector("[data-auth-password-toggle]").innerHTML = icons.eye;
  }

  function toggleAuthPassword() {
    const show = el.passwordInput.type === "password";
    el.passwordInput.type = show ? "text" : "password";
    document.querySelector("[data-auth-password-toggle]").innerHTML = show ? icons.eyeOff : icons.eye;
  }

  function setAuthError(text) {
    if (!text) {
      el.authError.classList.add("is-hidden");
      el.authError.innerHTML = "";
      return;
    }
    el.authError.classList.remove("is-hidden");
    el.authError.innerHTML = `<strong>${escapeHtml(text)}</strong>`;
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    setBusy(true);

    try {
      const email = el.emailInput.value.trim();
      const password = el.passwordInput.value;
      const endpoint = "/api/auth/login";
      const data = await request(endpoint, { method: "POST", public: true, body: { email, password } });

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, data.user?.email || email);
      state = loadState();
      showApp();
      await fetchConfig();
      await fetchWorkspace();
      await checkBackend(false);
    } catch (error) {
      setAuthError(cleanError(error.message));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state = loadState();
    el.passwordInput.value = "";
    showAuth();
  }

  async function request(path, options = {}) {
    const headers = {};
    let body = options.body;

    if (!(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = body ? JSON.stringify(body) : undefined;
    }

    if (!options.public) headers.Authorization = "Bearer " + token();

    const controller = new AbortController();
    const AI_PATHS = ["/api/generate-image", "/api/refine", "/api/project/import-url", "/api/project/import-brief", "/api/project/brief-template"];
    const timeoutMs = options.timeoutMs || (path === "/api/generate" ? 600000 : AI_PATHS.includes(path) ? 300000 : 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(path, { method: options.method || "GET", headers, body, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Запрос не ответил за ${Math.round(timeoutMs / 1000)} секунд. Попробуй запустить ещё раз.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (response.status === 401 && !options.public) {
      logout();
      throw new Error("Сессия истекла. Войди заново.");
    }

    if (!response.ok) throw new Error(data.error || data.message || data.raw || "Ошибка запроса");
    return data;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    el.loadingLine.classList.toggle("show", state.busy);
    document.querySelectorAll("button").forEach((button) => {
      if (button.dataset.allowDuringBusy === "true") return;
      button.disabled = state.busy;
    });
  }

  let generationInterval;
  const generationPhrases = [
    "Анализируем бриф...",
    "Подбираем формат...",
    "Пишем тексты...",
    "Оформляем материал..."
  ];

  function showGenerationOverlay() {
    el.generationOverlay.classList.add("show");
    el.generationOverlay.setAttribute("aria-hidden", "false");
    let step = 0;
    el.generationText.textContent = generationPhrases[0];
    clearInterval(generationInterval);
    generationInterval = setInterval(() => {
      step++;
      if (step < generationPhrases.length) {
        el.generationText.textContent = generationPhrases[step];
      }
    }, 5000);
  }

  function hideGenerationOverlay() {
    el.generationOverlay.classList.remove("show");
    el.generationOverlay.setAttribute("aria-hidden", "true");
    clearInterval(generationInterval);
  }

  function showToast(text) {
    el.toast.textContent = text;
    el.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 3500);
  }

  function scrollToTop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.main.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function addLog(type, text, meta = "") {
    state.logs.unshift({ id: uid("log"), type, text, meta, time: new Date().toLocaleString("ru-RU") });
    state.logs = state.logs.slice(0, 90);
    saveState();
  }

  function clearAiConnectionWarnings() {
    state.logs = state.logs.filter((log) => {
      if (log.type !== "bad" && log.type !== "warn") return true;
      const text = `${log.text || ""}\n${log.meta || ""}`;
      return !/Timeweb|API_KEY_INVALID|ключ|ИИ|AI|unauthorized|Forbidden|401/i.test(text);
    });
  }

  function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
  function pad2(value) { return String(value).padStart(2, "0"); }
  function todayInputValue(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  function nextHourInputValue() {
    const date = new Date();
    date.setMinutes(date.getMinutes() > 30 ? 0 : 30, 0, 0);
    if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  function scheduledAtIso(date, time) {
    if (!date || !time) return "";
    const value = new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  function ensurePlanner() {
    if (!state.planner) state.planner = clone(defaultState.planner);
    if (!state.planner.publishDate || state.planner.publishDate < todayInputValue()) state.planner.publishDate = todayInputValue();
    if (!state.planner.publishTime) state.planner.publishTime = nextHourInputValue();
    return state.planner;
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

  function sanitizeContentItems(items = []) {
    return (Array.isArray(items) ? items : []).map((idea) => ({
      ...idea,
      title: plainPublicationHeadline(idea?.title || ""),
      angle: plainPublicationHeadline(idea?.angle || ""),
      pillar: plainPublicationHeadline(idea?.pillar || ""),
      formats: Object.fromEntries(
        Object.entries(idea?.formats || {}).map(([key, content]) => [
          key,
          {
            ...content,
            format: plainPublicationHeadline(content?.format || ""),
            headline: plainPublicationHeadline(content?.headline || ""),
            body: plainPublicationText(content?.body || ""),
            tags: plainPublicationText(content?.tags || "")
          }
        ])
      )
    }));
  }

  function sanitizeQueueItems(items = []) {
    return (Array.isArray(items) ? items : []).map((post) => ({
      ...post,
      title: plainPublicationHeadline(post?.title || ""),
      body: plainPublicationText(post?.body || ""),
      tags: plainPublicationText(post?.tags || "")
    }));
  }

  function cleanError(message) {
    const text = String(message || "Ошибка");
    if (text.includes("API_KEY_INVALID") || text.includes("401")) return "Отказ: проверь токен в переменных сервера.";
    if (text.toLowerCase().includes("connection error")) return "Ошибка подключения к агенту.";
    if (/timeout|timed out/i.test(text)) return "ИИ отвечает слишком долго. Попробуй еще раз.";
    if (text.includes("TIMEWEB_API_KEY")) return "ИИ-подключение не настроено на бэке.";
    if (text.includes("429") || text.includes("limit")) return "Лимиты API исчерпаны.";
    return text;
  }

  function bindMediaUploadListeners() {
    const fileInput = document.getElementById("mediaFile");
    const uploadZone = document.getElementById("uploadZone");
    const uploadPreview = document.getElementById("uploadPreview");
    const previewMediaContainer = document.getElementById("previewMediaContainer");
    const previewFileName = document.getElementById("previewFileName");

    if (!fileInput || !uploadZone) return;

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("is-dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("is-dragover");
    });

    const handleFileSelect = (file) => {
      uploadZone.classList.remove("is-dragover");

      if (!file) return;

      const maxMB = Number(state.settings.maxUploadMb || 50);
      if (file.size > maxMB * 1024 * 1024) {
        showToast(`Файл слишком большой. Разрешено до ${maxMB} МБ.`);
        fileInput.value = "";
        uploadPreview.classList.remove("is-visible");
        return;
      }

      const allowed = ["image/", "video/"];
      const isAllowed = allowed.some(prefix => file.type.startsWith(prefix));
      if (!isAllowed) {
        showToast("Неподдерживаемый формат. Выберите изображение или видео.");
        fileInput.value = "";
        uploadPreview.classList.remove("is-visible");
        return;
      }

      previewFileName.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      previewMediaContainer.innerHTML = "";

      const url = URL.createObjectURL(file);
      if (file.type.startsWith("image/")) {
        previewMediaContainer.innerHTML = `<img src="${url}" class="preview-media-fill">`;
      } else if (file.type.startsWith("video/")) {
        previewMediaContainer.innerHTML = `<video src="${url}" muted controls class="preview-media-fill"></video>`;
      }

      uploadPreview.classList.add("is-visible");
    };

    fileInput.addEventListener("change", (e) => {
      handleFileSelect(e.target.files[0]);
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length) {
        fileInput.files = files;
        handleFileSelect(files[0]);
      }
    });
  }

  function activeProject() { return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0]; }
  function selectedIdea() { return state.ideas.find((idea) => idea.id === state.selectedIdeaId) || state.ideas[0] || null; }
  function selectedContent() {
    const idea = selectedIdea();
    if (!idea) return { format: "Формат", headline: "Нет идей", body: "Сгенерируй новые материалы.", tags: "" };
    const content = idea.formats?.[state.activePlatform] || idea.formats?.telegram;
    return content || { format: platforms[state.activePlatform]?.name || "Формат", headline: idea.title, body: idea.title, tags: "" };
  }

  function render() {
    renderNav();
    renderAccount();
    renderMain();
    saveState();
    if (state.activeTab === "media") {
      bindMediaUploadListeners();
    }
  }

  function renderNav() {
    el.nav.innerHTML = `
      <div class="sidebar-project-block">
        <span class="sidebar-eyebrow">Рабочий проект</span>
        <strong class="sidebar-project-name">${escapeHtml(activeProject()?.name || "Motor Port")}</strong>
      </div>
      ${tabs.map(([id, label]) => `
        <button class="nav-btn ${state.activeTab === id ? "active" : ""}" type="button"
          data-action="${id === "logout" ? "logout" : "tab"}" data-tab="${id}"
          ${state.activeTab === id ? 'aria-current="page"' : ""}>
          <span>${escapeHtml(label)}</span>
        </button>
      `).join("")}
    `;
    syncNavA11y();
  }

  function renderAccount() {
    const aiReady = Boolean(state.settings.chatgptAppReady || state.settings.openaiReady || state.settings.openaiApiKey);

    el.accountPill.innerHTML = `
      <div class="fw-600 text-main">${escapeHtml(currentEmail() || "Аккаунт")}</div>
      <div class="inline-center gap-6">
        <span class="status-dot ${aiReady ? 'is-ok' : 'is-bad'}"></span>
        ${aiReady ? 'Сервисы подключены' : 'Проверяем подключение'}
      </div>
    `;
  }

  function renderMain() {
    const views = {
      materials: renderMaterials,
      media: renderMedia,
      queue: renderQueue,
      project: renderProjectCenter,
      settings: renderSettings
    };
    el.main.innerHTML = (views[state.activeTab] || renderMaterials)();
  }

  function queueStats() {
    const today = todayInputValue();
    return {
      total: state.queue.length,
      today: state.queue.filter((item) => (item.publishDate || datePart(item.scheduledAt)) === today).length,
      ready: state.queue.filter((item) => item.status === "ready").length,
      scheduled: state.queue.filter((item) => (item.status || "scheduled") === "scheduled").length,
      published: state.queue.filter((item) => item.status === "published" || item.state === "Опубликовано").length,
      errors: state.queue.filter((item) => item.status === "error" || item.state === "Ошибка").length
    };
  }

  function activeTemplate() {
    return contentTemplates.find((item) => item.id === state.activeTemplateId) || contentTemplates[0];
  }

  function syncActiveTemplatePlatform() {
    const template = contentTemplates.find((item) => item.id === state.activeTemplateId);
    if (template) {
      state.activePlatform = template.platform;
      ensurePlanner().placement = "Telegram";
    }
  }

  function applyTemplateById(id) {
    const template = contentTemplates.find((item) => item.id === id);
    if (!template) return;
    state.activeTemplateId = template.id;
    state.activePlatform = template.platform;
    state.settings.style = template.style;
    state.settings.objective = template.goal;
    state.planner = {
      ...ensurePlanner(),
      placement: "Telegram",
      goal: template.goal,
      reason: template.tag,
      formatNote: template.formatNote
    };
    const project = activeProject();
    const currentBrief = String(project.briefText || "").trim();
    if (template.briefAdd && !currentBrief.includes(template.briefAdd)) {
      project.briefText = [currentBrief, "", template.briefAdd].filter(Boolean).join("\n");
    }
    saveState();
  }

  function renderDashboard() {
    const project = activeProject();
    const stats = queueStats();
    const nextPosts = [...state.queue].filter((item) => item.status !== "published").slice(0, 4);

    return `
      <div class="panel">
        <h1 class="title-xl">Пульт управления</h1>
        <p class="lead">Сводка по проекту <strong>${escapeHtml(project.name)}</strong></p>
        
        <div class="auto mt-24">
          <div class="metric">
            <div class="metric-value">${stats.today}</div>
            <div class="metric-label">Материалов на сегодня</div>
          </div>
          <div class="metric">
            <div class="metric-value">${state.ideas.length}</div>
            <div class="metric-label">Идей в бэклоге</div>
          </div>
          <div class="metric">
            <div class="metric-value">${stats.scheduled}</div>
            <div class="metric-label">Запланировано всего</div>
          </div>
        </div>

        <div class="actions mt-24">
          <button class="btn primary" data-action="tab" data-tab="factory">Перейти в Завод</button>
          <button class="btn" data-action="tab" data-tab="queue">Открыть календарь</button>
        </div>
      </div>

      <div class="auto">
        <div class="panel">
          <h2 class="title">Ближайшие релизы</h2>
          <div class="stack mt-16">
            ${nextPosts.length ? nextPosts.map(renderQueueCard).join("") : renderEmpty("Очередь пуста. Подготовь первую статью.")}
          </div>
        </div>
        
        <div class="panel">
          <h2 class="title">Быстрый старт</h2>
          <div class="stack mt-16">
            ${contentTemplates.slice(0, 4).map(renderTemplateCard).join("")}
          </div>
        </div>
      </div>
    `;
  }

  // --- MARKETING BASE & VAULT: renderDatabase ---
  function getProjectCompletionPercentage(project) {
    const fields = [
      "name", "niche", "offer", "price", "timelines", "warranty", "geo", "landingPage",
      "audience", "pain", "fear", "reason", "proof", "facts", "goal", "nextStep",
      "leadMagnet", "tone", "stopWords"
    ];
    let filledCount = 0;
    fields.forEach(f => {
      if (project[f] && String(project[f]).trim().length > 0) filledCount++;
    });
    return Math.round((filledCount / fields.length) * 100);
  }

  function completionChipClass(percentage) {
    if (percentage >= 70) return "ok";
    if (percentage >= 30) return "warn";
    return "bad";
  }

  function renderDatabase() {
    const project = activeProject();
    const completion = getProjectCompletionPercentage(project);

    return `
      <div class="panel">
        <div class="row">
          <div>
            <h1 class="title-xl">Маркетинговая база проекта</h1>
            <p class="text">Заполни коммерческий контекст бизнеса, чтобы ИИ-маркетолог и ИИ-критик генерировали сильный конвертящий контент.</p>
          </div>
          <div class="chip ${completionChipClass(completion)} status-chip-large">
            📊 База заполнена на ${completion}%
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="row">
          <div>
            <div class="kicker">Быстрое заполнение</div>
            <h2 class="title">Импорт брифа или сайта</h2>
            <p class="text">Вставь готовый бриф в окно ниже или дай ссылку на сайт. Приложение разложит информацию по полям базы проекта.</p>
          </div>
          <button class="btn" data-action="copy-generated-brief">${icons.copy} Скопировать шаблон брифа</button>
        </div>
        <div class="form mt-16">
          <label class="field">
            <span class="label">Ссылка на сайт</span>
            <div class="inline-center gap-10">
              <input class="input" data-action="project-input" name="landingPage" placeholder="https://site.ru" value="${escapeHtml(project.landingPage || "")}" />
              <button class="btn primary nowrap" data-action="import-project-url">Заполнить с сайта</button>
            </div>
          </label>
          <label class="field">
            <span class="label">Окно для готового брифа</span>
            <textarea class="textarea minh-150" data-action="project-input" name="briefText" placeholder="Вставь сюда бриф клиента или шаблон, заполненный вручную">${escapeHtml(project.briefText || "")}</textarea>
          </label>
          <div class="inline-wrap gap-10">
            <button class="btn primary" data-action="import-project-brief">${icons.spark} Разложить бриф по полям</button>
            <button class="btn" data-action="fill-brief-template">${icons.file} Вставить шаблон в окно</button>
          </div>
        </div>
      </div>

      <div class="stack gap-16 mt-24">
        <!-- Блок 1: Основное (Продукт и Бизнес) -->
        <details class="panel brief-section" open>
          <summary class="brief-summary brief-summary-main">
            <span class="inline-center gap-8">
              ${icons.projects} 1. Основное (Продукт и Бизнес)
            </span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field">
              <span class="label">Название проекта</span>
              <input class="input" data-action="project-input" name="name" value="${escapeHtml(project.name)}" />
            </label>
            <label class="field">
              <span class="label">Ниша</span>
              <input class="input" data-action="project-input" name="niche" placeholder="Например: натяжные потолки в СПБ" value="${escapeHtml(project.niche || "")}" />
            </label>
            <label class="field">
              <span class="label">Что продвигаем / Оффер</span>
              <textarea class="textarea minh-80" data-action="project-input" name="offer" placeholder="Например: Скидка 15% при заказе до конца недели + бесплатный выезд замерщика в день обращения">${escapeHtml(project.offer || "")}</textarea>
            </label>
            <label class="field">
              <span class="label">Цена / Вилка цен</span>
              <input class="input" data-action="project-input" name="price" placeholder="Например: от 490 руб/м2" value="${escapeHtml(project.price || "")}" />
            </label>
            <label class="field">
              <span class="label">Сроки оказания услуг</span>
              <input class="input" data-action="project-input" name="timelines" placeholder="Например: монтаж за 3 часа, выезд замерщика за 1 час" value="${escapeHtml(project.timelines || "")}" />
            </label>
            <label class="field">
              <span class="label">Гарантии</span>
              <input class="input" data-action="project-input" name="warranty" placeholder="Например: 15 лет по договору, не пожелтеет и не провиснет" value="${escapeHtml(project.warranty || "")}" />
            </label>
            <label class="field">
              <span class="label">Гео / Регион</span>
              <input class="input" data-action="project-input" name="geo" placeholder="Например: Москва и Московская область (до 30 км от МКАД)" value="${escapeHtml(project.geo || "")}" />
            </label>
          </div>
        </details>

        <!-- Блок 2: Целевая аудитория -->
        <details class="panel brief-section">
          <summary class="brief-summary brief-summary-audience">
            <span class="inline-center gap-8">
              ${icons.logs} 2. Клиент (Целевая аудитория)
            </span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field">
              <span class="label">Сегменты аудитории</span>
              <textarea class="textarea minh-80" data-action="project-input" name="audience" placeholder="Например: Новоселы в ЖК (хотят быстро и без хлопот), Мамы с детьми (нужна экологичность, без запаха), Дизайнеры...">${escapeHtml(project.audience || "")}</textarea>
            </label>
            <label class="field">
              <span class="label">Стадия осознанности клиента</span>
              <select class="select" data-action="project-input" name="awareness">
                <option value="Холодный" ${project.awareness === "Холодный" ? "selected" : ""}>Холодный (Не осознает проблему / Сравнивает категории)</option>
                <option value="Теплый" ${project.awareness === "Теплый" ? "selected" : ""}>Теплый (Сравнивает решения и условия)</option>
                <option value="Горячий" ${project.awareness === "Горячий" ? "selected" : ""}>Горячий (Выбирает подрядчика и готов покупать)</option>
              </select>
            </label>
            <label class="field">
              <span class="label">Главная боль аудитории</span>
              <textarea class="textarea minh-80" data-action="project-input" name="pain" placeholder="Например: Боятся, что монтажники оставят горы мусора, порвут обои или испортят мебель. Переживают из-за скрытых наценок в конце.">${escapeHtml(project.pain || "")}</textarea>
            </label>
            <label class="field">
              <span class="label">Главное возражение / Страх</span>
              <input class="input" data-action="project-input" name="fear" placeholder="Например: У вас дорого / дешевые потолки будут вонять химией" value="${escapeHtml(project.fear || "")}" />
            </label>
            <label class="field">
              <span class="label">Причина не купить прямо сейчас</span>
              <input class="input" data-action="project-input" name="reason" placeholder="Например: Ждут окончания черновых работ / Думают сделать сами" value="${escapeHtml(project.reason || "")}" />
            </label>
          </div>
        </details>

        <!-- Блок 3: Банк доказательств -->
        <details class="panel brief-section">
          <summary class="brief-summary brief-summary-proof">
            <span class="inline-center gap-8">
              ${icons.check} 3. Доказательства (Факты и отзывы)
            </span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field">
              <span class="label">Факты и УТП (цифры, склад, сертификаты)</span>
              <textarea class="textarea minh-100" data-action="project-input" name="proof" placeholder="Например: Собственное производство 1200м2, сертифицированные полотна MSD Premium (Германия) без запаха, 14 штатных бригад с опытом от 5 лет, работаем строго по ГОСТ.">${escapeHtml(project.proof || "")}</textarea>
            </label>
            <label class="field">
              <span class="label">Кейсы / Результаты / Отзывы</span>
              <textarea class="textarea minh-100" data-action="project-input" name="facts" placeholder="Например: Кейс: Потолок в 3-комнатной квартире за 6 часов без пыли. Отзыв Ирины: 'Монтажники приехали вовремя, убрали за собой строительным пылесосом, цена осталась как в смете'.">${escapeHtml(project.facts || "")}</textarea>
            </label>
          </div>
        </details>

        <!-- Блок 4: Конверсии и Позиционирование -->
        <details class="panel brief-section">
          <summary class="brief-summary brief-summary-style">
            <span class="inline-center gap-8">
              ${icons.spark} 4. Генерация (Цели и Tone of Voice)
            </span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <div class="auto-tight">
              <label class="field">
                <span class="label">Цель материала</span>
                <input class="input" data-action="project-input" name="goal" placeholder="Например: Получить заявку на замер" value="${escapeHtml(project.goal || "")}" />
              </label>
              <label class="field">
                <span class="label">Следующий шаг (CTA)</span>
                <input class="input" data-action="project-input" name="nextStep" placeholder="Например: Пройти квиз-тест на расчет цены" value="${escapeHtml(project.nextStep || "")}" />
              </label>
            </div>
            <label class="field">
              <span class="label">Лид-магнит / Усиление CTA</span>
              <input class="input" data-action="project-input" name="leadMagnet" placeholder="Например: Каталог трендовых светильников 2026 в подарок" value="${escapeHtml(project.leadMagnet || "")}" />
            </label>
            <label class="field">
              <span class="label">Тон общения / Голос бренда</span>
              <input class="input" data-action="project-input" name="tone" placeholder="Например: Экспертный, заботливый, без заносчивости и сложных терминов" value="${escapeHtml(project.tone || "")}" />
            </label>
            <label class="field">
              <span class="label">Стоп-слова / Запреты</span>
              <input class="input" data-action="project-input" name="stopWords" placeholder="Например: Уникальный, качественный, профессиональный, низкие цены" value="${escapeHtml(project.stopWords || "")}" />
            </label>
            <div class="auto-tight">
              <label class="field">
                <span class="label">Конкуренты (чем мы лучше)</span>
                <input class="input" data-action="project-input" name="competitors" placeholder="Например: Частники (нет гарантии), крупные сети (накручивают смету)" value="${escapeHtml(project.competitors || "")}" />
              </label>
              <label class="field">
                <span class="label">Наши преимущества</span>
                <input class="input" data-action="project-input" name="advantages" placeholder="Например: Чистый монтаж с пылесосом, оплата после сдачи" value="${escapeHtml(project.advantages || "")}" />
              </label>
            </div>
          </div>
        </details>
      </div>

      <!-- Опасная зона (Удаление проекта) -->
      <div class="panel danger-zone">
        <div>
          <h4 class="danger-title">⚠️ Опасная зона</h4>
          <p class="fs-12 text-muted m-0">Удаление текущего активного проекта и всех сохраненных им полей брифа.</p>
        </div>
        <button class="btn danger nowrap" data-action="delete-project">Удалить этот проект</button>
      </div>
    `;
  }

  function renderDzenVisualizer(headline, text) {
    const media = state.media.find(m => m.id === state.selectedMediaId);
    const imageUrl = media && media.type?.startsWith("image/") ? media.url : "";
    const blocks = [];
    let listItems = [];
    const flushList = () => {
      if (!listItems.length) return;
      blocks.push(`<ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
      listItems = [];
    };

    plainPublicationText(text).split(/\n+/).map(p => p.trim()).filter(Boolean).forEach((paragraph) => {
      if (/^(?:[-*•])\s+/.test(paragraph)) {
        listItems.push(paragraph.replace(/^(?:[-*•])\s+/, ""));
        return;
      }

      flushList();
      blocks.push(`<p>${escapeHtml(paragraph)}</p>`);
    });
    flushList();

    const renderedBody = blocks.join("");
    const readingMinutes = Math.max(1, Math.ceil(String(text || "").trim().split(/\s+/).filter(Boolean).length / 180));
    const safeHeadline = headline || "Заголовок статьи";

    return `
      <div class="panel dzen-preview">
        <div class="dzen-preview-bar">
          <span class="dzen-preview-label">УНИВЕРСАЛЬНЫЙ PLAIN-TEXT</span>
          <span class="chip info">Telegram → Дзен</span>
        </div>
        
        <article>
          <header>
            <h1 class="dzen-preview-title">${escapeHtml(safeHeadline)}</h1>
            
            <div class="dzen-preview-author">
              <div class="dzen-preview-avatar">
                ${escapeHtml(activeProject().name?.slice(0, 2).toUpperCase() || "КЗ")}
              </div>
              <div>
                <div class="item-title">${escapeHtml(activeProject().name || "Мой канал")}</div>
                <div class="dzen-preview-meta">Предпросмотр • ~${readingMinutes} мин чтения</div>
              </div>
            </div>
          </header>
          
          ${imageUrl ? `
            <div class="dzen-preview-image">
              <img src="${escapeHtml(imageUrl)}" alt="Обложка: ${escapeHtml(safeHeadline)}">
            </div>
          ` : ""}
          
          <div class="dzen-article-body">${renderedBody}</div>
        </article>
      </div>
    `;
  }

  function parseAlternativeHooks(text) {
    if (!text) return [];
    const hooks = [];

    const match = text.match(/(?:Варианты хуков|Альтернативные хуки|3 варианта первого абзаца|3 варианта хука)[:\-]?\s*([\s\S]+?)(?=\n\n[А-ЯA-Z]|\n\n$|$)/i);

    if (match) {
      const lines = match[1].split("\n");
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && /^[0-9\-\*\•\.]/.test(trimmed)) {
          hooks.push(trimmed.replace(/^[0-9\-\*\•\.\s]+/, ""));
        }
      });
    }

    return hooks;
  }

  function renderAlternativeHooksVisualizer(text) {
    const hooks = parseAlternativeHooks(text);
    if (!hooks.length) return "";

    return `
      <div class="panel hooks-panel">
        <h4 class="title-sm fs-13 text-accent mb-8">🔥 Альтернативные хуки (кликни для замены первого абзаца):</h4>
        <div class="stack gap-8">
          ${hooks.map(h => `
            <div class="project-card hook-option" data-action="swap-hook" data-hook="${escapeHtml(h)}">
              <strong>Вариант:</strong> ${escapeHtml(h)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  window.swapFirstParagraph = function (newParagraph) {
    const textarea = document.querySelector('[data-action="edit-content"][data-field="body"]');
    if (!textarea) return;

    const originalText = textarea.value;
    const paragraphs = originalText.split(/\n\s*\n/);

    if (paragraphs.length > 0) {
      paragraphs[0] = newParagraph;
      const newText = paragraphs.join("\n\n");
      textarea.value = newText;

      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);

      showToast("Хук успешно заменен!");
    }
  };

  async function refineText(action) {
    const textarea = document.querySelector('[data-action="edit-content"][data-field="body"]');
    if (!textarea) return;

    const originalText = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const isSelection = start !== end;
    const textToRefine = isSelection ? originalText.substring(start, end) : originalText;

    if (!textToRefine.trim()) {
      showToast("Сначала выдели или напиши текст для улучшения");
      return;
    }

    setBusy(true);
    showToast("ИИ улучшает текст...");
    try {
      const data = await request("/api/refine", {
        method: "POST",
        body: {
          text: textToRefine,
          action: action,
          project: activeProject()
        }
      });

      if (data.ok && data.refinedText) {
        let newText;
        if (isSelection) {
          newText = originalText.substring(0, start) + data.refinedText + originalText.substring(end);
        } else {
          newText = data.refinedText;
        }

        textarea.value = newText;

        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);

        showToast("Текст успешно улучшен!");
      } else {
        showToast("Не удалось улучшить текст");
      }
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false);
      render();
    }
  }

  function renderFactory() {
    const project = activeProject();
    const content = selectedContent();
    const planner = ensurePlanner();
    const completion = getProjectCompletionPercentage(project);
    const selectedMedia = state.media.find((item) => item.id === state.selectedMediaId);
    const telegramLimit = selectedMedia ? 1024 : 4096;
    const publicationLength = formatPublicationText({
      title: content.headline,
      body: content.body,
      tags: content.tags
    }).length;

    let criticHtml = "";
    if (state.critic) {
      const c = state.critic;
      criticHtml = `
        <div class="panel critic-panel">
          <h2 class="title inline-center gap-8 text-accent">
            ${icons.spark} Маркетинговая оценка ИИ-Критика: ${c.summaryScore || 0}%
          </h2>
          <p class="text critic-copy mt-8 text-main">
            <strong>Критика маркетолога:</strong> ${escapeHtml(c.critique || "Нет замечаний.")}
          </p>
          ${c.improvementsMade ? `
            <p class="text critic-copy mt-8 text-muted">
              <strong>Улучшения:</strong> ${escapeHtml(c.improvementsMade)}
            </p>
          ` : ""}
          
          <div class="auto-tight mt-16">
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.hookScore >= 80 ? 'is-good' : 'is-bad'}">${c.hookScore || 0}%</div>
              <div class="metric-label metric-label-compact">Хук / Заголовок</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.audienceScore >= 80 ? 'is-good' : 'is-bad'}">${c.audienceScore || 0}%</div>
              <div class="metric-label metric-label-compact">Попадание в ЦА</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.painScore >= 80 ? 'is-good' : 'is-bad'}">${c.painScore || 0}%</div>
              <div class="metric-label metric-label-compact">Раскрытие боли</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.retentionScore >= 80 ? 'is-good' : 'is-bad'}">${c.retentionScore || 0}%</div>
              <div class="metric-label metric-label-compact">Удержание</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.shareScore >= 80 ? 'is-good' : 'is-bad'}">${c.shareScore || 0}%</div>
              <div class="metric-label metric-label-compact">Сохранения / пересылки</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.proofScore >= 80 ? 'is-good' : 'is-bad'}">${c.proofScore || 0}%</div>
              <div class="metric-label metric-label-compact">Доказательства</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.ctaScore >= 80 ? 'is-good' : 'is-bad'}">${c.ctaScore || 0}%</div>
              <div class="metric-label metric-label-compact">Призыв / CTA</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.platformScore >= 80 ? 'is-good' : 'is-bad'}">${c.platformScore || 0}%</div>
              <div class="metric-label metric-label-compact">Формат площадки</div>
            </div>
            <div class="metric metric-compact">
              <div class="metric-value critic-score ${c.reachScore >= 80 ? 'is-good' : 'is-bad'}">${c.reachScore || 0}%</div>
              <div class="metric-label metric-label-compact">Потенциал охвата</div>
            </div>
          </div>
        </div>
      `;
    }

    let visualizerHtml = "";
    const bodyText = content.body || "";
    const headlineText = content.headline || "";
    if (state.activePlatform === "dzen") {
      visualizerHtml = renderDzenVisualizer(headlineText, bodyText);
    } else if (state.activePlatform === "telegram") {
      visualizerHtml = renderAlternativeHooksVisualizer(bodyText);
    }

    return `
      <div class="panel">
        <div class="row">
          <div>
            <h1 class="title-xl">Фабрика контента</h1>
            <p class="text">Готовь статьи и посты, затем публикуй их в Telegram сразу или по расписанию.</p>
          </div>
          <div class="inline-wrap inline-center gap-8">
            <span class="chip info chip-compact">📁 Проект выбран</span>
            <span class="chip ${completionChipClass(completion)} chip-compact">📊 База заполнена на ${completion}%</span>
            <span class="chip connection-chip ${state.settings.openaiReady || state.settings.openaiApiKey ? 'is-ok' : 'is-bad'}">
              ⚡ ИИ ${state.settings.openaiReady || state.settings.openaiApiKey ? 'готов к работе' : 'не настроен'}
            </span>
          </div>
        </div>
      </div>

      <section class="workbench">
        <aside class="panel brief-panel">
          <div class="kicker">Шаг 01</div>
          <h2 class="title">Вводные для генерации</h2>
          
          <div class="form mt-16">
            <label class="field">
              <span class="label">Выбранный проект</span>
              <div class="selected-project-bar">
                <span>${escapeHtml(project.name)}</span>
                <a href="#" data-action="tab" data-tab="database" class="settings-link">⚙️ Настроить базу</a>
              </div>
            </label>

            <label class="field">
              <span class="label">Режим генерации</span>
              <select class="select" data-action="apply-template-select">
                ${contentTemplates.map(t => `<option value="${t.id}" ${t.id === state.activeTemplateId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join("")}
              </select>
            </label>

            <label class="field">
              <span class="label">Сколько материалов сгенерировать</span>
              <select class="select" data-action="setting-input" name="ideaCount">
                ${[1, 2, 3, 4, 5].map(count => `<option value="${count}" ${String(state.settings.ideaCount || "3") === String(count) ? "selected" : ""}>${count} ${count === 1 ? 'вариант' : count < 5 ? 'варианта' : 'вариантов'}</option>`).join("")}
              </select>
            </label>

            <label class="field">
              <span class="label">Фокусная тема материала</span>
              <textarea class="textarea minh-80" data-action="project-input" name="details" placeholder="Например: почему дешевый профиль желтеет и как не потерять 50к руб на замене">${escapeHtml(project.details || "")}</textarea>
            </label>

            <div class="auto-tight mt-8">
              ${renderPlannerInput("publishDate", "Дата", planner.publishDate, "", "date")}
              ${renderPlannerInput("publishTime", "Время", planner.publishTime, "", "time")}
            </div>
            
            <button class="btn primary generate-button ${state.limitInfo && !state.limitInfo.isUnlimited && state.limitInfo.remaining < 1 ? 'is-disabled' : ''}" data-action="generate" ${state.limitInfo && !state.limitInfo.isUnlimited && state.limitInfo.remaining < 1 ? 'disabled' : ''}>
              ${state.limitInfo && !state.limitInfo.isUnlimited && state.limitInfo.remaining < 1
                ? "Недостаточно лимитов (обновится завтра)"
                : `${icons.spark} Сгенерировать материалы`}
            </button>
            <button class="btn full-center" data-action="fill-brief-template">
              ${icons.file} Сделать бриф под этот формат
            </button>
          </div>
        </aside>

        <div class="stack">
          <div class="panel">
            <div class="row">
              <div>
                <div class="kicker">Шаг 02</div>
                <h2 class="title">Идеи подачи</h2>
              </div>
            </div>
            <div class="auto-tight mt-16">
              ${state.ideas.length ? state.ideas.map(renderIdea).join("") : renderEmpty("Бэклог пуст. Выбери тему на сегодня и запусти генерацию.")}
            </div>
          </div>

          ${criticHtml}

          <div class="panel">
            <div class="kicker">Шаг 03</div>
            <h2 class="title">Редактор</h2>
            <p class="text mt-8">Выбери формат текста. Канал публикации всегда один — Telegram.</p>
            
            <div class="platforms mt-16">
              ${Object.keys(platforms).map(renderPlatform).join("")}
            </div>

            <div class="output-box mt-16">
              <div class="form">
                <label class="field"><span class="label">Заголовок</span><input class="input" data-action="edit-content" data-field="headline" value="${escapeHtml(content.headline)}" /></label>
                <label class="field">
                  <span class="label">Текст</span>
                  <textarea class="textarea minh-200" data-action="edit-content" data-field="body">${escapeHtml(content.body)}</textarea>
                  <!-- AI Refinement Accordion -->
                  <details class="refine-details">
                    <summary class="refine-summary">
                      <span>✨ Улучшить текст с помощью ИИ (быстрые промпты)</span>
                      <span class="fs-10 text-muted">&#9662;</span>
                    </summary>
                    <div class="inline-wrap gap-6 mt-8" data-stop-propagation>
                      <button class="btn small refine-btn refine-btn-pain" data-action="refine-pain" type="button">💥 Усилить боль</button>
                      <button class="btn small refine-btn refine-btn-proof" data-action="refine-proof" type="button">🛡️ Добавить факт</button>
                      <button class="btn small refine-btn refine-btn-shorten" data-action="refine-shorten" type="button">✂️ Сократить</button>
                      <button class="btn small refine-btn refine-btn-dzen" data-action="refine-dzen" type="button">✍️ Под Дзен (SEO)</button>
                      <button class="btn small refine-btn refine-btn-telegram" data-action="refine-telegram" type="button">📢 Под Telegram</button>
                    </div>
                  </details>
                </label>
                <label class="field"><span class="label">Теги</span><input class="input" data-action="edit-content" data-field="tags" value="${escapeHtml(content.tags)}" /></label>
                <div class="publication-limit ${publicationLength > telegramLimit ? "is-over" : ""}" data-publication-limit>
                  <span>Объём публикации: ${publicationLength} / ${telegramLimit} знаков</span>
                  ${publicationLength > telegramLimit
                    ? `<strong>${selectedMedia ? "С медиа Telegram допускает подпись до 1024 знаков." : "Сократи текст перед публикацией."}</strong>`
                    : `<span>Готово для одного сообщения в Telegram</span>`}
                </div>
                <label class="field">
                  <span class="label">Медиа-файл</span>
                  <select class="select" data-action="select-media">
                    <option value="">Без файла</option>
                    ${state.media.map(m => `<option value="${m.id}" ${state.selectedMediaId === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="actions mt-24">
                <button class="btn primary" data-action="publish-current-telegram">${icons.send} Опубликовать в Telegram</button>
                <button class="btn" data-action="add-to-queue" data-schedule-button>Запланировать на ${escapeHtml(planner.publishDate)} в ${escapeHtml(planner.publishTime)}</button>
                <button class="btn" data-action="generate-image">${icons.spark} Сгенерировать картинку</button>
                <button class="btn" data-action="copy-current">${icons.copy} Копировать материал</button>
              </div>
            </div>
          </div>

          ${visualizerHtml}
        </div>
      </section>
    `;
  }

  function selectedIdeaMedia() {
    const idea = selectedIdea();
    const mediaId = idea?.mediaId || state.selectedMediaId || "";
    return state.media.find((item) => item.id === mediaId) || null;
  }

  function renderMaterialCard(item) {
    const content = item.formats?.[state.activePlatform] || item.formats?.telegram || {};
    const media = state.media.find((candidate) => candidate.id === item.mediaId);
    const inQueue = state.queue.filter((post) => post.sourceIdeaId === item.id && post.status !== "published").length;
    const source = item.source === "chatgpt-app" ? "ChatGPT" : "TimeWeb";
    return `
      <article class="material-card ${item.id === state.selectedIdeaId ? "active" : ""}">
        <label class="selection-check" title="Выбрать для пакетной постановки">
          <input type="checkbox" data-action="material-check" data-id="${escapeHtml(item.id)}"
            ${selectedMaterialIds.has(item.id) ? "checked" : ""}>
          <span>В очередь пачкой</span>
        </label>
        <button class="material-open" type="button" data-action="select-idea" data-id="${escapeHtml(item.id)}">
          <span class="item-title">${escapeHtml(content.headline || item.title || "Без заголовка")}</span>
          <span class="item-sub">${escapeHtml(source)}${inQueue ? ` · в очереди: ${inQueue}` : ""}</span>
        </button>
        <div class="material-card-foot">
          <span class="chip ${media ? "ok" : "info"}">${media ? "Картинка прикреплена" : "Без картинки"}</span>
          <button class="btn small danger" type="button" data-action="delete-material" data-id="${escapeHtml(item.id)}">Удалить</button>
        </div>
      </article>
    `;
  }

  function renderMaterials() {
    const idea = selectedIdea();
    const content = selectedContent();
    const media = selectedIdeaMedia();
    const planner = ensurePlanner();
    const textLength = formatPublicationText({
      title: content.headline,
      body: content.body,
      tags: content.tags
    }).length;
    const chatgptPrompt = `Подготовь для проекта ${activeProject()?.name || "Motor Port"} один сильный пост для Telegram: plain text без Markdown и символов ##, с заголовком, полезным основным текстом и подходящей картинкой. После моей проверки сохрани материал в Контент-завод.`;

    return `
      <section class="page-head">
        <div>
          <div class="kicker">Главный рабочий экран</div>
          <h1 class="title-xl">Материалы</h1>
          <p class="text">Создай текст и картинку в ChatGPT, проверь здесь и отправь в Telegram сразу или по расписанию.</p>
        </div>
        <div class="actions">
          <a class="btn primary" href="https://chatgpt.com/" target="_blank" rel="noopener">Открыть ChatGPT</a>
          <button class="btn" type="button" data-action="copy-text-custom" data-text="${escapeHtml(chatgptPrompt)}">Скопировать задание</button>
          <button class="btn" type="button" data-action="new-material">Новый материал</button>
        </div>
      </section>

      <div class="connection-strip">
        <div>
          <strong>ChatGPT подключён к проекту</strong>
          <span>Готовые тексты и изображения автоматически появляются в этом списке.</span>
        </div>
        <span class="chip ok">Подключено</span>
      </div>

      ${selectedMaterialIds.size ? `
        <div class="batch-bar">
          <div>
            <strong>Выбрано материалов: ${selectedMaterialIds.size}</strong>
            <span>Поставь их подряд с одинаковым интервалом.</span>
          </div>
          <div class="actions">
            <button class="btn primary" type="button" data-action="open-batch-schedule" data-kind="materials">Поставить пачкой</button>
            <button class="btn" type="button" data-action="clear-material-selection">Снять выбор</button>
          </div>
        </div>
      ` : ""}

      <section class="materials-layout">
        <aside class="panel materials-list-panel">
          <div class="section-head">
            <div>
              <h2 class="title">Готовые материалы</h2>
              <p class="text">${state.ideas.length ? `Всего: ${state.ideas.length}` : "Пока пусто"}</p>
            </div>
          </div>
          <div class="materials-list">
            ${state.ideas.length
              ? state.ideas.map(renderMaterialCard).join("")
              : renderEmpty("Попроси ChatGPT подготовить первый пост или создай черновик вручную.")}
          </div>

          <details class="fallback-generator">
            <summary>Резервная генерация через TimeWeb</summary>
            <div class="form details-body" data-stop-propagation>
              <label class="field">
                <span class="label">Тема материала</span>
                <textarea class="textarea minh-80" data-action="project-input" name="details" placeholder="Один конкретный вопрос или проблема читателя">${escapeHtml(activeProject()?.details || "")}</textarea>
              </label>
              <label class="field">
                <span class="label">Формат</span>
                <select class="select" data-action="apply-template-select">
                  ${contentTemplates.map((template) => `<option value="${template.id}" ${template.id === state.activeTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span class="label">Количество</span>
                <select class="select" data-action="setting-input" name="ideaCount">
                  ${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${String(state.settings.ideaCount || "3") === String(count) ? "selected" : ""}>${count}</option>`).join("")}
                </select>
              </label>
              <button class="btn" type="button" data-action="generate">Сгенерировать через TimeWeb</button>
            </div>
          </details>
        </aside>

        <div class="panel material-editor">
          ${idea ? `
            <div class="section-head editor-head">
              <div>
                <div class="kicker">Редактор</div>
                <h2 class="title">Проверка перед публикацией</h2>
              </div>
              <div class="segmented" aria-label="Формат материала">
                <button class="${state.activePlatform === "telegram" ? "active" : ""}" type="button" data-action="select-platform" data-platform="telegram">Пост Telegram</button>
                <button class="${state.activePlatform === "dzen" ? "active" : ""}" type="button" data-action="select-platform" data-platform="dzen">Статья Дзен</button>
              </div>
            </div>

            <div class="editor-grid">
              <div class="form">
                <label class="field">
                  <span class="label">Заголовок</span>
                  <input class="input" data-action="edit-content" data-field="headline" value="${escapeHtml(content.headline || "")}">
                </label>
                <label class="field">
                  <span class="label">Текст</span>
                  <textarea class="textarea material-body" data-action="edit-content" data-field="body">${escapeHtml(content.body || "")}</textarea>
                </label>
                <label class="field">
                  <span class="label">Теги или подпись в конце</span>
                  <input class="input" data-action="edit-content" data-field="tags" value="${escapeHtml(content.tags || "")}">
                </label>
                <div class="publication-limit ${textLength > 4096 ? "is-over" : ""}" data-publication-limit>
                  <span>${textLength} / 4096 знаков</span>
                  <span>${textLength > 4096 ? "Нужно сократить текст" : "Объём подходит для Telegram"}</span>
                </div>
              </div>

              <div class="media-assignment">
                <span class="label">Картинка материала</span>
                ${renderPreview(media)}
                <select class="select" data-action="select-media">
                  <option value="">Без картинки</option>
                  ${state.media.map((item) => `<option value="${item.id}" ${media?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
                </select>
                <div class="stack gap-8">
                  <button class="btn" type="button" data-action="tab" data-tab="media">Выбрать из медиатеки</button>
                  <button class="btn" type="button" data-action="generate-image">Сгенерировать через TimeWeb</button>
                </div>
              </div>
            </div>

            <div class="schedule-panel">
              <div class="quick-publish">
                <button class="btn primary" type="button" data-action="publish-current-telegram">Опубликовать сейчас</button>
                <button class="btn" type="button" data-action="quick-schedule-material" data-hours="1">Через 1 час</button>
                <button class="btn" type="button" data-action="quick-schedule-material" data-hours="2">Через 2 часа</button>
                <button class="btn" type="button" data-action="open-batch-schedule" data-kind="current">Выбрать время</button>
              </div>
              <div class="schedule-note">
                Ближайшее предложенное время: ${escapeHtml(planner.publishDate)} в ${escapeHtml(planner.publishTime)}
              </div>
            </div>
          ` : renderEmpty("Выбери материал слева или создай новый черновик.")}
        </div>
      </section>
    `;
  }

  function renderMedia() {
    const maxUploadMb = Number(state.settings.maxUploadMb || 50);
    const idea = selectedIdea();
    return `
      <section class="page-head">
        <div>
          <div class="kicker">Обложки и иллюстрации</div>
          <h1 class="title-xl">Медиа</h1>
          <p class="text">Картинки из ChatGPT появляются здесь автоматически. Любую можно назначить выбранному материалу.</p>
        </div>
        ${idea ? `<span class="chip info">Выбран материал: ${escapeHtml(shorten(idea.title, 45))}</span>` : ""}
      </section>

      <div class="panel">
        <div class="upload-zone upload-zone-shell" id="uploadZone">
          <input type="file" id="mediaFile" accept="image/*,video/*" aria-label="Выбрать изображение или видео" class="upload-input">
          <div class="fw-600 text-accent">Перетащи файл сюда или нажми для выбора</div>
          <div class="upload-help">Изображения и видео до ${maxUploadMb} МБ</div>
          <div id="uploadPreview" class="upload-preview" data-stop-propagation>
            <div id="previewMediaContainer" class="upload-preview-frame"></div>
            <div id="previewFileName" class="fs-12 fw-600 text-main"></div>
            <button class="btn primary mt-8" type="button" data-action="upload-media">Загрузить файл</button>
          </div>
        </div>
      </div>

      <div class="media-grid">
        ${state.media.length ? state.media.map(renderMediaItem).join("") : renderEmpty("Медиатека пока пустая.")}
      </div>
    `;
  }

  function renderQueue() {
    const stats = queueStats();
    const filter = state.queueFilter || "pending";
    const visible = state.queue.filter((item) => {
      if (filter === "all") return true;
      if (filter === "published") return item.status === "published";
      if (filter === "error") return item.status === "error";
      return !["published"].includes(item.status);
    });
    return `
      <section class="page-head">
        <div>
          <div class="kicker">Автопубликация в @motorports</div>
          <h1 class="title-xl">Очередь</h1>
          <p class="text">Публикации выходят автоматически. Здесь можно поменять время, выпустить сейчас или вернуть материал в черновики.</p>
        </div>
        <label class="field queue-filter">
          <span class="label">Показать</span>
          <select class="select" data-action="queue-filter">
            <option value="pending" ${filter === "pending" ? "selected" : ""}>Ожидают публикации</option>
            <option value="published" ${filter === "published" ? "selected" : ""}>Опубликованные</option>
            <option value="error" ${filter === "error" ? "selected" : ""}>С ошибкой</option>
            <option value="all" ${filter === "all" ? "selected" : ""}>Все</option>
          </select>
        </label>
      </section>

      <div class="queue-metrics">
        <div class="metric"><div class="metric-value">${stats.today}</div><div class="metric-label">На сегодня</div></div>
        <div class="metric"><div class="metric-value">${stats.scheduled}</div><div class="metric-label">Ожидают</div></div>
        <div class="metric"><div class="metric-value">${stats.published}</div><div class="metric-label">Опубликовано</div></div>
        <div class="metric"><div class="metric-value">${stats.errors}</div><div class="metric-label">Ошибки</div></div>
      </div>

      ${selectedQueueIds.size ? `
        <div class="batch-bar">
          <div>
            <strong>Выбрано публикаций: ${selectedQueueIds.size}</strong>
            <span>Перестрой расписание одним действием.</span>
          </div>
          <div class="actions">
            <button class="btn primary" type="button" data-action="open-batch-schedule" data-kind="queue">Перенести пачкой</button>
            <button class="btn" type="button" data-action="clear-queue-selection">Снять выбор</button>
          </div>
        </div>
      ` : ""}

      <div class="stack">
        ${visible.length ? visible.map(renderQueueCard).join("") : renderEmpty("В этом разделе публикаций нет.")}
      </div>
    `;
  }

  function renderBoard() {
    const publishedItems = state.queue.filter(q => q.status === "published");
    const pendingItems = state.queue.filter(q => q.status === "scheduled" || q.status === "ready");
    return `
      <div class="panel">
        <h1 class="title-xl">Канбан-доска</h1>
        <p class="text">Движение задач: от идеи до публикации.</p>
      </div>
      <div class="kanban-board" id="kanbanBoard">
        <!-- Backlog -->
        <div class="kanban-column" id="kb-backlog" data-kanban-target="backlog">
          <div class="kanban-column-header">Бэклог <span>${state.ideas.length}</span></div>
          ${state.ideas.length ? state.ideas.map((idea) => `
            <div class="kanban-card" draggable="true" data-drag-type="idea" data-drag-id="${escapeHtml(idea.id)}" data-action="select-idea" data-id="${escapeHtml(idea.id)}">
              <div class="kanban-card-title">${escapeHtml(idea.title)}</div>
              <div class="kanban-card-meta"><span>${escapeHtml(idea.pillar)}</span></div>
              <div class="inline-row gap-4 mt-8" data-stop-propagation>
                <button class="btn small kanban-action" data-action="kanban-to-editor" data-id="${escapeHtml(idea.id)}">✍️ В редактор</button>
                <button class="btn small primary kanban-action" data-action="kanban-to-queue" data-id="${escapeHtml(idea.id)}">📅 В очередь</button>
              </div>
            </div>
          `).join("") : renderEmpty("Пусто")}
        </div>

        <!-- Ready -->
        <div class="kanban-column" id="kb-ready" data-kanban-target="ready">
          <div class="kanban-column-header">В редакторе <span>${selectedIdea() ? 1 : 0}</span></div>
          ${state.ideas.length ? `
            <div class="kanban-card border-accent" data-action="tab" data-tab="factory">
              <div class="kanban-card-title">${escapeHtml(selectedIdea()?.title || state.ideas[0]?.title)}</div>
              <div class="kanban-card-meta"><span>Активно</span></div>
              <div class="inline-row gap-4 mt-8" data-stop-propagation>
                <button class="btn small primary kanban-action kanban-action-full" data-action="kanban-editor-to-queue">📅 В очередь</button>
              </div>
            </div>
          ` : renderEmpty("Пусто")}
        </div>

        <!-- Scheduled -->
        <div class="kanban-column" id="kb-scheduled" data-kanban-target="scheduled">
          <div class="kanban-column-header">К публикации <span>${pendingItems.length}</span></div>
          ${pendingItems.length ? pendingItems.map(item => `
            <div class="kanban-card" draggable="true" data-drag-type="scheduled" data-drag-id="${escapeHtml(item.id)}" data-action="open-queue" data-id="${escapeHtml(item.id)}">
              <div class="kanban-card-title">${escapeHtml(item.title)}</div>
              <div class="kanban-card-meta"><span class="chip ok">${escapeHtml(item.platform)}</span></div>
              <div class="inline-row gap-4 mt-8" data-stop-propagation>
                <button class="btn small green" data-action="publish-one" data-id="${escapeHtml(item.id)}">Опубликовать в Telegram</button>
                <button class="btn small danger kanban-action" data-action="remove-queue" data-id="${escapeHtml(item.id)}">❌ Удалить</button>
              </div>
            </div>
          `).join("") : renderEmpty("Пусто")}
        </div>

        <!-- Published -->
        <div class="kanban-column" id="kb-published" data-kanban-target="published">
          <div class="kanban-column-header">Опубликовано <span>${publishedItems.length}</span></div>
          ${publishedItems.length ? publishedItems.map(item => `
            <div class="kanban-card is-dimmed">
              <div class="kanban-card-title text-strike">${escapeHtml(item.title)}</div>
            </div>
          `).join("") : renderEmpty("Пусто")}
        </div>
      </div>
    `;
  }

  function renderProjects() {
    const project = activeProject();
    return `
      <div class="panel">
        <div class="row">
          <h1 class="title-xl">Проекты</h1>
          <button class="btn primary" data-action="new-project">Новый проект</button>
        </div>
      </div>
      <div class="workbench">
        <aside class="stack">
          ${state.projects.map(p => `
            <button type="button" class="project-card ${p.id === state.activeProjectId ? 'active' : ''}" data-action="select-project" data-id="${escapeHtml(p.id)}">
              <div class="item-title">${escapeHtml(p.name)}</div>
              <div class="item-sub">Бриф: ${p.briefText ? 'Заполнен' : 'Пуст'}</div>
            </button>
          `).join("")}
        </aside>
        <div class="panel">
          <h2 class="title">Настройки проекта</h2>
          <div class="form mt-16">
            <label class="field">
              <span class="label">Название</span>
              <input class="input" data-action="project-input" name="name" value="${escapeHtml(project.name)}" />
            </label>
            <label class="field">
              <span class="label">Бриф</span>
              <textarea class="textarea" data-action="project-input" name="briefText">${escapeHtml(project.briefText || "")}</textarea>
            </label>
            <div class="actions">
              <button class="btn danger" data-action="delete-project">Удалить проект</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderProjectCenter() {
    const project = activeProject();
    const completion = getProjectCompletionPercentage(project);
    return `
      <section class="page-head">
        <div>
          <div class="kicker">Единая база для ChatGPT и TimeWeb</div>
          <h1 class="title-xl">Проект</h1>
          <p class="text">Здесь лежат факты, которыми ИИ может пользоваться. Чем точнее база, тем меньше выдумок в публикациях.</p>
        </div>
        <span class="chip ${completionChipClass(completion)}">Заполнено: ${completion}%</span>
      </section>

      <div class="panel">
        <div class="form">
          <label class="field">
            <span class="label">Сайт проекта</span>
            <div class="inline-center gap-10">
              <input class="input" data-action="project-input" name="landingPage" placeholder="https://site.ru" value="${escapeHtml(project.landingPage || "")}">
              <button class="btn nowrap" type="button" data-action="import-project-url">Обновить данные с сайта</button>
            </div>
          </label>
          <label class="field">
            <span class="label">Общий бриф</span>
            <textarea class="textarea minh-150" data-action="project-input" name="briefText" placeholder="Главное о компании, продукте и клиентах">${escapeHtml(project.briefText || "")}</textarea>
          </label>
          <div class="actions">
            <button class="btn primary" type="button" data-action="import-project-brief">Разложить бриф по полям</button>
            <button class="btn" type="button" data-action="fill-brief-template">Вставить шаблон брифа</button>
          </div>
        </div>
      </div>

      <div class="project-sections">
        <details class="panel brief-section" open>
          <summary class="brief-summary">
            <span>Что продаём</span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field"><span class="label">Название</span><input class="input" data-action="project-input" name="name" value="${escapeHtml(project.name || "")}"></label>
            <label class="field"><span class="label">Ниша</span><input class="input" data-action="project-input" name="niche" value="${escapeHtml(project.niche || "")}"></label>
            <label class="field"><span class="label">Оффер</span><textarea class="textarea minh-80" data-action="project-input" name="offer">${escapeHtml(project.offer || "")}</textarea></label>
            <div class="auto-tight">
              <label class="field"><span class="label">Цена или условия</span><input class="input" data-action="project-input" name="price" value="${escapeHtml(project.price || "")}"></label>
              <label class="field"><span class="label">Сроки</span><input class="input" data-action="project-input" name="timelines" value="${escapeHtml(project.timelines || "")}"></label>
              <label class="field"><span class="label">Гарантия</span><input class="input" data-action="project-input" name="warranty" value="${escapeHtml(project.warranty || "")}"></label>
            </div>
          </div>
        </details>

        <details class="panel brief-section">
          <summary class="brief-summary">
            <span>Кому и зачем</span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field"><span class="label">Аудитория</span><textarea class="textarea minh-80" data-action="project-input" name="audience">${escapeHtml(project.audience || "")}</textarea></label>
            <label class="field"><span class="label">Главная боль</span><textarea class="textarea minh-80" data-action="project-input" name="pain">${escapeHtml(project.pain || "")}</textarea></label>
            <label class="field"><span class="label">Страх или возражение</span><textarea class="textarea minh-80" data-action="project-input" name="fear">${escapeHtml(project.fear || "")}</textarea></label>
          </div>
        </details>

        <details class="panel brief-section">
          <summary class="brief-summary">
            <span>Факты и доказательства</span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field"><span class="label">Что можно подтвердить</span><textarea class="textarea minh-100" data-action="project-input" name="proof">${escapeHtml(project.proof || "")}</textarea></label>
            <label class="field"><span class="label">Цифры, кейсы, отзывы</span><textarea class="textarea minh-100" data-action="project-input" name="facts">${escapeHtml(project.facts || "")}</textarea></label>
            <label class="field"><span class="label">Преимущества с механизмом</span><textarea class="textarea minh-80" data-action="project-input" name="advantages">${escapeHtml(project.advantages || "")}</textarea></label>
          </div>
        </details>

        <details class="panel brief-section">
          <summary class="brief-summary">
            <span>Правила текста</span>
            <span class="details-chevron">&#9662;</span>
          </summary>
          <div class="form details-body" data-stop-propagation>
            <label class="field"><span class="label">Цель публикаций</span><input class="input" data-action="project-input" name="goal" value="${escapeHtml(project.goal || "")}"></label>
            <label class="field"><span class="label">Следующий шаг для читателя</span><input class="input" data-action="project-input" name="nextStep" value="${escapeHtml(project.nextStep || "")}"></label>
            <label class="field"><span class="label">Тон</span><input class="input" data-action="project-input" name="tone" value="${escapeHtml(project.tone || "")}"></label>
            <label class="field"><span class="label">Что нельзя писать</span><textarea class="textarea minh-80" data-action="project-input" name="common">${escapeHtml(project.common || "")}</textarea></label>
          </div>
        </details>
      </div>
    `;
  }

  function renderSettings() {
    const s = state.settings;
    return `
      <section class="page-head">
        <div>
          <div class="kicker">Состояние подключений</div>
          <h1 class="title-xl">Настройки</h1>
          <p class="text">Основной канал — Telegram. Отсюда публикации автоматически забирает твой бот для Дзена.</p>
        </div>
      </section>
      <div class="settings-grid">
        <div class="panel">
          <h2 class="title">Сервер и TimeWeb</h2>
          <div class="form mt-16">
            <div class="service-status">
              <span class="status-dot ${s.backendStatus === "работает" ? "is-ok" : "is-bad"}"></span>
              <div><strong>Сервер: ${escapeHtml(s.backendStatus || "проверяется")}</strong><span>TimeWeb остаётся резервной генерацией.</span></div>
            </div>
            <div class="actions">
              <button class="btn" type="button" data-action="check-backend">Проверить сервер</button>
              <button class="btn" type="button" data-action="check-ai-key">Проверить TimeWeb</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <h2 class="title">ChatGPT</h2>
          <div class="form mt-16">
            <div class="service-status">
              <span class="status-dot ${s.chatgptAppReady ? "is-ok" : "is-bad"}"></span>
              <div><strong>${s.chatgptAppReady ? "Интеграция работает" : "Проверяем интеграцию"}</strong><span>ChatGPT читает проект и сохраняет текст вместе с картинкой.</span></div>
            </div>
            <label class="field">
              <span class="label">Адрес подключения</span>
              <input class="input" value="${escapeHtml(s.chatgptMcpUrl || "")}" readonly>
            </label>
            <div class="actions">
              <button class="btn" type="button" data-action="copy-text-custom" data-text="${escapeHtml(s.chatgptMcpUrl || "")}">Скопировать адрес</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <h2 class="title">Telegram</h2>
          <div class="form mt-16">
            ${s.telegramManagedExternally ? `
              <div class="service-status">
                <span class="status-dot is-ok"></span>
                <div><strong>@motorports подключён</strong><span>Токен хранится на защищённом Worker.</span></div>
              </div>
            ` : `
              <label class="field"><span class="label">Bot Token</span><input class="input" type="password" data-action="setting-input" name="telegramBotToken" value="${escapeHtml(s.telegramBotToken)}" /></label>
              <label class="field"><span class="label">Chat ID</span><input class="input" data-action="setting-input" name="telegramChatId" value="${escapeHtml(s.telegramChatId)}" /></label>
            `}
            <p class="text">${s.telegramSchedulerReady ? "Очередь проверяется каждую минуту." : "Сначала сохрани Bot Token и Chat ID."}</p>
            ${s.telegramManagedExternally ? "" : `<button class="btn primary" data-action="save-server-config">Сохранить</button>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderLogs() {
    return `
      <div class="panel">
        <div class="row">
          <h1 class="title-xl">Системный журнал</h1>
          <button class="btn danger" data-action="clear-logs">Очистить логи</button>
        </div>
        <div class="stack mt-24">
          ${state.logs.length ? state.logs.map(log => `
            <div class="log ${log.type}">
              <div class="log-time">${escapeHtml(log.time)}</div>
              <div class="log-text">${escapeHtml(log.text)}</div>
              ${log.meta ? `<div class="log-meta">${escapeHtml(log.meta)}</div>` : ''}
            </div>
          `).join("") : renderEmpty("Журнал пуст.")}
        </div>
      </div>
    `;
  }

  // Small render helpers
  function renderIdea(item) {
    return `
      <button type="button" class="idea ${item.id === state.selectedIdeaId ? "active" : ""}" data-action="select-idea" data-id="${escapeHtml(item.id)}">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-sub">${escapeHtml(item.angle)}</div>
        <div class="item-foot">
          <span class="chip ${String(item.status || "").includes("проверь") ? "warn" : "ok"}">${escapeHtml(item.status || "Готово")}</span>
          <span class="chip ok">${item.score != null && item.score !== "" ? item.score + "%" : "—"}</span>
        </div>
      </button>
    `;
  }

  function renderPlatform(id) {
    return `<button class="platform ${state.activePlatform === id ? 'active' : ''}" data-action="select-platform" data-platform="${id}"><span class="platform-title">${escapeHtml(platforms[id].name)}</span><span class="platform-sub">${escapeHtml(platforms[id].short)}</span></button>`;
  }

  function renderTemplateCard(item) {
    return `
      <button type="button" class="template-card ${item.id === state.activeTemplateId ? 'active' : ''}" data-action="apply-template" data-template="${escapeHtml(item.id)}">
        <div class="item-title">${escapeHtml(item.name)}</div>
        <div class="item-sub">${escapeHtml(item.goal)}</div>
      </button>
    `;
  }

  function renderMediaItem(item) {
    const assigned = selectedIdea()?.mediaId === item.id;
    return `
      <article class="media-card ${assigned ? "active" : ""}">
        ${renderPreview(item)}
        <div class="item-title mt-12">${escapeHtml(item.name)}</div>
        <div class="item-sub">${item.source === "chatgpt-app" ? "Создано в ChatGPT" : "Загружено в проект"}</div>
        <div class="item-foot">
          <button class="btn small ${assigned ? "" : "primary"}" type="button" data-action="select-media-card" data-id="${escapeHtml(item.id)}">${assigned ? "Прикреплено" : "К материалу"}</button>
          <button class="btn danger small" type="button" data-action="delete-media" data-id="${escapeHtml(item.id)}">Удалить</button>
        </div>
      </article>
    `;
  }

  function renderQueueCard(item) {
    const contentFormat = item.contentFormat || (item.platform === "dzen" ? "dzen" : "telegram");
    const platformName = platforms[contentFormat]?.name || "Материал";
    const isPublished = item.status === "published";
    const canSelect = !isPublished;
    const statusText = item.state || (isPublished ? "Опубликовано" : "Запланировано");
    return `
      <div class="queue-card">
        ${canSelect ? `
          <label class="selection-check">
            <input type="checkbox" data-action="queue-check" data-id="${escapeHtml(item.id)}" ${selectedQueueIds.has(item.id) ? "checked" : ""}>
            <span>Выбрать</span>
          </label>
        ` : ""}
        <div class="row m-0">
          <div>
            <div class="item-title">${escapeHtml(item.title)}</div>
            <div class="item-sub">${[item.publishDate, item.publishTime].filter(Boolean).map(escapeHtml).join(" ") || "Без даты"} · ${escapeHtml(platformName)} → Telegram</div>
          </div>
          <span class="chip ${isPublished ? 'ok' : item.status === 'error' ? 'bad' : 'info'}">${escapeHtml(statusText)}</span>
        </div>
        <div class="text-mono my-12">${escapeHtml(shorten(item.body, 100))}</div>
        <div class="actions">
          ${!isPublished ? `<button class="btn small" type="button" data-action="open-queue" data-id="${escapeHtml(item.id)}">Изменить</button>` : ""}
          ${!isPublished
            ? `<button class="btn green small" type="button" data-action="publish-one" data-id="${escapeHtml(item.id)}">Опубликовать сейчас</button>
               <button class="btn small" type="button" data-action="return-to-materials" data-id="${escapeHtml(item.id)}">Передумал — вернуть</button>`
            : ""}
          <button class="btn danger small" type="button" data-action="remove-queue" data-id="${escapeHtml(item.id)}">Удалить</button>
        </div>
      </div>
    `;
  }

  function renderPreview(item) {
    if (!item) return `<div class="preview preview-empty">Картинка не выбрана</div>`;
    if (item.type?.startsWith("image/")) return `<div class="preview"><img src="${escapeHtml(item.url)}" alt="media"></div>`;
    if (item.type?.startsWith("video/")) return `<div class="preview"><video src="${escapeHtml(item.url)}"></video></div>`;
    return `<div class="preview">Файл</div>`;
  }

  function renderPlannerInput(name, label, value, placeholder, type = "text") {
    return `<label class="field"><span class="label">${escapeHtml(label)}</span><input class="input" type="${type}" data-action="planner-input" name="${name}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" /></label>`;
  }

  function renderEmpty(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
  function shorten(str, len) { return str && str.length > len ? str.slice(0, len) + "..." : str; }
  function datePart(d) { return d ? d.split("T")[0] : ""; }

  /* Kanban Handlers */
  function handleKanbanDrop(event, col, target) {
    col.classList.remove('drag-over');
    if (kanbanDragCard) kanbanDragCard.classList.remove('is-dragging');
    kanbanDragCard = null;
    event.preventDefault();
    try {
      const { type, id } = JSON.parse(event.dataTransfer.getData('text/plain'));
      if (target === 'ready' && type === 'idea') {
        state.selectedIdeaId = id; state.activeTab = 'factory';
        saveState(); render(); showToast("Открыто в редакторе");
      } else if (target === 'scheduled' && type === 'idea') {
        const idea = state.ideas.find(i => i.id === id);
        if (idea) {
          const contentFormat = state.activePlatform || "dzen";
          if (!confirmDzenReadiness(contentFormat)) return;
          const content = idea.formats?.[contentFormat] || {};
          const publishDate = todayInputValue();
          const publishTime = nextHourInputValue();
          state.queue.push({
            id: uid('q'),
            title: plainPublicationHeadline(content.headline || idea.title),
            body: plainPublicationText(content.body || idea.title),
            tags: plainPublicationText(content.tags || ""),
            publishDate,
            publishTime,
            scheduledAt: scheduledAtIso(publishDate, publishTime),
            platform: "telegram",
            contentFormat,
            status: "scheduled",
            state: "Запланировано"
          });
          saveState(); render(); showToast("В очереди!");
        }
      } else if (target === 'published' && type === 'scheduled') {
        publishOne(id);
      }
    } catch {
      showToast("Не удалось переместить карточку");
    }
  }

  /* Network / Logic hooks (same as before) */
  function workspacePayload() { return { activeProjectId: state.activeProjectId, activePlatform: state.activePlatform, activeTemplateId: state.activeTemplateId, selectedIdeaId: state.selectedIdeaId, selectedMediaId: state.selectedMediaId, planner: state.planner, projects: state.projects, ideas: state.ideas, media: state.media, queue: state.queue, logs: state.logs, critic: state.critic }; }
  function scheduleWorkspaceSave() { if (!serverSyncReady || !token()) return; clearTimeout(serverSaveTimer); serverSaveTimer = setTimeout(pushWorkspace, 800); }
  async function pushWorkspace() { if (!token()) return; try { await request("/api/workspace", { method: "PUT", body: { workspace: workspacePayload() } }); } catch (e) { } }
  async function fetchWorkspace() {
    if (!token()) return;
    try {
      const data = await request("/api/workspace");
      serverSyncReady = true;
      if (data.workspace && data.workspace.projects) {
        state = { ...state, ...data.workspace };
        if (!["materials", "queue", "media", "project", "settings"].includes(state.activeTab)) {
          state.activeTab = "materials";
        }
        state.ideas = sanitizeContentItems(state.ideas);
        state.queue = sanitizeQueueItems(state.queue);
        const currentIdea = state.ideas.find((idea) => idea.id === state.selectedIdeaId) || state.ideas[0];
        if (currentIdea) {
          state.selectedIdeaId = currentIdea.id;
          state.selectedMediaId = currentIdea.mediaId || state.selectedMediaId || "";
        }
        if (data.limitInfo) state.limitInfo = data.limitInfo;
        if (data.openaiReady !== undefined) state.settings.openaiReady = data.openaiReady;
        ensurePlanner();
        syncActiveTemplatePlatform();
        saveState();
        render();
      }
    } catch (e) {
      serverSyncReady = true;
      render();
    }
  }
  async function checkBackend(withToast = true) { try { const data = await request("/api/health", { public: true }); state.settings.backendStatus = (data.ok || data.raw === "ok") ? "работает" : "ошибка"; if (withToast) showToast("Сервер ОК"); render(); } catch (e) { state.settings.backendStatus = "ошибка"; if (withToast) showToast("Ошибка сервера"); render(); } }
  async function fetchConfig() { if (!token()) return; try { const data = await request("/api/config"); state.settings = { ...state.settings, ...data }; render(); } catch (e) { } }
  async function saveServerConfig() { setBusy(true); try { await request("/api/config", { method: "POST", body: { telegramBotToken: state.settings.telegramBotToken, telegramChatId: state.settings.telegramChatId } }); showToast("Сохранено"); await fetchConfig(); } catch (e) { showToast("Ошибка"); } finally { setBusy(false); render(); } }
  async function checkAiKey() { setBusy(true); try { await request("/api/ai/test", { method: "POST" }); state.settings.openaiReady = true; showToast("ИИ работает"); render(); } catch (e) { state.settings.openaiReady = false; showToast("Ошибка ИИ"); render(); } finally { setBusy(false); } }
  function applyProjectPatch(patch = {}) {
    const project = activeProject();
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const text = String(value).trim();
      if (!text) return;
      project[key] = text;
    });
    saveState();
    scheduleWorkspaceSave();
  }

  async function makeBriefTemplate({ copyOnly = false } = {}) {
    setBusy(true);
    try {
      const data = await request("/api/project/brief-template", {
        method: "POST",
        body: {
          project: activeProject(),
          template: activeTemplate(),
          ideaCount: state.settings.ideaCount || "3"
        }
      });
      const brief = data.brief || "";
      if (copyOnly) {
        await copyText(brief);
      } else {
        activeProject().briefText = brief;
        state.activeTab = "project";
        saveState();
        scheduleWorkspaceSave();
        showToast("Шаблон брифа вставлен");
      }
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false);
      render();
    }
  }

  async function importProjectBrief() {
    const text = String(activeProject().briefText || "").trim();
    if (!text) { showToast("Вставь бриф"); return; }
    setBusy(true);
    try {
      const data = await request("/api/project/import-brief", { method: "POST", body: { text } });
      applyProjectPatch(data.project || {});
      showToast("Бриф разложен по полям");
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false);
      render();
    }
  }

  async function importProjectUrl() {
    const url = String(activeProject().landingPage || "").trim();
    if (!url) { showToast("Вставь ссылку"); return; }
    setBusy(true);
    try {
      const data = await request("/api/project/import-url", { method: "POST", body: { url } });
      applyProjectPatch(data.project || {});
      showToast("Сайт разобран");
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false);
      render();
    }
  }

  async function generate() {
    setBusy(true); showGenerationOverlay();
    try {
      const data = await request("/api/generate", { method: "POST", body: { project: activeProject(), settings: state.settings, platform: state.activePlatform, planner: ensurePlanner(), templateId: state.activeTemplateId } });
      const generatedIdeas = sanitizeContentItems(data.ideas || [])
        .map(i => ({ id: uid("i"), source: "timeweb", mediaId: "", ...i, status: i.status || "Готово" }));
      state.ideas = [...generatedIdeas, ...state.ideas];
      state.critic = data.critic || null;
      state.selectedIdeaId = generatedIdeas[0]?.id || state.ideas[0]?.id || "";
      state.selectedMediaId = generatedIdeas[0]?.mediaId || "";
      state.activeTab = "materials";
      showToast(data.warning ? "Получился черновик. Проверь факты перед публикацией." : "Статьи готовы");
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      hideGenerationOverlay(); setBusy(false); render();
    }
  }
  async function uploadMedia() {
    const file = document.getElementById("mediaFile")?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("projectId", activeProject().id);
      const data = await request("/api/upload", { method: "POST", body: fd });
      state.media.unshift({ id: data.id, name: data.name, type: data.type, size: data.size, url: data.url, source: "upload" });
      const idea = selectedIdea();
      if (idea) {
        idea.mediaId = data.id;
        state.selectedMediaId = data.id;
      }
      saveState();
      pushWorkspace();
      showToast("Загружено");
    } catch (e) { showToast("Ошибка загрузки"); } finally { setBusy(false); render(); }
  }
  async function deleteMedia(id) {
    if (!id || !confirm("Удалить медиафайл из проекта и с сервера?")) return;
    setBusy(true);
    try {
      await request(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.media = state.media.filter(m => m.id !== id);
      state.queue = state.queue.map(item => item.mediaId === id
        ? { ...item, mediaId: "", mediaUrl: "", mediaType: "" }
        : item);
      state.ideas = state.ideas.map((idea) => idea.mediaId === id ? { ...idea, mediaId: "" } : idea);
      if (state.selectedMediaId === id) state.selectedMediaId = "";
      saveState();
      showToast("Медиафайл удалён");
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false);
      render();
    }
  }

  function confirmDzenReadiness(platform = state.activePlatform) {
    if (platform !== "dzen") return true;
    const completion = getProjectCompletionPercentage(activeProject());
    if (completion >= 30) return true;

    const proceed = confirm(
      `База проекта заполнена только на ${completion}%. В статье могут остаться неподтверждённые формулировки. Всё равно подготовить её к публикации?`
    );
    if (proceed) return true;

    state.activeTab = "project";
    render();
    scrollToTop();
    showToast("Сначала добавь факты, условия и доказательства");
    return false;
  }

  function makeTelegramQueuePost(status = "scheduled") {
    const idea = selectedIdea();
    const content = selectedContent();
    const planner = ensurePlanner();
    const mediaId = idea?.mediaId || state.selectedMediaId || "";
    const media = state.media.find((item) => item.id === mediaId);
    return {
      id: uid("q"),
      projectId: state.activeProjectId,
      sourceIdeaId: idea?.id || "",
      platform: "telegram",
      contentFormat: state.activePlatform,
      title: plainPublicationHeadline(content.headline),
      body: plainPublicationText(content.body),
      tags: plainPublicationText(content.tags),
      mediaId,
      mediaUrl: media?.url || "",
      mediaType: media?.type || "",
      status,
      state: status === "published" ? "Опубликовано" : status === "publishing" ? "Публикуется" : "Запланировано",
      publishDate: planner.publishDate,
      publishTime: planner.publishTime,
      scheduledAt: scheduledAtIso(planner.publishDate, planner.publishTime)
    };
  }

  function dateTimeParts(date) {
    return {
      publishDate: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      publishTime: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    };
  }

  function publicationWord(count) {
    const value = Math.abs(Number(count || 0));
    const lastTwo = value % 100;
    const last = value % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "публикаций";
    if (last === 1) return "публикация";
    if (last >= 2 && last <= 4) return "публикации";
    return "публикаций";
  }

  function roundedFutureDate(hours = 1) {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    date.setSeconds(0, 0);
    const minutes = date.getMinutes();
    date.setMinutes(minutes <= 30 ? 30 : 60);
    return date;
  }

  function makeQueuePostFromIdea(idea, when, contentFormat = state.activePlatform) {
    const content = idea?.formats?.[contentFormat] || idea?.formats?.telegram || idea?.formats?.dzen || {};
    const mediaId = idea?.mediaId || "";
    const media = state.media.find((item) => item.id === mediaId);
    const parts = dateTimeParts(when);
    return {
      id: uid("q"),
      projectId: state.activeProjectId,
      sourceIdeaId: idea?.id || "",
      platform: "telegram",
      contentFormat,
      title: plainPublicationHeadline(content.headline || idea?.title || ""),
      body: plainPublicationText(content.body || ""),
      tags: plainPublicationText(content.tags || ""),
      mediaId,
      mediaUrl: media?.url || "",
      mediaType: media?.type || "",
      status: "scheduled",
      state: "Запланировано",
      ...parts,
      scheduledAt: when.toISOString()
    };
  }

  function createMaterial() {
    const id = uid("i");
    const blank = {
      id,
      source: "manual",
      title: "Новый материал",
      angle: "Черновик",
      pillar: "Ручной материал",
      status: "Черновик",
      mediaId: "",
      formats: {
        telegram: { format: "Пост Telegram", headline: "", body: "", tags: "" },
        dzen: { format: "Статья Дзен", headline: "", body: "", tags: "" }
      }
    };
    state.ideas.unshift(blank);
    state.selectedIdeaId = id;
    state.activePlatform = "telegram";
    state.selectedMediaId = "";
    saveState();
    render();
    showToast("Новый черновик создан");
  }

  function deleteMaterial(id) {
    const idea = state.ideas.find((item) => item.id === id);
    if (!idea || !confirm(`Удалить материал «${idea.title || "Без заголовка"}»? Публикации в очереди останутся.`)) return;
    state.ideas = state.ideas.filter((item) => item.id !== id);
    selectedMaterialIds.delete(id);
    if (state.selectedIdeaId === id) {
      state.selectedIdeaId = state.ideas[0]?.id || "";
      state.selectedMediaId = state.ideas[0]?.mediaId || "";
    }
    saveState();
    render();
    showToast("Материал удалён");
  }

  async function scheduleMaterialAfter(hours) {
    const idea = selectedIdea();
    if (!idea) return showToast("Сначала выбери материал");
    const when = roundedFutureDate(Number(hours || 1));
    const post = makeQueuePostFromIdea(idea, when);
    try {
      validateTelegramPost(post, state.media.find((item) => item.id === post.mediaId));
    } catch (error) {
      return showToast(error.message);
    }
    state.queue.unshift(post);
    saveState();
    await pushWorkspace();
    showToast(`Запланировано на ${post.publishDate} в ${post.publishTime}`);
    render();
  }

  function openBatchScheduleModal(kind = "materials") {
    const start = roundedFutureDate(1);
    const parts = dateTimeParts(start);
    const count = kind === "queue"
      ? selectedQueueIds.size
      : kind === "current"
        ? (selectedIdea() ? 1 : 0)
        : selectedMaterialIds.size;
    if (!count) {
      showToast(kind === "queue" ? "Выбери публикации" : "Выбери материалы");
      return;
    }
    const title = kind === "queue" ? "Перестроить расписание" : count > 1 ? "Поставить материалы пачкой" : "Выбрать время публикации";
    mountModal(`
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-head">
            <h2 class="modal-title">${escapeHtml(title)}</h2>
            <button class="btn" type="button" data-action="close-modal" aria-label="Закрыть">Закрыть</button>
          </div>
          <div class="modal-body" data-stop-propagation>
            <p class="text">Выбрано: ${count}. Первая публикация выйдет в указанное время, остальные — с выбранным интервалом.</p>
            <div class="form">
              <div class="auto-tight">
                <label class="field"><span class="label">Дата старта</span><input class="input" type="date" id="batchDate" value="${parts.publishDate}"></label>
                <label class="field"><span class="label">Время старта</span><input class="input" type="time" id="batchTime" value="${parts.publishTime}"></label>
              </div>
              <label class="field">
                <span class="label">Интервал</span>
                <select class="select" id="batchInterval">
                  <option value="1">Каждый час</option>
                  <option value="2">Каждые 2 часа</option>
                  <option value="3">Каждые 3 часа</option>
                  <option value="6">Каждые 6 часов</option>
                  <option value="24">Раз в день</option>
                </select>
              </label>
              <button class="btn primary" type="button" data-action="apply-batch-schedule" data-kind="${escapeHtml(kind)}">
                ${kind === "queue" ? "Сохранить новое расписание" : "Поставить в очередь"}
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  async function applyBatchSchedule(kind) {
    const dateValue = document.getElementById("batchDate")?.value || "";
    const timeValue = document.getElementById("batchTime")?.value || "";
    const intervalHours = Number(document.getElementById("batchInterval")?.value || 1);
    const start = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() - 60000) {
      showToast("Выбери время не раньше текущего");
      return;
    }

    if (kind === "queue") {
      const posts = state.queue
        .filter((post) => selectedQueueIds.has(post.id) && post.status !== "published")
        .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
      posts.forEach((post, index) => {
        const when = new Date(start.getTime() + index * intervalHours * 60 * 60 * 1000);
        const parts = dateTimeParts(when);
        Object.assign(post, parts, {
          scheduledAt: when.toISOString(),
          status: "scheduled",
          state: "Запланировано",
          lastError: ""
        });
      });
      selectedQueueIds.clear();
      showToast(`Расписание обновлено: ${posts.length} ${publicationWord(posts.length)}`);
    } else {
      const ids = kind === "current"
        ? [selectedIdea()?.id].filter(Boolean)
        : state.ideas.map((idea) => idea.id).filter((id) => selectedMaterialIds.has(id));
      const posts = [];
      for (let index = 0; index < ids.length; index += 1) {
        const idea = state.ideas.find((item) => item.id === ids[index]);
        if (!idea) continue;
        const when = new Date(start.getTime() + index * intervalHours * 60 * 60 * 1000);
        const post = makeQueuePostFromIdea(idea, when);
        try {
          validateTelegramPost(post, state.media.find((item) => item.id === post.mediaId));
          posts.push(post);
        } catch (error) {
          showToast(`«${idea.title || "Материал"}»: ${error.message}`);
          return;
        }
      }
      state.queue = [...posts, ...state.queue];
      selectedMaterialIds.clear();
      state.activeTab = "queue";
      showToast(`В очередь добавлено: ${posts.length} ${publicationWord(posts.length)}`);
    }

    el.modalRoot.innerHTML = "";
    saveState();
    await pushWorkspace();
    render();
    scrollToTop();
  }

  function returnToMaterials(id) {
    const post = state.queue.find((item) => item.id === id);
    if (!post) return;
    let idea = state.ideas.find((item) => item.id === post.sourceIdeaId);
    if (!idea) {
      const newId = uid("i");
      idea = {
        id: newId,
        source: "queue-return",
        title: post.title || "Возвращённый материал",
        angle: "Возвращено из очереди",
        pillar: "Черновик",
        status: "Черновик",
        mediaId: post.mediaId || "",
        formats: {
          telegram: { format: "Пост Telegram", headline: post.title || "", body: post.body || "", tags: post.tags || "" },
          dzen: { format: "Статья Дзен", headline: post.title || "", body: post.body || "", tags: post.tags || "" }
        }
      };
      state.ideas.unshift(idea);
    } else {
      const format = post.contentFormat || "telegram";
      idea.formats = idea.formats || {};
      idea.formats[format] = {
        ...(idea.formats[format] || {}),
        format: platforms[format]?.name || "Материал",
        headline: post.title || "",
        body: post.body || "",
        tags: post.tags || ""
      };
      idea.title = post.title || idea.title;
      idea.mediaId = post.mediaId || "";
      idea.status = "Черновик";
    }
    state.queue = state.queue.filter((item) => item.id !== id);
    selectedQueueIds.delete(id);
    state.selectedIdeaId = idea.id;
    state.selectedMediaId = idea.mediaId || "";
    state.activePlatform = post.contentFormat || "telegram";
    state.activeTab = "materials";
    saveState();
    pushWorkspace();
    render();
    scrollToTop();
    showToast("Материал возвращён в черновики");
  }

  function validateTelegramPost(post, media) {
    const text = formatPublicationText(post);
    if (!text) throw new Error("Сначала подготовь текст публикации.");
    const limit = 4096;
    if (text.length > limit) {
      throw new Error(`В одном сообщении Telegram помещается до 4096 знаков. Сейчас ${text.length}. Сократи текст.`);
    }
    return text;
  }

  function updatePublicationLimit() {
    const element = document.querySelector("[data-publication-limit]");
    if (!element) return;
    const content = selectedContent();
    const media = state.media.find((item) => item.id === state.selectedMediaId);
    const limit = 4096;
    const length = formatPublicationText({
      title: content.headline,
      body: content.body,
      tags: content.tags
    }).length;
    element.classList.toggle("is-over", length > limit);
    element.innerHTML = `
      <span>Объём публикации: ${length} / ${limit} знаков</span>
      ${length > limit
        ? `<strong>Сократи текст перед публикацией.</strong>`
        : `<span>${media ? "Готово: изображение появится над текстом." : "Готово для одного сообщения в Telegram"}</span>`}
    `;
  }

  function updateScheduleButton() {
    const button = document.querySelector("[data-schedule-button]");
    if (!button) return;
    const planner = ensurePlanner();
    button.textContent = `Запланировать на ${planner.publishDate} в ${planner.publishTime}`;
  }

  async function addToQueue() {
    if (!selectedIdea()) {
      showToast("Сначала сгенерируй или выбери материал.");
      return;
    }
    if (!confirmDzenReadiness(state.activePlatform)) return;
    const post = makeTelegramQueuePost("scheduled");
    const media = state.media.find((item) => item.id === post.mediaId);
    try {
      validateTelegramPost(post, media);
      if (!post.scheduledAt || new Date(post.scheduledAt).getTime() < Date.now() - 60000) {
        throw new Error("Выбери дату и время публикации не раньше текущего времени.");
      }
    } catch (error) {
      showToast(error.message);
      return;
    }

    state.queue.unshift(post);
    state.activeTab = "queue";
    render();
    scrollToTop();
    showToast(`Запланировано на ${post.publishDate} в ${post.publishTime}`);
    await pushWorkspace();
  }

  async function publishCurrentTelegram() {
    if (!selectedIdea()) {
      showToast("Сначала сгенерируй или выбери материал.");
      return;
    }
    if (!confirmDzenReadiness(state.activePlatform)) return;
    const post = makeTelegramQueuePost("publishing");
    state.queue.unshift(post);
    state.activeTab = "queue";
    render();
    scrollToTop();
    await publishOne(post.id);
  }

  async function publishTelegramFromApp(post, media) {
    validateTelegramPost(post, media);
    const result = await request("/api/publish/telegram", {
      method: "POST",
      body: { post, media }
    });
    return result.telegram;
  }

  async function publishOne(id) {
    const post = state.queue.find(q => q.id === id); if (!post) return;
    post.platform = "telegram";
    post.contentFormat = post.contentFormat || "telegram";
    post.status = "publishing";
    post.state = "Публикуется";
    post.claimId = "browser";
    post.claimExpiresAt = Date.now() + 2 * 60 * 1000;
    render();
    await pushWorkspace();
    try {
      const media = state.media.find((m) => m.id === post.mediaId);
      const mediaPayload = media ? { url: media.url, type: media.type } : null;
      const result = await publishTelegramFromApp(post, mediaPayload);
      if (result?.queued) {
        post.status = "scheduled";
        post.state = "Запланировано";
        post.scheduledAt = result.scheduledAt || new Date().toISOString();
        post.lastError = "";
        showToast("Передано в Telegram · публикация в течение минуты");
      } else {
        post.status = "published";
        post.state = "Опубликовано";
        post.publishedAt = new Date().toISOString();
        post.telegramMessageId = result?.result?.message_id || "";
        post.lastError = "";
        showToast("Опубликовано в Telegram");
      }
    } catch (e) {
      post.status = "error";
      post.state = "Ошибка";
      post.lastError = cleanError(e.message);
      showToast(cleanError(e.message));
    } finally {
      post.claimId = "";
      post.claimExpiresAt = 0;
      await pushWorkspace();
      render();
    }
  }

  function formatPublicationText(post) {
    return [
      plainPublicationHeadline(post.title),
      "",
      plainPublicationText(post.body),
      "",
      plainPublicationText(post.tags)
    ].filter(Boolean).join("\n").trim();
  }

  async function generateImage() {
    const content = selectedContent();
    const promptText = String(content.body || content.headline || "").trim();
    if (!promptText) { showToast("Нет текста для генерации картинки"); return; }
    setBusy(true); showToast("Генерируем изображение...");
    try {
      const data = await request("/api/generate-image", { method: "POST", body: { prompt: promptText } });
      state.media.unshift({ id: data.id, name: data.name, type: data.type, size: data.size, url: data.url, source: "timeweb" });
      state.selectedMediaId = data.id;
      const idea = selectedIdea();
      if (idea) idea.mediaId = data.id;
      if (data.limitInfo) state.limitInfo = data.limitInfo;
      showToast("Изображение готово");
    } catch (e) {
      showToast(cleanError(e.message));
    } finally {
      setBusy(false); render();
    }
  }

  /* Modals */
  function openQueueModal(id) {
    const p = state.queue.find(q => q.id === id); if (!p) return;
    const mediaOptions = [
      `<option value="">Без файла</option>`,
      ...state.media.map(m => `<option value="${m.id}" ${p.mediaId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`)
    ].join("");

    mountModal(`
      <div class="modal-backdrop"><div class="modal-card"><div class="modal-head"><h2 class="modal-title">Изменить публикацию</h2><button class="btn" type="button" data-action="close-modal" aria-label="Закрыть">Закрыть</button></div><div class="modal-body" data-stop-propagation><div class="form">
        <label class="field"><span class="label">Заголовок</span><input class="input" id="editQTitle" value="${escapeHtml(p.title)}"></label>
        <label class="field"><span class="label">Текст</span><textarea class="textarea minh-120" id="editQBody">${escapeHtml(p.body)}</textarea></label>
        
        <label class="field">
          <span class="label">Формат материала</span>
          <select class="select" id="editQContentFormat">
            <option value="dzen" ${(p.contentFormat || (p.platform === "dzen" ? "dzen" : "")) === "dzen" ? "selected" : ""}>Статья для Дзена</option>
            <option value="telegram" ${(p.contentFormat || p.platform) === "telegram" ? "selected" : ""}>Пост для Telegram</option>
          </select>
        </label>

        <div class="metric p-12">
          <div class="metric-label">Канал публикации</div>
          <div class="metric-value fs-16">Telegram · @motorports</div>
        </div>

        <div class="auto-tight">
          <label class="field"><span class="label">Дата</span><input class="input" type="date" id="editQDate" value="${escapeHtml(p.publishDate || "")}"></label>
          <label class="field"><span class="label">Время</span><input class="input" type="time" id="editQTime" value="${escapeHtml(p.publishTime || "")}"></label>
        </div>

        <label class="field">
          <span class="label">Картинка</span>
          <select class="select" id="editQMediaId">
            ${mediaOptions}
          </select>
        </label>

        ${p.lastError ? `<div class="log bad"><div class="log-text">${escapeHtml(p.lastError)}</div></div>` : ""}
        <div class="actions mt-16">
          <button class="btn primary" type="button" data-action="save-queue" data-id="${p.id}">Сохранить изменения</button>
          <button class="btn" type="button" data-action="return-to-materials" data-id="${p.id}">Передумал — вернуть в материалы</button>
        </div>
      </div></div></div></div>
    `);
  }
  async function copyText(text, withToast = true) {
    try {
      await navigator.clipboard.writeText(text);
      if (withToast) showToast("Скопировано");
      return true;
    } catch (e) {
      if (withToast) showToast("Не удалось скопировать");
      return false;
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    const stopZone = e.target.closest("[data-stop-propagation]");
    if (stopZone && (!t || !stopZone.contains(t))) return;
    if (!t) return;
    const a = t.dataset.action;

    if (a === "close-modal") {
      const isBackdrop = e.target.classList.contains("modal-backdrop");
      const isCloseBtn = e.target.closest('button[data-action="close-modal"]');
      if (isBackdrop || isCloseBtn) {
        el.modalRoot.innerHTML = "";
        if (lastFocusedBeforeModal) lastFocusedBeforeModal.focus();
      }
      return;
    }
    if (a === "toggle-burger") { toggleNavMenu(); return; }
    if (a === "tab") { state.activeTab = t.dataset.tab; closeNavMenu(); render(); scrollToTop(); return; }
    if (a === "logout") { logout(); return; }
    if (a === "new-material") { createMaterial(); return; }
    if (a === "apply-template") { applyTemplateById(t.dataset.template); render(); return; }
    if (a === "generate") { generate(); return; }
    if (a === "fill-brief-template") { makeBriefTemplate(); return; }
    if (a === "copy-generated-brief") { makeBriefTemplate({ copyOnly: true }); return; }
    if (a === "import-project-brief") { importProjectBrief(); return; }
    if (a === "import-project-url") { importProjectUrl(); return; }
    if (a === "select-idea") {
      const idea = state.ideas.find((item) => item.id === t.dataset.id);
      if (!idea) return;
      state.selectedIdeaId = idea.id;
      state.selectedMediaId = idea.mediaId || "";
      saveState();
      render();
      return;
    }
    if (a === "delete-material") { deleteMaterial(t.dataset.id); return; }
    if (a === "swap-hook") { swapFirstParagraph(t.dataset.hook || ""); return; }
    if (a === "select-platform") {
      state.activePlatform = t.dataset.platform === "dzen" ? "dzen" : "telegram";
      const idea = selectedIdea();
      if (idea) {
        idea.formats = idea.formats || {};
        if (!idea.formats[state.activePlatform]) {
          const fallback = idea.formats.telegram || idea.formats.dzen || {};
          idea.formats[state.activePlatform] = {
            format: platforms[state.activePlatform].name,
            headline: fallback.headline || idea.title || "",
            body: fallback.body || "",
            tags: fallback.tags || ""
          };
        }
      }
      saveState();
      render();
      return;
    }
    if (a === "add-to-queue") { addToQueue(); return; }
    if (a === "publish-current-telegram") { publishCurrentTelegram(); return; }
    if (a === "remove-queue") {
      if (confirm("Вы действительно хотите удалить эту публикацию из очереди?")) {
        state.queue = state.queue.filter(q => q.id !== t.dataset.id);
        selectedQueueIds.delete(t.dataset.id);
        saveState();
        pushWorkspace();
        render();
      }
      return;
    }
    if (a === "clear-queue") {
      if (confirm("Вы действительно хотите очистить всю очередь запланированных публикаций?")) {
        state.queue = [];
        render();
      }
      return;
    }
    if (a === "publish-one") { publishOne(t.dataset.id); return; }
    if (a === "open-queue") { openQueueModal(t.dataset.id); return; }
    if (a === "return-to-materials") { returnToMaterials(t.dataset.id); el.modalRoot.innerHTML = ""; return; }
    if (a === "quick-schedule-material") { scheduleMaterialAfter(Number(t.dataset.hours || 1)); return; }
    if (a === "open-batch-schedule") { openBatchScheduleModal(t.dataset.kind || "materials"); return; }
    if (a === "apply-batch-schedule") { applyBatchSchedule(t.dataset.kind || "materials"); return; }
    if (a === "clear-material-selection") { selectedMaterialIds.clear(); render(); return; }
    if (a === "clear-queue-selection") { selectedQueueIds.clear(); render(); return; }
    if (a === "save-queue") {
      const p = state.queue.find(q => q.id === t.dataset.id);
      if (p) {
        const publishDate = document.getElementById("editQDate").value;
        const publishTime = document.getElementById("editQTime").value;
        const scheduledAt = scheduledAtIso(publishDate, publishTime);
        const mediaId = document.getElementById("editQMediaId").value || "";
        const media = state.media.find((item) => item.id === mediaId);
        const nextPost = {
          ...p,
          title: plainPublicationHeadline(document.getElementById("editQTitle").value),
          body: plainPublicationText(document.getElementById("editQBody").value),
          platform: "telegram",
          contentFormat: document.getElementById("editQContentFormat").value,
          status: "scheduled",
          state: "Запланировано",
          publishDate,
          publishTime,
          scheduledAt,
          mediaId,
          mediaUrl: media?.url || "",
          mediaType: media?.type || ""
        };
        try {
          validateTelegramPost(nextPost, media);
          if (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() - 60000) {
            throw new Error("Выбери время не раньше текущего.");
          }
        } catch (error) {
          showToast(error.message);
          return;
        }
        Object.assign(p, nextPost);
        p.lastError = "";
        saveState();
        pushWorkspace();
      }
      el.modalRoot.innerHTML = ""; render(); return;
    }
    if (a === "upload-media") { uploadMedia(); return; }
    if (a === "select-media-card") {
      state.selectedMediaId = t.dataset.id;
      const idea = selectedIdea();
      if (idea) idea.mediaId = t.dataset.id;
      saveState();
      pushWorkspace();
      showToast(idea ? "Картинка прикреплена к материалу" : "Картинка выбрана");
      render();
      return;
    }
    if (a === "delete-media") {
      deleteMedia(t.dataset.id);
      return;
    }
    if (a === "toggle-brief-mode") {
      state.briefMode = t.dataset.mode;
      saveState();
      render();
      return;
    }
    if (a === "new-project") { const id = uid("p"); state.projects.unshift({ id, name: "Новый проект", briefText: "", niche: "", offer: "", audience: "", pain: "", proof: "", common: "", tone: "", details: "", price: "", timelines: "", warranty: "", geo: "", landingPage: "", awareness: "Теплый", fear: "", reason: "", facts: "", goal: "", nextStep: "", leadMagnet: "", stopWords: "", competitors: "", advantages: "" }); state.activeProjectId = id; render(); return; }
    if (a === "delete-project") {
      if (state.projects.length > 1) {
        if (confirm("Вы действительно хотите полностью удалить этот проект и все его настройки?")) {
          state.projects = state.projects.filter(p => p.id !== state.activeProjectId);
          state.activeProjectId = state.projects[0].id;
          render();
        }
      } else {
        showToast("Нельзя удалить единственный проект");
      }
      return;
    }
    if (a === "select-project") { state.activeProjectId = t.dataset.id; render(); return; }
    if (a === "check-backend") { checkBackend(); return; }
    if (a === "check-ai-key") { checkAiKey(); return; }
    if (a === "save-server-config") { saveServerConfig(); return; }
    if (a === "clear-logs") { state.logs = []; render(); return; }
    if (a === "copy-current") {
      const content = selectedContent();
      copyText(formatPublicationText({ title: content.headline, body: content.body, tags: content.tags }));
      return;
    }
    if (a === "copy-text-custom") { copyText(t.dataset.text); return; }
    if (a === "copy-brief-template") { copyText("Ниша:\nОффер:\nАудитория:\nБоль:\nФакт/Доказательство:"); return; }
    if (a === "refine-pain") { refineText("amplify-pain"); return; }
    if (a === "refine-proof") { refineText("add-proof"); return; }
    if (a === "refine-shorten") { refineText("shorten"); return; }
    if (a === "refine-dzen") { refineText("adapt-dzen"); return; }
    if (a === "refine-telegram") { refineText("adapt-telegram"); return; }
    if (a === "clear-workspace-all") {
      if (confirm("Вы действительно хотите полностью очистить рабочую область? Это удалит все проекты, идеи, медиафайлы и очередь публикаций!")) {
        state.ideas = []; state.queue = []; state.media = []; state.logs = []; state.critic = null;
        state.projects = [{ id: "p_1", name: "Новый", briefText: "", niche: "", offer: "", audience: "", pain: "", proof: "", common: "", tone: "", details: "", price: "", timelines: "", warranty: "", geo: "", landingPage: "", awareness: "Теплый", fear: "", reason: "", facts: "", goal: "", nextStep: "", leadMagnet: "", stopWords: "", competitors: "", advantages: "" }]; state.activeProjectId = "p_1";
        saveState();
        render();
        pushWorkspace();
        showToast("Рабочая область полностью очищена");
      }
      return;
    }
    if (a === "kanban-to-editor") {
      state.selectedIdeaId = t.dataset.id;
      state.activeTab = "factory";
      saveState();
      render();
      showToast("Открыто в редакторе");
      return;
    }
    if (a === "kanban-to-queue") {
      const idea = state.ideas.find(i => i.id === t.dataset.id);
      if (idea) {
        const p = ensurePlanner();
        const contentFormat = state.activePlatform || "dzen";
        if (!confirmDzenReadiness(contentFormat)) return;
        state.queue.unshift({
          id: uid("q"),
          projectId: state.activeProjectId,
          platform: "telegram",
          contentFormat,
          title: idea.title,
          body: idea.formats?.[contentFormat]?.body || idea.title,
          tags: idea.formats?.[contentFormat]?.tags || "",
          mediaId: state.selectedMediaId || "",
          status: "scheduled",
          state: "Запланировано",
          publishDate: p.publishDate,
          publishTime: p.publishTime,
          scheduledAt: scheduledAtIso(p.publishDate, p.publishTime)
        });
        saveState();
        render();
        showToast("Добавлено в очередь");
      }
      return;
    }
    if (a === "kanban-editor-to-queue") {
      addToQueue();
      return;
    }
    if (a === "generate-image") { generateImage(); return; }
  });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-drag-type][data-drag-id]");
    if (!card || !event.dataTransfer) return;
    kanbanDragCard = card;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: card.dataset.dragType,
      id: card.dataset.dragId
    }));
  });

  document.addEventListener("dragend", () => {
    if (kanbanDragCard) kanbanDragCard.classList.remove("is-dragging");
    kanbanDragCard = null;
    document.querySelectorAll(".kanban-column.drag-over")
      .forEach((column) => column.classList.remove("drag-over"));
  });

  document.addEventListener("dragover", (event) => {
    const column = event.target.closest("[data-kanban-target]");
    if (!column) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  document.addEventListener("dragenter", (event) => {
    const column = event.target.closest("[data-kanban-target]");
    if (!column) return;
    column.classList.add("drag-over");
  });

  document.addEventListener("dragleave", (event) => {
    const column = event.target.closest("[data-kanban-target]");
    if (!column || column.contains(event.relatedTarget)) return;
    column.classList.remove("drag-over");
  });

  document.addEventListener("drop", (event) => {
    const column = event.target.closest("[data-kanban-target]");
    if (!column) return;
    handleKanbanDrop(event, column, column.dataset.kanbanTarget);
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches('[data-action="project-input"]')) { activeProject()[t.name] = t.value; saveState(); }
    if (t.matches('[data-action="setting-input"]')) { state.settings[t.name] = t.value; saveState(); }
    if (t.matches('[data-action="planner-input"]')) { ensurePlanner()[t.name] = t.value; saveState(); updateScheduleButton(); }
    if (t.matches('[data-action="edit-content"]')) {
      const idea = selectedIdea(); if (!idea) return;
      if (!idea.formats) idea.formats = {};
      if (!idea.formats[state.activePlatform]) idea.formats[state.activePlatform] = { headline: "", body: "", tags: "" };
      idea.formats[state.activePlatform][t.dataset.field] = t.value;
      if (t.dataset.field === "headline") idea.title = t.value;
      saveState();
      updatePublicationLimit();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('[data-action="material-check"]')) {
      if (t.checked) selectedMaterialIds.add(t.dataset.id);
      else selectedMaterialIds.delete(t.dataset.id);
      render();
      return;
    }
    if (t.matches('[data-action="queue-check"]')) {
      if (t.checked) selectedQueueIds.add(t.dataset.id);
      else selectedQueueIds.delete(t.dataset.id);
      render();
      return;
    }
    if (t.matches('[data-action="queue-filter"]')) {
      state.queueFilter = t.value;
      render();
      return;
    }
    if (t.matches('[data-action="apply-template-select"]')) { applyTemplateById(t.value); render(); }
    if (t.matches('[data-action="setting-input"]')) { state.settings[t.name] = t.value; saveState(); scheduleWorkspaceSave(); }
    if (t.matches('[data-action="select-media"]')) {
      state.selectedMediaId = t.value;
      const idea = selectedIdea();
      if (idea) idea.mediaId = t.value;
      saveState();
      render();
    }
    if (t.matches('[data-action="sidebar-select-project"]')) { state.activeProjectId = t.value; render(); }
    if (t.matches('[data-action="edit-content"]')) {
      const idea = selectedIdea();
      const content = idea?.formats?.[state.activePlatform];
      if (!idea || !content) return;
      const field = t.dataset.field;
      const cleaned = field === "headline"
        ? plainPublicationHeadline(t.value)
        : plainPublicationText(t.value);
      content[field] = cleaned;
      if (field === "headline") idea.title = cleaned;
      t.value = cleaned;
      saveState();
      scheduleWorkspaceSave();
      updatePublicationLimit();
    }
  });
});
