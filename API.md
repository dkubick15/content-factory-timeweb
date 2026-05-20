# API

## GET /api/health

Проверка backend. Возвращает статус сервиса, режим работы и активность OpenRouter.

## POST /api/auth/register

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

## POST /api/auth/login

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

## GET /api/config

Требует Bearer token. Возвращает настройки аккаунта.

## POST /api/config

Требует Bearer token. Сохраняет настройки OpenRouter API, выбранную модель и Telegram-настройки.

```json
{
  "openaiApiKey": "sk-or-v1-...",
  "openaiBaseUrl": "https://openrouter.ai/api/v1",
  "model": "deepseek/deepseek-v4-flash:free",
  "telegramBotToken": "...",
  "telegramChatId": "@channel"
}
```

Внутреннее поле для ключа называется `openaiApiKey`, но поддерживается автоматическая обратная совместимость - если в базе сохранены старые ключи `groqApiKeyEnc` или `geminiApiKeyEnc`, они будут корректно расшифрованы и использованы как `openaiApiKey`.

## POST /api/ai/test

Требует Bearer token. Проверяет работоспособность OpenRouter API Key. В случае успешного теста ключ автоматически сохраняется в профиле пользователя.

```json
{
  "openaiApiKey": "sk-or-v1-..."
}
```

## POST /api/generate

Требует Bearer token. Генерация контента идёт через OpenRouter API с динамически выбранной моделью (или моделью по умолчанию `deepseek/deepseek-v4-flash:free`).

```json
{
  "project": {
    "name": "KUBIK.DM",
    "niche": "перформанс-маркетинг",
    "offer": "лендинг + Яндекс.Директ + аналитика",
    "audience": "владельцы бизнеса",
    "pain": "реклама тратит бюджет, но заявки не окупаются",
    "common": "лендинг",
    "proof": "первый экран, квиз, аналитика",
    "tone": "прямой, экспертный, без воды"
  },
  "settings": {
    "ideaCount": 10,
    "style": "острый, экспертный, без воды",
    "objective": "заявки"
  },
  "platform": "telegram"
}
```

## POST /api/upload

Требует Bearer token. FormData: `file`, `projectId`.

## POST /api/publish/telegram

Требует Bearer token. Публикация сгенерированного и отредактированного контента в привязанный Telegram-канал или чат.
