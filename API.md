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
Генерация контента через Timeweb-агента + ИИ-критик. Ограничен AI rate limit и дневным лимитом демо-аккаунтов.

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

## Публикация в Дзен
Публичного endpoint `/api/publish/dzen` нет. Для статьи используется безопасный ручной сценарий: интерфейс копирует заголовок, текст и теги, открывает `https://dzen.ru/editor`, после фактической публикации материал отмечается опубликованным вручную. Планировщик не выдаёт подготовленную статью за автоматически опубликованную.

## POST /api/publish/telegram
Публикация в Telegram (текст и/или медиа). Ограничен publish/upload rate limit.

## POST /api/telegram/browser-config
Резервный путь для личного приложения, если хостинг блокирует исходящее
соединение к Telegram. Только авторизованному браузеру возвращает Bot Token и
Chat ID без кеширования; интерфейс отправляет пост напрямую в официальный
Telegram Bot API.

## POST /api/publish/instagram
Публикация Reels через Instagram Graph API. Требует `instagramAccessToken`, `instagramUserId` и видео.

## POST /api/publish/youtube
Загрузка видео на YouTube через OAuth. Поддерживает отложенную публикацию через `scheduledAt`.
