import { randomBytes } from "node:crypto";
import { bookingTelegramUrl, notifyCancelled, notifyCreated, notifyMoved } from "./bot.js";
import { prisma } from "./db.js";
import { addDays, canChange, collectSlots, formatTashkent, tashkentDate, weekday, zoned } from "./slots.js";
import { whenLabel } from "./messages.js";

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

type Line = { serviceId: string; name: string; durationMin: number; price: number };

function clock(value: Date) {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function isOverlap(error: unknown) {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && current && "code" in current) parts.push(String(current.code));
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  const text = parts.join("\n");
  return text.includes("23P01") || text.includes("bookings_no_overlap");
}

async function settings() {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    stepMin: read("slot_step_min", 15),
    horizonDays: read("booking_horizon_days", 30),
    noticeMin: read("min_notice_min", 30),
    cutoffMin: read("cancel_cutoff_min", 30),
  };
}

async function catalog(serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  const services = await prisma.service.findMany({
    where: { id: { in: unique }, isActive: true },
  });
  if (services.length !== unique.length) throw new ApiError(422, "UNKNOWN_SERVICE", "Услуга не найдена");
  return unique.map((id) => services.find((service) => service.id === id)!);
}

async function candidates(serviceIds: string[], barberId: string) {
  const rows = await prisma.barber.findMany({
    where: { isActive: true, ...(barberId === "any" ? {} : { id: barberId }) },
    orderBy: { sortOrder: "asc" },
    include: { services: true },
  });
  return rows.filter((barber) => serviceIds.every((id) => barber.services.some((link) => link.serviceId === id && link.isEnabled)));
}

function linesFor(services: Awaited<ReturnType<typeof catalog>>, links: { serviceId: string; durationMin: number | null; price: number | null }[]) {
  return services.map((service) => {
    const link = links.find((item) => item.serviceId === service.id);
    return {
      serviceId: service.id,
      name: service.name,
      durationMin: link?.durationMin ?? service.durationMin,
      price: link?.price ?? service.price,
    };
  });
}

async function dayContext(barberIds: string[], from: string, to: string) {
  const fromMs = zoned(from, "00:00");
  const toMs = zoned(to, "00:00");
  const [hours, breaks, timeOff, bookings] = await Promise.all([
    prisma.workingHour.findMany({ where: { barberId: { in: barberIds } } }),
    prisma.break.findMany({ where: { barberId: { in: barberIds } } }),
    prisma.timeOff.findMany({
      where: {
        OR: [{ barberId: { in: barberIds } }, { barberId: null }],
        startsAt: { lt: new Date(toMs) },
        endsAt: { gt: new Date(fromMs) },
      },
    }),
    prisma.booking.findMany({
      where: {
        status: "confirmed",
        barberId: { in: barberIds },
        startsAt: { lt: new Date(toMs) },
        endsAt: { gt: new Date(fromMs) },
      },
    }),
  ]);
  return { hours, breaks, timeOff, bookings };
}

function slotsForBarber(input: {
  date: string;
  durationMin: number;
  stepMin: number;
  earliest: number;
  barberId: string;
  context: Awaited<ReturnType<typeof dayContext>>;
  ignoreBookingId?: string;
}) {
  const day = weekday(input.date);
  const dayStart = zoned(input.date, "00:00");
  const dayEnd = zoned(addDays(input.date, 1), "00:00");
  const blocks = [
    ...input.context.timeOff
      .filter((item) => item.barberId === input.barberId || item.barberId === null)
      .map((item) => ({ start: item.startsAt.getTime(), end: item.endsAt.getTime() })),
    ...input.context.bookings
      .filter((item) => item.barberId === input.barberId && item.id !== input.ignoreBookingId)
      .map((item) => ({ start: item.startsAt.getTime(), end: item.endsAt.getTime() })),
  ].filter((item) => item.end > dayStart && item.start < dayEnd);

  return collectSlots({
    date: input.date,
    durationMin: input.durationMin,
    stepMin: input.stepMin,
    earliest: input.earliest,
    work: input.context.hours.filter((item) => item.barberId === input.barberId && item.weekday === day).map((item) => ({ start: clock(item.startTime), end: clock(item.endTime) })),
    breaks: input.context.breaks.filter((item) => item.barberId === input.barberId && item.weekday === day).map((item) => ({ start: clock(item.startTime), end: clock(item.endTime) })),
    blocks,
  });
}

function earliestFor(date: string, now: number, noticeMin: number) {
  return Math.max(zoned(date, "00:00"), now + noticeMin * 60_000);
}

export async function listDays(input: { serviceIds: string[]; barberId: string }, now = Date.now()) {
  const config = await settings();
  const services = await catalog(input.serviceIds);
  const barbers = await candidates(input.serviceIds, input.barberId);
  const today = tashkentDate(now);
  const dates = Array.from({ length: config.horizonDays }, (_, index) => addDays(today, index));
  if (barbers.length === 0) return dates.map((date) => ({ date, open: false }));
  const context = await dayContext(barbers.map((barber) => barber.id), today, addDays(today, config.horizonDays));
  return dates.map((date) => ({
    date,
    open: barbers.some((barber) => {
      const durationMin = linesFor(services, barber.services).reduce((sum, line) => sum + line.durationMin, 0);
      return slotsForBarber({
        date,
        durationMin,
        stepMin: config.stepMin,
        earliest: earliestFor(date, now, config.noticeMin),
        barberId: barber.id,
        context,
      }).length > 0;
    }),
  }));
}

export async function listSlots(input: { serviceIds: string[]; barberId: string; date: string }, now = Date.now()) {
  const config = await settings();
  const today = tashkentDate(now);
  const last = addDays(today, config.horizonDays - 1);
  if (input.date < today || input.date > last) return [];
  const services = await catalog(input.serviceIds);
  const barbers = await candidates(input.serviceIds, input.barberId);
  if (barbers.length === 0) return [];
  const context = await dayContext(barbers.map((barber) => barber.id), input.date, addDays(input.date, 1));
  const times = new Set<string>();
  for (const barber of barbers) {
    const durationMin = linesFor(services, barber.services).reduce((sum, line) => sum + line.durationMin, 0);
    for (const time of slotsForBarber({
      date: input.date,
      durationMin,
      stepMin: config.stepMin,
      earliest: earliestFor(input.date, now, config.noticeMin),
      barberId: barber.id,
      context,
    })) times.add(time);
  }
  return [...times].sort();
}

function view(booking: {
  manageToken: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  startsAt: Date;
  endsAt: Date;
  totalPrice: number;
  totalDurationMin: number;
  barber: { id: string; name: string };
  services: Line[];
  client: { name: string };
}, canEdit: boolean) {
  return {
    manageToken: booking.manageToken,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    date: tashkentDate(booking.startsAt.getTime()),
    time: formatTashkent(booking.startsAt.getTime()),
    barberId: booking.barber.id,
    barberName: booking.barber.name,
    serviceIds: booking.services.map((service) => service.serviceId),
    services: booking.services.map((service) => ({ name: service.name, durationMin: service.durationMin, price: service.price })),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    clientName: booking.client.name,
    canChange: canEdit,
    telegramUrl: bookingTelegramUrl(booking.manageToken),
  };
}

const bookingInclude = { barber: true, services: true, client: true } as const;

async function insertBooking(input: { clientId: string; barberId: string; startsAt: Date; lines: Line[]; source: "web" | "telegram" | "admin" }) {
  const totalDurationMin = input.lines.reduce((sum, line) => sum + line.durationMin, 0);
  const totalPrice = input.lines.reduce((sum, line) => sum + line.price, 0);
  const endsAt = new Date(input.startsAt.getTime() + totalDurationMin * 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          clientId: input.clientId,
          barberId: input.barberId,
          startsAt: input.startsAt,
          endsAt,
          totalPrice,
          totalDurationMin,
          status: "confirmed",
          source: input.source,
          manageToken: randomBytes(24).toString("base64url"),
          services: { create: input.lines },
        },
        include: bookingInclude,
      });
      return booking;
    });
  } catch (error) {
    if (isOverlap(error)) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    throw error;
  }
}

export async function createBooking(input: { serviceIds: string[]; barberId: string; startsAt: Date; client: { name: string; phone: string }; telegramId?: string; source?: "web" | "telegram" | "admin"; noticeMin?: number }) {
  if (Number.isNaN(input.startsAt.getTime())) throw new ApiError(400, "VALIDATION", "Некорректное время");
  const phone = input.client.phone.replace(/\D/g, "");
  if (input.client.name.trim().length < 2 || phone.length < 9) throw new ApiError(400, "VALIDATION", "Введите имя и телефон, минимум 9 цифр");
  const now = Date.now();
  const date = tashkentDate(input.startsAt.getTime());
  const time = formatTashkent(input.startsAt.getTime());
  const config = await settings();
  const noticeMin = input.noticeMin ?? config.noticeMin;
  const services = await catalog(input.serviceIds);
  const barbers = await candidates(input.serviceIds, input.barberId);
  if (barbers.length === 0) throw new ApiError(422, "UNKNOWN_SERVICE", "Мастер не выполняет эти услуги");
  const context = await dayContext(barbers.map((barber) => barber.id), date, addDays(date, 1));
  const ready = barbers.filter((barber) => {
    const durationMin = linesFor(services, barber.services).reduce((sum, line) => sum + line.durationMin, 0);
    return slotsForBarber({
      date,
      durationMin,
      stepMin: config.stepMin,
      earliest: earliestFor(date, now, noticeMin),
      barberId: barber.id,
      context,
    }).includes(time);
  });
  if (ready.length === 0) {
    const today = tashkentDate(now);
    const last = addDays(today, config.horizonDays - 1);
    if (date > last) throw new ApiError(422, "TOO_FAR", "Эта дата дальше горизонта записи");
    if (input.startsAt.getTime() < now + noticeMin * 60_000) throw new ApiError(422, "TOO_SOON", "Слишком скоро для записи");
    throw new ApiError(422, "OUTSIDE_WORKING_HOURS", "Это время недоступно");
  }

  const clientName = input.client.name.trim();
  let client = input.telegramId ? await prisma.client.findUnique({ where: { telegramId: input.telegramId } }) : null;
  if (client) {
    client = await prisma.client.update({ where: { id: client.id }, data: { name: clientName, phone, telegramChatId: input.telegramId } });
  } else {
    client = await prisma.client.findFirst({ where: { phone } });
    if (!client) {
      client = await prisma.client.create({ data: { name: clientName, phone, telegramId: input.telegramId, telegramChatId: input.telegramId } });
    } else if (input.telegramId && !client.telegramId) {
      client = await prisma.client.update({ where: { id: client.id }, data: { name: clientName, telegramId: input.telegramId, telegramChatId: input.telegramId } });
    } else if (client.name !== clientName) {
      client = await prisma.client.update({ where: { id: client.id }, data: { name: clientName } });
    }
  }

  for (const barber of ready) {
    try {
      const booking = await insertBooking({
        clientId: client.id,
        barberId: barber.id,
        startsAt: input.startsAt,
        lines: linesFor(services, barber.services),
        source: input.source ?? (input.telegramId ? "telegram" : "web"),
      });
      await notifyCreated(booking);
      return view(booking, canChange(booking.startsAt.getTime(), Date.now(), config.cutoffMin));
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") continue;
      throw error;
    }
  }
  throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
}

export async function listMyBookings(telegramId: string) {
  const client = await prisma.client.findUnique({ where: { telegramId } });
  if (!client) return [];
  const config = await settings();
  const now = Date.now();
  const rows = await prisma.booking.findMany({
    where: { clientId: client.id },
    orderBy: { startsAt: "desc" },
    include: bookingInclude,
  });
  return rows.map((row) => view(row, row.status === "confirmed" && canChange(row.startsAt.getTime(), now, config.cutoffMin)));
}

export async function getBooking(token: string) {
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, include: bookingInclude });
  if (!booking) return null;
  const config = await settings();
  const editable = booking.status === "confirmed" && canChange(booking.startsAt.getTime(), Date.now(), config.cutoffMin);
  return view(booking, editable);
}

async function activeBooking(token: string, asAdmin = false) {
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, include: bookingInclude });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  if (booking.status !== "confirmed") throw new ApiError(409, "NOT_ACTIVE", "Запись уже не активна");
  const config = await settings();
  if (!asAdmin && !canChange(booking.startsAt.getTime(), Date.now(), config.cutoffMin)) throw new ApiError(422, "TOO_LATE", "Изменить запись уже нельзя");
  return { booking, config };
}

export async function cancelBooking(token: string, asAdmin = false) {
  const { booking } = await activeBooking(token, asAdmin);
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "cancelled" },
    include: bookingInclude,
  });
  await notifyCancelled(updated);
  return view(updated, false);
}

export async function rescheduleBooking(token: string, startsAt: Date, asAdmin = false) {
  if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, "VALIDATION", "Некорректное время");
  const { booking, config } = await activeBooking(token, asAdmin);
  const date = tashkentDate(startsAt.getTime());
  const time = formatTashkent(startsAt.getTime());
  const context = await dayContext([booking.barberId], date, addDays(date, 1));
  const open = slotsForBarber({
    date,
    durationMin: booking.totalDurationMin,
    stepMin: config.stepMin,
    earliest: earliestFor(date, Date.now(), asAdmin ? 0 : config.noticeMin),
    barberId: booking.barberId,
    context,
    ignoreBookingId: booking.id,
  });
  if (!open.includes(time)) throw new ApiError(422, "OUTSIDE_WORKING_HOURS", "Это время недоступно");
  const previous = whenLabel(tashkentDate(booking.startsAt.getTime()), formatTashkent(booking.startsAt.getTime()));
  const endsAt = new Date(startsAt.getTime() + booking.totalDurationMin * 60_000);
  try {
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { startsAt, endsAt },
      include: bookingInclude,
    });
    await notifyMoved(updated, previous);
    return view(updated, canChange(updated.startsAt.getTime(), Date.now(), config.cutoffMin));
  } catch (error) {
    if (isOverlap(error)) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    throw error;
  }
}
