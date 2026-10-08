-- Запускать в SQL Editor после деплоя функции notifications.
-- Подставьте адрес проекта и тот же CRON_SECRET, что в секретах функции.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('brut-notifications');
exception
  when others then null;
end $$;

select cron.schedule(
  'brut-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
