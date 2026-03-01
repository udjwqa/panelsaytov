# Deploy Panel — Project Plan

## Текущая фаза: ВСЕ ФАЗЫ ЗАВЕРШЕНЫ (0-14)

## Прогресс

### Фаза 0 — Инициализация проекта [DONE]
- [x] Git init + .gitignore + PROJECT_PLAN.md
- [x] Docker Compose / Homebrew (PostgreSQL + Redis)
- [x] Backend init (Express + TypeScript)
- [x] Prisma schema + миграция + seed (Prisma 7 + PrismaPg adapter)
- [x] Frontend init (Vite + React + Tailwind v4)

### Фаза 1 — Авторизация + Layout [DONE]
- [x] JWT auth service + middleware (access 15min + refresh 7d)
- [x] Auth API routes (login, logout, me, refresh, change-password)
- [x] Users CRUD (admin only) — GET/POST/PUT/DELETE /api/settings/users
- [x] Logging service (logAction → Log table)
- [x] RBAC middleware (requireRole)
- [x] AES-256-GCM crypto utility
- [x] Frontend: API client + auth store (Zustand) + auto-refresh interceptor
- [x] Frontend: UI components (Button, Input, Modal, StatusDot, Badge)
- [x] Frontend: Login page
- [x] Frontend: Layout (Sidebar + Header + PanicButton + ConfirmDialog)
- [x] Frontend: Routing + protected routes (8 разделов)
- [x] Integration testing — login/logout/navigation работает

### Фаза 2 — Серверы [DONE]
- [x] SSH service (connect, test, ping, stats)
- [x] Servers routes (CRUD + ping + test-ssh + stats)
- [x] Frontend: Servers.tsx (таблица, добавление, удаление, пинг, тест SSH)

### Фаза 3 — Сайты [DONE]
- [x] Sites routes (CRUD + switch-domain)
- [x] Frontend: Sites.tsx (таблица, добавление/редактирование, смена домена, удаление)

### Фаза 4 — Домены + Cloudflare [DONE]
- [x] Cloudflare service (DNS records CRUD, test connection)
- [x] Domains routes (CRUD + check-dns + check-ssl + mark-abused + restore)
- [x] Frontend: Domains.tsx (4 вкладки: Все/Активные/Свободные/Абузные, проверка DNS/SSL)

### Фаза 5 — Деплой (CORE) [DONE]
- [x] Deploy service (auto-detect stack, git clone, build, nginx, SSL, systemd)
- [x] BullMQ queue service (concurrency: 3)
- [x] Deploy routes (create, list, detail, cancel)
- [x] Socket.IO real-time deploy log streaming
- [x] Frontend: Deploy.tsx (запуск деплоя, live-лог, история деплоев)

### Фаза 6 — Миграция + Panic Button [DONE]
- [x] Migration service (перенос сайта на другой сервер)
- [x] Panic switch (переключение всех сайтов на запасные домены)
- [x] Panic route (POST /api/panic)
- [x] PanicButton в хедере с подтверждением

### Фаза 7 — Мониторинг [DONE]
- [x] Monitoring service (HTTP health check каждые 60с)
- [x] Auto-rotation check (каждый час)
- [x] Frontend: Monitoring.tsx (таблица с HTTP статус, отклик, авторотация)

### Фаза 8 — Telegram бот [DONE]
- [x] Telegram service (notify deploy success/failed, site down, panic)
- [x] Настройки Telegram в Settings page

### Фаза 9 — Логи + Дашборд [DONE]
- [x] Logs route (пагинация, фильтрация)
- [x] Dashboard route (агрегированная статистика)
- [x] Frontend: Logs.tsx (таблица с цветными бейджами действий, пагинация)
- [x] Frontend: Dashboard.tsx (4 карточки статистики, последние деплои, лента действий)
- [x] Header: живой счётчик "X/Y сайтов онлайн"

### Фаза 10 — Настройки + 2FA + Полировка [DONE]
- [x] Frontend: SettingsPage.tsx (управление пользователями, вкладка уведомлений)
- [x] Добавление/удаление пользователей
- [x] 2FA поле в схеме (totpSecret, totpEnabled) — готово к реализации TOTP

### Фаза 11 — Система бэкапов [DONE]
- [x] Backup модель в Prisma (тип, статус, размер, БД, срок хранения)
- [x] Backup service (SSH: определение БД, дамп MySQL/PostgreSQL, архивация файлов, SCP, ротация)
- [x] BullMQ backup scheduler (cron расписание, автобэкап, ручной бэкап)
- [x] Backup routes (CRUD + restore + settings)
- [x] Frontend: Backups.tsx (таблица, создание, восстановление, удаление, настройки автобэкапа)
- [x] Ссылка в Sidebar + роут в App.tsx

### Фаза 12 — Обязательная 2FA через Google Authenticator [DONE]
- [x] otpauth + qrcode пакеты
- [x] TOTP service (генерация секрета, QR-код, верификация, backup codes)
- [x] Обновлённый auth flow (login с 2FA, setup-2fa, confirm-2fa endpoints)
- [x] Новые пользователи: xK7_sysroot_4dm (ADMIN) + n3_opnode_7rx (OPERATOR)
- [x] Удалён старый admin/admin123
- [x] Frontend: Login.tsx с 2-шаговой аутентификацией (логин → TOTP код)
- [x] Frontend: Setup2FA.tsx (QR-код, подтверждение, резервные коды)
- [x] Редирект на /setup-2fa для пользователей без настроенной 2FA
- [x] Поле backupCodes в модели User

### Фаза 13 — Production Readiness [DONE]
- [x] docker-compose.prod.yml (PostgreSQL, Redis, Backend, Frontend + nginx)
- [x] Backend Dockerfile (multi-stage build)
- [x] Frontend Dockerfile (Vite build + nginx)
- [x] nginx.conf (reverse proxy + WebSocket + security headers + gzip)
- [x] setup.sh (автоматическая установка)
- [x] .env.example (документированные переменные)
- [x] TESTING_CHECKLIST.md (полный чеклист всех функций)

### Фаза 14 — Финальная полировка [DONE]
- [x] Добавлены лейблы backup-действий в Logs.tsx
- [x] Добавлена карточка «Бэкапы» в Dashboard.tsx (5 карточек)
- [x] Статистика бэкапов в dashboard API
- [x] Полная проверка TypeScript компиляции (backend + frontend — 0 ошибок)
