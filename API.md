# API

## GET /api/health

Проверка backend. Возвращает статус сервиса и подключение Timeweb-агента.

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

Требует Bearer token. Возвращает настройки аккаунта, статус Timeweb-агента и настройки Telegram.

## POST /api/config

Требует Bearer token. Сохраняет только настройки Telegram-публикации.

```json
{
  "telegramBotToken": "...",
  "telegramChatId": "@channel"
}
```

## POST /api/ai/test

Требует Bearer token. Проверяет, отвечает ли Timeweb-агент, настроенный через `TIMEWEB_API_KEY` и `TIMEWEB_AGENT_ID` на сервере.

## POST /api/generate

Требует Bearer token. Генерация контента идёт только через Timeweb-агента.

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
