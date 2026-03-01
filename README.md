# Deploy Panel

Панель управления деплоем сайтов на удалённые серверы. Полнофункциональное веб-приложение для автоматизации развёртывания, мониторинга и управления веб-проектами.

## Возможности

- **Управление серверами** — добавление серверов, SSH-подключение, мониторинг ресурсов (CPU/RAM/Disk)
- **Управление сайтами** — CRUD, автоопределение стека (Laravel, WordPress, Node.js, Django, FastAPI, Docker, Static)
- **Управление доменами** — привязка доменов, Cloudflare DNS, проверка SSL, статусы (Active/Free/Abused)
- **Деплой** — автоматический деплой через SSH, поддержка Git, real-time логи через WebSocket
- **Бэкапы** — автоматические и ручные бэкапы, включая БД (MySQL/PostgreSQL), восстановление
- **Мониторинг** — HTTP-проверки каждые 60 сек, автоматическая ротация доменов при падении
- **Паник-кнопка** — массовая смена доменов при абьюзе с обновлением DNS через Cloudflare
- **2FA** — двухфакторная аутентификация через Google Authenticator (TOTP + backup codes)
- **RBAC** — роли ADMIN и OPERATOR с разграничением прав

## Технологии

### Backend
- Express 5 + TypeScript
- Prisma 7 (PostgreSQL)
- BullMQ (Redis) — очередь деплоев и бэкапов
- Socket.IO — real-time логи
- JWT + httpOnly cookies — аутентификация
- AES-256-GCM — шифрование SSH-ключей и токенов

### Frontend
- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4
- Zustand — стейт авторизации
- TanStack Query — серверный стейт
- Lucide React — иконки

### Инфраструктура
- PostgreSQL 16
- Redis
- Nginx (reverse proxy)
- PM2 (process manager)
- Certbot (SSL)

## Установка

### Требования
- Node.js 22+
- PostgreSQL 16+
- Redis

### Локальная разработка

```bash
# Клонировать репозиторий
git clone https://github.com/redzov/panelsaytov.git
cd panelsaytov

# Создать .env из примера
cp .env.example .env
# Отредактировать .env — указать DATABASE_URL, сгенерировать секреты

# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run dev

# Frontend (в другом терминале)
cd frontend
npm install
npm run dev
```

Приложение будет доступно на `http://localhost:5173`

### Production

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start dist/index.js --name deploy-panel

# Frontend
cd ../frontend
npm install
npm run build
# Статика в frontend/dist/ — отдаётся через Nginx
```

## Структура проекта

```
deploy-panel/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Схема БД (9 моделей)
│   │   ├── migrations/        # Миграции
│   │   └── seed.ts            # Начальные данные
│   └── src/
│       ├── config/            # database.ts, env.ts
│       ├── middleware/        # auth.ts (JWT + RBAC)
│       ├── routes/            # auth, servers, sites, domains, deploys, backups, logs, panic, dashboard, settings
│       └── services/          # deploy, ssh, monitoring, backup, migration, telegram, cloudflare, crypto, totp
├── frontend/
│   └── src/
│       ├── api/               # client.ts (axios), socket.ts (Socket.IO)
│       ├── components/        # UI компоненты (Button, Modal, Badge, etc.)
│       ├── pages/             # Dashboard, Servers, Sites, Domains, Deploy, Backups, Monitoring, Logs, Settings
│       └── stores/            # authStore.ts (Zustand)
├── nginx/
│   └── nginx.conf             # Конфиг для production
├── .env.example
└── docker-compose.prod.yml    # Docker вариант деплоя
```

## Пользователи по умолчанию

| Логин | Роль |
|-------|------|
| admin | ADMIN |
| operator1 | ADMIN |
| manager | ADMIN |

При первом входе каждый пользователь должен настроить 2FA через Google Authenticator.

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Секрет для access токенов (openssl rand -hex 32) |
| `JWT_REFRESH_SECRET` | Секрет для refresh токенов |
| `ENCRYPTION_KEY` | Ключ шифрования AES-256 (openssl rand -hex 32) |
| `PORT` | Порт backend (по умолчанию 3001) |
| `FRONTEND_URL` | URL фронтенда для CORS |
| `NODE_ENV` | Окружение (development/production) |
