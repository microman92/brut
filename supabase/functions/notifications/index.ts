import { dueActions, type ReminderSettings } from "./plan.ts";

type Row = {
  id: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  starts_at: string;
  ends_at: string;
  reminder_day_sent_at: string | null;
  reminder_30m_sent_at: string | null;
  review_requested_at: string | null;
  auto_completed_at: string | null;
  clients: { name: string; telegram_id: string | null; telegram_chat_id: string | null } | null;
  barbers: { name: string } | null;
  booking_services: { name: string }[];
};

const fallback: ReminderSettings = { dayMinutes: 1440, shortMinutes: 30, reviewDelayMin: 60 };

function readSettings(rows: { key: string; value: string }[]): ReminderSettings {
  const map = new Map(rows.map((row) => [row.key, Number(row.value)]));
  const read = (key: string, value: number) => {
    const parsed = map.get(key);
    return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : value;
  };
  return {
    dayMinutes: read("reminder_day_minutes", fallback.dayMinutes),
    shortMinutes: read("reminder_short_minutes", fallback.shortMinutes),
    reviewDelayMin: read("review_delay_min", fallback.reviewDelayMin),
  };
}

function text(kind: "day" | "short" | "review", row: Row) {
  const services = row.booking_services.map((item) => item.name).join(", ");
  const barber = row.barbers?.name ?? "мастер";
  const when = new Date(row.starts_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  if (kind === "day") return `BRUT. Напоминание\n${when}\n${services}\nМастер: ${barber}`;
  if (kind === "short") return `BRUT. Через 30 минут\n${when}\n${services}\nМастер: ${barber}`;
  return `BRUT. Как прошёл визит?\n${when}. ${services}. Мастер: ${barber}.\nЕсли хотите, ответьте числом от 1 до 5.`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method", { status: 405 });
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!url || !key || !token) return new Response("env", { status: 503 });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.8");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const settingsRows = await db.from("settings").select("key, value");
  if (settingsRows.error) return new Response(settingsRows.error.message, { status: 500 });
  const settings = readSettings(settingsRows.data ?? []);
  const bookings = await db
    .from("bookings")
    .select("id, status, starts_at, ends_at, reminder_day_sent_at, reminder_30m_sent_at, review_requested_at, auto_completed_at, clients(name, telegram_id, telegram_chat_id), barbers(name), booking_services(name)")
    .in("status", ["confirmed", "completed"]);
  if (bookings.error) return new Response(bookings.error.message, { status: 500 });

  const now = Date.now();
  let sent = 0;
  for (const row of (bookings.data ?? []) as Row[]) {
    const actions = dueActions({
      now,
      startsAt: Date.parse(row.starts_at),
      endsAt: Date.parse(row.ends_at),
      status: row.status,
      daySent: Boolean(row.reminder_day_sent_at),
      shortSent: Boolean(row.reminder_30m_sent_at),
      reviewSent: Boolean(row.review_requested_at),
      settings,
    });
    for (const action of actions) {
      if (action === "complete") {
        const updated = await db.from("bookings").update({ status: "completed", auto_completed_at: new Date(now).toISOString() }).eq("id", row.id).eq("status", "confirmed").is("auto_completed_at", null).select("id");
        if (updated.data?.length) row.status = "completed";
        continue;
      }
      const chatId = row.clients?.telegram_chat_id ?? row.clients?.telegram_id;
      if (!chatId) continue;
      const field = action === "day" ? "reminder_day_sent_at" : action === "short" ? "reminder_30m_sent_at" : "review_requested_at";
      const claimed = await db.from("bookings").update({ [field]: new Date(now).toISOString() }).eq("id", row.id).is(field, null).select("id");
      if (!claimed.data?.length) continue;
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text(action, row) }),
      });
      if (!response.ok) {
        await db.from("bookings").update({ [field]: null }).eq("id", row.id);
        continue;
      }
      sent += 1;
    }
  }
  return Response.json({ sent });
});
