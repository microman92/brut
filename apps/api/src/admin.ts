import { hash, verify } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAnalytics } from "./analytics.js";
import { ApiError, cancelBooking, createBooking, rescheduleBooking } from "./booking.js";
import { prisma } from "./db.js";
import { assertLoginAllowed, clearLoginFailures, noteLoginFailure } from "./login-limit.js";
import { readSession, signSession } from "./session.js";
import { formatTashkent, tashkentDate } from "./slots.js";

const settingKeys = [
  "cancel_cutoff_min",
  "slot_step_min",
  "booking_horizon_days",
  "min_notice_min",
  "reminder_day_minutes",
  "reminder_short_minutes",
  "review_delay_min",
  "review_public_min_rating",
  "timezone",
] as const;

const clockPattern = /^\d{2}:\d{2}$/;
const localImagePath = /^\/images\/[a-z0-9./_-]+$/i;
const imagePath = z.string().refine((value) => {
  if (localImagePath.test(value)) return true;
  const storageBase = process.env.SUPABASE_URL?.trim();
  if (!storageBase) return false;
  try {
    const image = new URL(value);
    const storage = new URL(storageBase);
    return image.protocol === "https:"
      && image.origin === storage.origin
      && image.pathname.startsWith("/storage/v1/object/public/barber-images/");
  } catch {
    return false;
  }
}, "Неверный адрес изображения");
const analyticsDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Некорректная дата");
const analyticsPeriod = z.object({ from: analyticsDate, to: analyticsDate }).superRefine(({ from, to }, context) => {
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days < 1) context.addIssue({ code: "custom", path: ["to"], message: "Дата окончания раньше начала" });
  if (days > 366) context.addIssue({ code: "custom", path: ["to"], message: "Период не может превышать 366 дней" });
});

function clock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) throw new ApiError(400, "VALIDATION", "Некорректное время");
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

function clockLabel(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function secret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new ApiError(503, "NO_SESSION_SECRET", "Задайте SESSION_SECRET");
  return value;
}

async function requireAdmin(header: string | undefined) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const adminId = token ? readSession(token, secret()) : null;
  if (!adminId) throw new ApiError(401, "UNAUTHORIZED", "Нужен вход");
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new ApiError(401, "UNAUTHORIZED", "Нужен вход");
  return admin;
}

function isForeignKey(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

export async function ensureAdmin() {
  const login = process.env.ADMIN_LOGIN?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!login || password.length < 8) return;
  const count = await prisma.adminUser.count();
  if (count > 0) return;
  await prisma.adminUser.create({ data: { login, passwordHash: await hash(password) } });
}

const dayRows = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(clockPattern),
  endTime: z.string().regex(clockPattern),
})).max(7);

export function registerAdmin(app: FastifyInstance) {
  app.post("/api/v1/admin/login", async (request) => {
    const body = z.object({ login: z.string().trim().min(1), password: z.string().min(1) }).parse(request.body);
    assertLoginAllowed(body.login);
    const admin = await prisma.adminUser.findUnique({ where: { login: body.login } });
    const ok = admin ? await verify(admin.passwordHash, body.password) : false;
    if (!admin || !ok) {
      noteLoginFailure(body.login);
      throw new ApiError(401, "UNAUTHORIZED", "Неверный логин или пароль");
    }
    clearLoginFailures(body.login);
    return { token: signSession(admin.id, secret()) };
  });

  app.get("/api/v1/admin/me", async (request) => {
    const admin = await requireAdmin(request.headers.authorization);
    return { id: admin.id, login: admin.login };
  });

  app.get("/api/v1/admin/analytics", async (request) => {
    await requireAdmin(request.headers.authorization);
    return getAnalytics(analyticsPeriod.parse(request.query));
  });

  app.get("/api/v1/admin/bookings", async (request) => {
    await requireAdmin(request.headers.authorization);
    const rows = await prisma.booking.findMany({
      orderBy: { startsAt: "desc" },
      take: 80,
      include: { client: true, barber: true, services: true },
    });
    return {
      bookings: rows.map((row) => ({
        id: row.id,
        manageToken: row.manageToken,
        status: row.status,
        source: row.source,
        date: tashkentDate(row.startsAt.getTime()),
        time: formatTashkent(row.startsAt.getTime()),
        barberId: row.barberId,
        barberName: row.barber.name,
        clientName: row.client.name,
        phone: row.client.phone,
        services: row.services.map((item) => item.name),
        serviceIds: row.services.map((item) => item.serviceId),
        totalPrice: row.totalPrice,
      })),
    };
  });

  app.post("/api/v1/admin/bookings", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({
      serviceIds: z.array(z.string().uuid()).min(1).max(3),
      barberId: z.string().uuid(),
      startsAt: z.string().min(16),
      client: z.object({ name: z.string().trim().min(2), phone: z.string().trim().min(9) }),
    }).parse(request.body);
    return createBooking({ ...body, startsAt: new Date(body.startsAt), source: "admin", noticeMin: 0 });
  });

  app.post("/api/v1/admin/bookings/:token/cancel", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    return cancelBooking(token, true);
  });

  app.post("/api/v1/admin/bookings/:token/reschedule", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    const body = z.object({ startsAt: z.string().min(16) }).parse(request.body);
    return rescheduleBooking(token, new Date(body.startsAt), true);
  });

  app.post("/api/v1/admin/bookings/:id/status", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(["confirmed", "completed", "cancelled", "no_show"]) }).parse(request.body);
    const booking = await prisma.booking.update({ where: { id }, data: { status: body.status } }).catch(() => null);
    if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
    return { id: booking.id, status: booking.status };
  });

  app.get("/api/v1/admin/services", async (request) => {
    await requireAdmin(request.headers.authorization);
    const services = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
    return { services };
  });

  app.post("/api/v1/admin/services", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({
      name: z.string().trim().min(2),
      description: z.string().trim().min(2),
      durationMin: z.number().int().min(5).max(480),
      price: z.number().int().min(0),
      sortOrder: z.number().int().min(0).default(0),
      isActive: z.boolean().default(true),
    }).parse(request.body);
    return prisma.service.create({ data: body });
  });

  app.patch("/api/v1/admin/services/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2),
      description: z.string().trim().min(2),
      durationMin: z.number().int().min(5).max(480),
      price: z.number().int().min(0),
      sortOrder: z.number().int().min(0),
      isActive: z.boolean(),
    }).parse(request.body);
    const service = await prisma.service.update({ where: { id }, data: body }).catch(() => null);
    if (!service) throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
    return service;
  });

  app.delete("/api/v1/admin/services/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      await prisma.service.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (!isForeignKey(error)) throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
      await prisma.service.update({ where: { id }, data: { isActive: false } });
      return { hidden: true };
    }
  });

  app.get("/api/v1/admin/barbers", async (request) => {
    await requireAdmin(request.headers.authorization);
    const barbers = await prisma.barber.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        services: true,
        portfolio: { orderBy: { sortOrder: "asc" } },
        workingHours: true,
        breaks: true,
        timeOff: { orderBy: { startsAt: "desc" }, take: 20 },
      },
    });
    return {
      barbers: barbers.map((barber) => ({
        ...barber,
        workingHours: barber.workingHours.map((row) => ({ ...row, startTime: clockLabel(row.startTime), endTime: clockLabel(row.endTime) })),
        breaks: barber.breaks.map((row) => ({ ...row, startTime: clockLabel(row.startTime), endTime: clockLabel(row.endTime) })),
      })),
    };
  });

  app.post("/api/v1/admin/barbers", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({
      name: z.string().trim().min(2),
      bio: z.string().trim().min(2),
      experienceYears: z.number().int().min(0).max(60),
      sortOrder: z.number().int().min(0).default(0),
      photoUrl: imagePath.nullable().optional(),
    }).parse(request.body);
    return prisma.barber.create({ data: { ...body, photoUrl: body.photoUrl ?? null } });
  });

  app.patch("/api/v1/admin/barbers/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2),
      bio: z.string().trim().min(2),
      experienceYears: z.number().int().min(0).max(60),
      sortOrder: z.number().int().min(0),
      isActive: z.boolean(),
      photoUrl: imagePath.nullable(),
      serviceIds: z.array(z.string().uuid()).max(20),
    }).parse(request.body);
    const barber = await prisma.barber.findUnique({ where: { id } });
    if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    await prisma.$transaction([
      prisma.barber.update({
        where: { id },
        data: {
          name: body.name,
          bio: body.bio,
          experienceYears: body.experienceYears,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
          photoUrl: body.photoUrl,
        },
      }),
      prisma.barberService.deleteMany({ where: { barberId: id } }),
      prisma.barberService.createMany({ data: body.serviceIds.map((serviceId) => ({ barberId: id, serviceId, isEnabled: true })) }),
    ]);
    return { ok: true };
  });

  app.delete("/api/v1/admin/barbers/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      await prisma.barber.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (!isForeignKey(error)) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
      await prisma.barber.update({ where: { id }, data: { isActive: false } });
      return { hidden: true };
    }
  });

  app.put("/api/v1/admin/barbers/:id/hours", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = dayRows.parse(request.body);
    await prisma.$transaction([
      prisma.workingHour.deleteMany({ where: { barberId: id } }),
      prisma.workingHour.createMany({ data: rows.map((row) => ({ barberId: id, weekday: row.weekday, startTime: clock(row.startTime), endTime: clock(row.endTime) })) }),
    ]);
    return { ok: true };
  });

  app.put("/api/v1/admin/barbers/:id/breaks", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = dayRows.parse(request.body);
    await prisma.$transaction([
      prisma["break"].deleteMany({ where: { barberId: id } }),
      prisma["break"].createMany({ data: rows.map((row) => ({ barberId: id, weekday: row.weekday, startTime: clock(row.startTime), endTime: clock(row.endTime) })) }),
    ]);
    return { ok: true };
  });

  app.get("/api/v1/admin/time-off", async (request) => {
    await requireAdmin(request.headers.authorization);
    const timeOff = await prisma.timeOff.findMany({ orderBy: { startsAt: "desc" }, take: 40 });
    return { timeOff };
  });

  app.post("/api/v1/admin/time-off", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({
      barberId: z.string().uuid().nullable(),
      startsAt: z.string().min(16),
      endsAt: z.string().min(16),
      type: z.enum(["day_off", "vacation", "sick", "closure"]),
      note: z.string().trim().max(200).optional(),
    }).parse(request.body);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new ApiError(400, "VALIDATION", "Некорректный интервал");
    return prisma.timeOff.create({ data: { barberId: body.barberId, startsAt, endsAt, type: body.type, note: body.note } });
  });

  app.delete("/api/v1/admin/time-off/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.timeOff.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "NOT_FOUND", "Исключение не найдено");
    });
    return { ok: true };
  });

  app.post("/api/v1/admin/barbers/:id/portfolio", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ imageUrl: imagePath }).parse(request.body);
    const last = await prisma.portfolioItem.findFirst({ where: { barberId: id }, orderBy: { sortOrder: "desc" } });
    return prisma.portfolioItem.create({ data: { barberId: id, imageUrl: body.imageUrl, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  });

  app.delete("/api/v1/admin/portfolio/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.portfolioItem.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "NOT_FOUND", "Фото не найдено");
    });
    return { ok: true };
  });

  app.get("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request.headers.authorization);
    const rows = await prisma.setting.findMany({ where: { key: { in: [...settingKeys] } }, orderBy: { key: "asc" } });
    return { settings: rows };
  });

  app.put("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({ key: z.enum(settingKeys), value: z.string().trim().min(1).max(80) }).parse(request.body);
    if (body.key !== "timezone" && !/^\d+$/.test(body.value)) throw new ApiError(400, "VALIDATION", "Нужно целое число");
    return prisma.setting.upsert({ where: { key: body.key }, create: body, update: { value: body.value } });
  });

  app.get("/api/v1/admin/reviews", async (request) => {
    await requireAdmin(request.headers.authorization);
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { client: true, barber: true },
    });
    return {
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        isPublic: review.isPublic,
        createdAt: review.createdAt.toISOString(),
        clientName: review.client.name,
        barberName: review.barber.name,
      })),
    };
  });

  app.post("/api/v1/admin/reviews", async (request) => {
    await requireAdmin(request.headers.authorization);
    const body = z.object({
      bookingId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
      isPublic: z.boolean().default(false),
    }).parse(request.body);
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } });
    if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
    return prisma.review.create({
      data: {
        bookingId: booking.id,
        barberId: booking.barberId,
        clientId: booking.clientId,
        rating: body.rating,
        comment: body.comment,
        isPublic: body.isPublic,
      },
    }).catch(() => {
      throw new ApiError(409, "REVIEW_EXISTS", "Отзыв на эту запись уже есть");
    });
  });

  app.patch("/api/v1/admin/reviews/:id", async (request) => {
    await requireAdmin(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ isPublic: z.boolean() }).parse(request.body);
    const review = await prisma.review.update({ where: { id }, data: { isPublic: body.isPublic } }).catch(() => null);
    if (!review) throw new ApiError(404, "NOT_FOUND", "Отзыв не найден");
    return { id: review.id, isPublic: review.isPublic };
  });
}
