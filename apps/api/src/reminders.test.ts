import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./db.js";
import { dueActions } from "./reminder-plan.js";
import { runReminders } from "./reminders.js";

const settings = { dayMinutes: 1440, shortMinutes: 30, reviewDelayMin: 60 };

describe("окна напоминаний", () => {
  const now = Date.parse("2026-10-05T06:00:00Z");

  it("за сутки шлёт один раз, за 30 минут — отдельно", () => {
    const day = dueActions({
      now,
      startsAt: now + 10 * 60 * 60_000,
      endsAt: now + 11 * 60 * 60_000,
      status: "confirmed",
      daySent: false,
      shortSent: false,
      reviewSent: false,
      settings,
    });
    expect(day).toEqual(["day"]);
    const again = dueActions({
      now,
      startsAt: now + 10 * 60 * 60_000,
      endsAt: now + 11 * 60 * 60_000,
      status: "confirmed",
      daySent: true,
      shortSent: false,
      reviewSent: false,
      settings,
    });
    expect(again).toEqual([]);
    const soon = dueActions({
      now,
      startsAt: now + 20 * 60_000,
      endsAt: now + 50 * 60_000,
      status: "confirmed",
      daySent: false,
      shortSent: false,
      reviewSent: false,
      settings,
    });
    expect(soon).toEqual(["short"]);
  });

  it("после визита завершает запись и просит отзыв один раз", () => {
    const actions = dueActions({
      now,
      startsAt: now - 3 * 60 * 60_000,
      endsAt: now - 2 * 60 * 60_000,
      status: "confirmed",
      daySent: false,
      shortSent: false,
      reviewSent: false,
      settings,
    });
    expect(actions).toEqual(["complete", "review"]);
    const done = dueActions({
      now,
      startsAt: now - 3 * 60 * 60_000,
      endsAt: now - 2 * 60 * 60_000,
      status: "completed",
      daySent: true,
      shortSent: true,
      reviewSent: true,
      settings,
    });
    expect(done).toEqual([]);
  });
});

describe("повторный запуск", () => {
  let bookingId = "";
  let barberId = "";
  let serviceId = "";
  let clientId = "";

  afterAll(async () => {
    if (bookingId) await prisma.booking.deleteMany({ where: { id: bookingId } });
    if (clientId) await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    if (barberId) await prisma.barber.delete({ where: { id: barberId } }).catch(() => undefined);
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("ставит отметку и не шлёт то же сообщение второй раз", async () => {
    const service = await prisma.service.create({
      data: { name: "Reminder cut", description: "test", durationMin: 30, price: 1000, sortOrder: 98 },
    });
    serviceId = service.id;
    const barber = await prisma.barber.create({
      data: { name: "Reminder Barber", bio: "test", experienceYears: 1, sortOrder: 98 },
    });
    barberId = barber.id;
    const client = await prisma.client.create({
      data: { name: "Reminder Guest", phone: `99891${Date.now().toString().slice(-7)}`, telegramId: `reminder-${Date.now()}`, telegramChatId: "reminder-test" },
    });
    clientId = client.id;
    const startsAt = new Date(Date.now() + 20 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        clientId: client.id,
        barberId: barber.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        totalPrice: 1000,
        totalDurationMin: 30,
        status: "confirmed",
        source: "web",
        manageToken: randomBytes(24).toString("base64url"),
        services: { create: { serviceId: service.id, name: "Reminder cut", durationMin: 30, price: 1000 } },
      },
    });
    bookingId = booking.id;
    const sent: string[] = [];
    const send = async (_chatId: string, text: string) => {
      sent.push(text);
      return true;
    };
    const first = await runReminders(Date.now(), send, booking.id);
    const second = await runReminders(Date.now(), send, booking.id);
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(first.sent).toEqual(["short"]);
    expect(second.sent).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Через 30 минут");
    expect(saved.reminder30mSentAt).not.toBeNull();
  });
});
