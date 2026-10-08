import { deliver } from "./bot";
import { prisma } from "./db";
import { reminderDayText, reminderSoonText, reviewAskText, whenLabel } from "./messages";
import { dueActions, type ReminderAction, type ReminderSettings } from "./reminder-plan";
import { formatTashkent, tashkentDate } from "./slots";

type Sender = (chatId: string, text: string) => Promise<boolean>;

type Row = {
  id: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  startsAt: Date;
  endsAt: Date;
  totalPrice: number;
  reminderDaySentAt: Date | null;
  reminder30mSentAt: Date | null;
  reviewRequestedAt: Date | null;
  client: { name: string; telegramId: string | null; telegramChatId: string | null };
  barber: { name: string };
  services: { name: string }[];
};

const stampField = {
  day: "reminderDaySentAt",
  short: "reminder30mSentAt",
  review: "reviewRequestedAt",
} as const;

async function reminderSettings(): Promise<ReminderSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["reminder_day_minutes", "reminder_short_minutes", "review_delay_min"] } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    dayMinutes: read("reminder_day_minutes", 1440),
    shortMinutes: read("reminder_short_minutes", 30),
    reviewDelayMin: read("review_delay_min", 60),
  };
}

function textFor(action: Exclude<ReminderAction, "complete">, row: Row) {
  const card = {
    services: row.services.map((item) => item.name).join(", "),
    barberName: row.barber.name,
    clientName: row.client.name,
    when: whenLabel(tashkentDate(row.startsAt.getTime()), formatTashkent(row.startsAt.getTime())),
    price: "",
  };
  if (action === "day") return reminderDayText(card);
  if (action === "short") return reminderSoonText(card);
  return reviewAskText(card);
}

async function claim(id: string, action: Exclude<ReminderAction, "complete">, now: number) {
  const field = stampField[action];
  const result = await prisma.booking.updateMany({
    where: { id, [field]: null },
    data: { [field]: new Date(now) },
  });
  return result.count === 1;
}

async function release(id: string, action: Exclude<ReminderAction, "complete">) {
  const field = stampField[action];
  await prisma.booking.update({ where: { id }, data: { [field]: null } });
}

export async function runReminders(now = Date.now(), send: Sender = deliver, bookingId?: string) {
  const settings = await reminderSettings();
  const rows = await prisma.booking.findMany({
    where: {
      ...(bookingId ? { id: bookingId } : {}),
      status: { in: ["confirmed", "completed"] },
    },
    include: { client: true, barber: true, services: true },
  }) as Row[];
  const sent: ReminderAction[] = [];
  for (const row of rows) {
    const actions = dueActions({
      now,
      startsAt: row.startsAt.getTime(),
      endsAt: row.endsAt.getTime(),
      status: row.status,
      daySent: Boolean(row.reminderDaySentAt),
      shortSent: Boolean(row.reminder30mSentAt),
      reviewSent: Boolean(row.reviewRequestedAt),
      settings,
    });
    for (const action of actions) {
      if (action === "complete") {
        const result = await prisma.booking.updateMany({
          where: { id: row.id, status: "confirmed", autoCompletedAt: null },
          data: { status: "completed", autoCompletedAt: new Date(now) },
        });
        if (result.count === 1) {
          row.status = "completed";
          sent.push("complete");
        }
        continue;
      }
      const chatId = row.client.telegramChatId ?? row.client.telegramId;
      if (!chatId) continue;
      const claimed = await claim(row.id, action, now);
      if (!claimed) continue;
      const ok = await send(chatId, textFor(action, row));
      if (!ok) {
        await release(row.id, action);
        continue;
      }
      if (action === "day") row.reminderDaySentAt = new Date(now);
      if (action === "short") row.reminder30mSentAt = new Date(now);
      if (action === "review") row.reviewRequestedAt = new Date(now);
      sent.push(action);
    }
  }
  return { sent };
}
