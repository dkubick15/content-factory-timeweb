# Деплой в Timeweb Cloud Apps

Инструкция по запуску приложения Content Factory на облачном сервере Timeweb Cloud Apps с использованием интеграции ИИ-агентов.

## 1. Файлы в корне репозитория

Для работы приложения необходимы следующие файлы:
```text
index.html
style.css
script.js
server.js
package.json
.env.example
.gitignore
README.md
TIMEWEB_DEPLOY.md
API.md
```

## 2. Создание приложения в панели Timeweb

При создании нового Cloud App в личном кабинете выберите следующие параметры:
- **Тип приложения**: Node.js / Express
- **Команда сборки**: оставить пустой
- **Команда запуска**: `node server.js`
- **Путь директории проекта**: оставить пустым
- **Путь проверки состояния (Health Check)**: `/api/health`

## 3. Настройка переменных окружения

В разделе "Переменные окружения" (Environment Variables) вашего Cloud App добавьте следующие настройки:

```env
APP_SECRET=случайная-строка-для-сессий
PUBLIC_BASE_URL=https://ваш-домен-в-timeweb.ru
CORS_ORIGIN=https://ваш-домен-в-timeweb.ru
MAX_UPLOAD_MB=200
AI_TIMEOUT_MS=180000
AI_MAX_TOKENS=8000

# Личный вход владельца
ENABLE_DEMO_LOGIN=true
DEMO_EMAIL=kubik
DEMO_PASSWORD=kubik

# Настройки ИИ-агента Timeweb (meweb.cloud/my/cloud-ai/agents)
TIMEWEB_API_KEY=ваш-jwt-токен-авторизации
TIMEWEB_AGENT_ID=id-вашего-созданного-агента

# Telegram-first публикация
TELEGRAM_RELAY_URL=https://адрес-защищенного-ретранслятора
TELEGRAM_SCHEDULER_URL=https://telegram-relay.motorport-dvs.ru
TELEGRAM_SITES_ACCESS_TOKEN=служебный-токен-доступа-sites
TELEGRAM_PUBLISH_MODE=external
TELEGRAM_BOT_TOKEN=токен-бота
TELEGRAM_CHAT_ID=@имя_канала
```

> [!NOTE]
> Вы можете скопировать JWT-токен (`TIMEWEB_API_KEY`) из настроек личного кабинета Timeweb Cloud в разделе API-ключей. `TIMEWEB_AGENT_ID` - это уникальный идентификатор вашего ИИ-агента, который вы можете скопировать из URL страницы агента или его настроек в панели управления.

## 4. Проверка работоспособности

После развертывания откройте в браузере адрес:
```text
https://ваш-домен-в-timeweb.ru/api/health?json=true
```

При правильной настройке вы получите JSON-ответ вида:
```json
{
  "ok": true,
  "service": "content-factory-backend",
  "mode": "private-timeweb-agent",
  "provider": "Timeweb Cloud AI Agent",
  "timeweb": true,
  "agent": "ваш-agent-id"
}
```

Поле `"mode"` в значении `"private-timeweb-agent"` подтверждает, что сервер успешно обнаружил переменные Timeweb и перешел в закрытый приватный режим через вашего агента.

После этого перейдите на главную страницу вашего сайта, зарегистрируйте аккаунт или войдите под существующим. В разделе настроек вы увидите статус Timeweb-агента и сможете сразу приступить к работе. Настройка персональных ключей пользователям не потребуется.
