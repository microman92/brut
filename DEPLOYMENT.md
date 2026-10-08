# Деплой BRUT

Проект состоит из трёх приложений в одном npm-workspace-репозитории. Для каждого создаётся отдельный Vercel Project, подключённый к одному GitHub-репозиторию.

## Vercel Projects

При импорте одного репозитория создай три проекта и задай им Root Directory:

| Приложение | Root Directory | Настройки сборки |
| --- | --- | --- |
| Сайт | `apps/web` | Framework Next.js, команда `npm run build`, output автоматически |
| API | `apps/api` | Fastify, entrypoint `src/index.ts`, настройки сборки автоматически |
| Telegram Mini App | `apps/miniapp` | Framework Vite, команда `npm run build`, output `dist` |

Оставь включённым доступ сборки к исходникам за пределами Root Directory: приложения используют корневой `package.json`, `package-lock.json` и Prisma schema. Для всех проектов выбери Node.js `24.x`.

## Environment variables

Добавляй переменные отдельно в настройки соответствующего проекта Vercel. Установи их для Production; для Preview укажи тестовые значения или отключи интеграции с Telegram.

### API (`apps/api`)

Обязательные переменные:

- `DATABASE_URL` и `DIRECT_URL` — строки подключения Supabase PostgreSQL из `.env.example`.
- `ADMIN_LOGIN`, `ADMIN_PASSWORD` — логин и начальный пароль владельца; пароль не короче 8 символов.
- `SESSION_SECRET` — случайный секрет для сессий администраторов.
- `SUPABASE_URL` — URL проекта Supabase, нужен для проверки адресов фотографий.
- `CORS_ORIGINS` — точные origin сайта и Mini App через запятую, без конечного `/`.
- `TELEGRAM_BOT_TOKEN`, `MINIAPP_URL` — токен бота и публичный URL Mini App.
- `TELEGRAM_WEBHOOK_URL` — полный адрес `https://<api-domain>/telegram/webhook`.
- `TELEGRAM_WEBHOOK_SECRET`, `BARBER_BIND_SECRET`, `CRON_SECRET` — отдельные случайные секреты.

На Vercel бот работает через webhook. Long polling и локальный таймер напоминаний остаются только для разработки; расписание напоминаний запускает Supabase Cron.

### Сайт (`apps/web`)

- `API_URL` — origin API для запросов с сервера Next.js.
- `NEXT_PUBLIC_API_URL` — тот же origin для запросов браузера.
- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` — нужны серверному обработчику загрузки фотографий.

`SUPABASE_SERVICE_ROLE_KEY` не добавляй в переменные с префиксом `NEXT_PUBLIC_`.

### Mini App (`apps/miniapp`)

- `VITE_API_URL` — origin API. Vite подставляет эту переменную во время сборки.

После первого production-деплоя добавь точные адреса сайта и Mini App в `CORS_ORIGINS` проекта API. Если домены меняются, обнови и переменную API.

## Supabase

1. В SQL Editor выполни [`supabase/storage.sql`](supabase/storage.sql), чтобы создать публичный bucket `barber-images` с лимитом 4 МБ и разрешёнными типами JPG, PNG и WebP.
2. Задай для Edge Function `notifications` секреты `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` и `TELEGRAM_BOT_TOKEN` через Supabase Dashboard.
3. Установи Supabase CLI, войди в аккаунт и разверни функцию командой `supabase functions deploy notifications --project-ref <project-ref>`.
4. В SQL Editor открой [`supabase/cron.sql`](supabase/cron.sql), замени `PROJECT_REF` и `CRON_SECRET` на значения своего проекта и выполни запрос. Cron вызывает Edge Function раз в пять минут.

## Порядок первого запуска

1. Создай GitHub-репозиторий, проверь, что `.env`, `.env.local` и секреты не добавлены в коммит, затем отправь туда проект.
2. Импортируй репозиторий в Vercel три раза и настрой Root Directory для каждого приложения из таблицы.
3. Сначала разверни API и узнай его production-домен. Добавь этот origin в `API_URL`, `NEXT_PUBLIC_API_URL` и `VITE_API_URL` в проектах сайта и Mini App.
4. Разверни сайт и Mini App. Добавь их production origins в `CORS_ORIGINS` API и URL Mini App в `MINIAPP_URL`.
5. Установи `TELEGRAM_WEBHOOK_URL` с доменом API и повторно разверни API. Затем выполни развертывание Edge Function и настрой Cron в Supabase.
6. Выбери регион Vercel Functions рядом с регионом базы Supabase.

## Проверка после деплоя

- `GET https://<api-domain>/health` возвращает `{ "ok": true }`.
- Сайт и Mini App загружают услуги, барберов и доступные слоты с production API.
- Проверь полный сценарий записи, а затем отмену и перенос.
- Войди в `/admin`, создай пробную запись, измени статус и загрузи фотографию барбера.
- Проверь получение webhook в логах API, напоминание и выполнение `notifications` в Supabase.
- Проверь сайт, админку и Mini App на телефоне.

Не отмечай этап 11 выполненным в `tasks-final.md`, пока эти проверки не пройдены на production URL.
