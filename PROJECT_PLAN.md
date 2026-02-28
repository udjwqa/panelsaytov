# Deploy Panel — Project Plan

## Текущая фаза: 2 — Серверы

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

### Фаза 2 — Серверы [ ]
### Фаза 3 — Сайты [ ]
### Фаза 4 — Домены + Cloudflare [ ]
### Фаза 5 — Деплой (CORE) [ ]
### Фаза 6 — Миграция + Panic Button [ ]
### Фаза 7 — Мониторинг [ ]
### Фаза 8 — Telegram бот [ ]
### Фаза 9 — Логи + Дашборд [ ]
### Фаза 10 — Настройки + 2FA + Полировка [ ]
