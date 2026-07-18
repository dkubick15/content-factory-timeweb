# API «Контент-завод»

Все защищённые эндпоинты требуют заголовок `Authorization: Bearer <token>`.
Авторизация — rate-limited. Запросы к ИИ и публикациям — отдельные лимиты.

## GET /api/health
Проверка backend. Возвращает `ok`. Расширенная диагностика (пользователи, порт, ID агента, источники env) включается через `DEBUG_HEALTH=true`.

## POST /api/auth/register
Ограничен rate limit. Регистрация нового аккаунта.

```json
{ "email": "user@example.com", "password": "123456" }
```

## POST /api/auth/login
Ограничен rate limit. При `ENABLE_DEMO_LOGIN=true` поддерживает демо-аккаунты (`DEMO_EMAIL`, `CLIENT_DEMO_EMAIL`, `TEST_DEMO_EMAIL`).

```json
{ "email": "user@example.com", "password": "123456" }
```

## GET /api/auth/me
Текущий профиль пользователя.

## GET /api/config
Настройки аккаунта: маскированный Timeweb-ключ, токены Telegram/Instagram, статус YouTube и OAuth, лимиты генераций.

## POST /api/config
Сохранение Telegram- и Instagram-интеграций (токены шифруются). Замаскированные значения (содержат `...`/`***`) игнорируются.

```json
{
  "telegramBotToken": "...",
  "telegramChatId": "@channel",
  "instagramAccessToken": "...",
  "instagramUserId": "123456789"
}
```

## GET /api/auth/youtube
Запускает OAuth-подключение YouTube (редирект в Google). Требует `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`.

## GET /api/auth/youtube/callback
Callback OAuth: сохраняет `refresh_token` и `channelId` в профиле пользователя.

## POST /api/auth/youtube/disconnect
Отвязывает YouTube-аккаунт (очищает токен и ID канала).

## POST /api/ai/test
Проверяет подключение Timeweb-агента. Ограничен AI rate limit.

## GET /api/workspace
Рабочее пространство: проекты, идеи, медиа, очередь, логи, planner. Сервер нормализует и санитизирует данные.

## PUT /api/workspace
Полное обновление рабочего пространства (заменяет целиком).

## POST /api/queue
Добавляет/обновляет публикацию в очереди по `id`.

## POST /api/generate
Генерация plain-text контента через Timeweb-агента + ИИ-критик. Критик
оценивает хук, попадание в ЦА, удержание, пересылаемость, доказательства, CTA,
формат площадки и потенциал охвата. Ограничен AI rate limit и дневным лимитом
демо-аккаунтов.

```json
{
  "project": { "name": "...", "niche": "...", "offer": "..." },
  "settings": { "ideaCount": 3, "style": "...", "objective": "..." },
  "platform": "telegram",
  "planner": { "publishDate": "2026-01-01", "publishTime": "12:00" }
}
```

## POST /api/refine
Улучшение выделенного текста ИИ (`amplify-pain`, `add-proof`, `shorten`, `adapt-rsy`, `adapt-reels`). Ограничен AI rate limit.

## POST /api/project/brief-template
Генерация текстового шаблона брифа под выбранный формат.

## POST /api/project/import-brief
Разбор вставленного брифа по полям проекта (возвращает patch).

## POST /api/project/import-url
Загрузка и разбор сайта по URL, автозаполнение базы проекта.

## POST /api/upload
Загрузка медиафайла (FormData: `file`, `projectId`). Только изображения/видео, лимит `MAX_UPLOAD_MB`.

## DELETE /api/media/:id
Удаляет медиафайл из рабочего пространства и с диска, а также снимает его с публикаций в очереди.

## POST /api/generate-image
Генерация изображения по тексту поста (через ИИ-улучшение промпта + Pollinations). Сохраняет в `/uploads`.

## ChatGPT App · OAuth 2.1 + MCP

- `GET /.well-known/oauth-protected-resource` — metadata защищённого MCP-ресурса.
- `GET /.well-known/oauth-authorization-server` — metadata OAuth-сервера.
- `GET/POST /oauth/authorize` — привязка ChatGPT к аккаунту «Контент-завода» через Authorization Code + PKCE.
- `POST /oauth/token` — выдача и обновление ограниченных OAuth-токенов. Служебный
  обмен ChatGPT имеет отдельный лимит, а одноразовые коды переживают перезапуск
  контейнера в течение пятиминутного срока действия.
- `POST /mcp` — личный MCP endpoint для ChatGPT.

MCP предоставляет два действия:

- `get_motor_port_context` — читает актуальный бриф и правила публикации;
- `import_content_package` — идемпотентно сохраняет одобренный plain-text материал и опциональный ChatGPT-файл изображения как черновик. Самостоятельной публикации не выполняет.

## Логика публикации
`dzen` и `telegram` используются как форматы текста в редакторе. Все записи
очереди публикуются в Telegram. Дальнейшее дублирование из Telegram в Дзен
выполняет отдельный бот владельца.

## POST /api/publish/telegram
Передаёт публикацию в немедленную Telegram-очередь. Защищённый Worker забирает
её не позднее следующего минутного тика; Bot Token не передаётся в браузер.
Ограничен publish rate limit.

## Серверное расписание
Worker с внутренним alarm проверяет очередь каждую минуту. Наступившая
публикация блокируется от дубля, отправляется в Telegram и сохраняет
`message_id`; при временной ошибке выполняется до трёх попыток.

Материал с изображением может занимать до 4096 знаков. До 1024 знаков Worker
использует обычную подпись к медиа; для более длинного текста отправляет одно
текстовое сообщение с большим предпросмотром изображения.

## POST /api/publish/instagram
Публикация Reels через Instagram Graph API. Требует `instagramAccessToken`, `instagramUserId` и видео.

## POST /api/publish/youtube
Загрузка видео на YouTube через OAuth. Поддерживает отложенную публикацию через `scheduledAt`.
