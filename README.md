# BRUT — запись в барбершоп

BRUT — веб-проект барбершопа в Ташкенте. Клиенты выбирают услуги и мастера, находят свободное время и записываются онлайн. Владелец управляет расписанием и записями через админ-панель, а клиенты могут записываться и следить за визитами в Telegram Mini App.

## Что умеет проект

- Публичный сайт с услугами, мастерами, портфолио и формой записи.
- Проверка доступности мастеров и времени; перенос и отмена записей.
- Telegram Mini App: запись, просмотр своих записей и управление ими.
- Админ-панель `/admin`: управление записями, услугами, мастерами, графиком, отзывами и настройками; сводная аналитика.
- Telegram-уведомления и напоминания о визите. Для расписания уведомлений используется Supabase Edge Function и Cron.

## Как устроен репозиторий

Это один npm-workspace монорепозиторий с тремя приложениями:

| Путь | Приложение | Стек |
| --- | --- | --- |
| `apps/web` | Сайт и админ-панель | Next.js, React, TypeScript |
| `apps/api` | API, логика записей и Telegram-бот | Fastify, TypeScript, Prisma |
| `apps/miniapp` | Клиентская часть Telegram Mini App | Vite, React, TypeScript |
| `prisma` | Схема, миграции и начальные данные | PostgreSQL, Prisma |
| `supabase` | SQL для хранилища и Cron, Edge Function уведомлений | Supabase |

Сайт, API и Mini App можно развернуть как три отдельных Vercel-проекта из этого же Git-репозитория. Для каждого задаётся своя корневая папка: `apps/web`, `apps/api` или `apps/miniapp`. Порядок настройки описан в [DEPLOYMENT.md](DEPLOYMENT.md).

## Локальный запуск

Нужны Node.js 24 и npm. Для базы используется PostgreSQL; переменные в `.env.example` подготовлены для Supabase.

1. Установи зависимости:

   ```bash
   npm install
   ```

2. Создай корневой `.env` из `.env.example` и укажи как минимум `DATABASE_URL`, `DIRECT_URL`, `ADMIN_LOGIN`, `ADMIN_PASSWORD` и `SESSION_SECRET`. Для функций Telegram и загрузки фотографий заполни соответствующие переменные из шаблона.

   В PowerShell файл можно скопировать так:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Создай клиент Prisma, примени миграции и добавь демонстрационные услуги и мастеров:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. Для сайта и Mini App добавь локальные переменные в `apps/web/.env.local` и `apps/miniapp/.env.local`:

   ```dotenv
   # apps/web/.env.local
   API_URL="http://localhost:4000"
   NEXT_PUBLIC_API_URL="http://localhost:4000"
   ```

   ```dotenv
   # apps/miniapp/.env.local
   VITE_API_URL="http://localhost:4000"
   ```

5. Запусти API, сайт и Mini App в отдельных терминалах из корня репозитория:

   ```bash
   npm run dev:api
   npm run dev
   npm run dev:miniapp
   ```

Сайт откроется на `http://localhost:3000`, API — на `http://localhost:4000`, Mini App — на `http://localhost:5173`. Админ-панель доступна по адресу `http://localhost:3000/admin`.

## Основные команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Запустить сайт |
| `npm run dev:api` | Запустить API |
| `npm run dev:miniapp` | Запустить Mini App |
| `npm run build` | Собрать сайт |
| `npm run build -w miniapp` | Проверить типы и собрать Mini App |
| `npm run lint` | Проверить сайт ESLint |
| `npm test` | Запустить тесты API |
| `npm run db:seed` | Заполнить базу начальными услугами и мастерами |

Локальные секреты храни в `.env` и `.env.local`; не добавляй их в Git. Для Vercel и Supabase смотри [инструкцию по развёртыванию](DEPLOYMENT.md).
