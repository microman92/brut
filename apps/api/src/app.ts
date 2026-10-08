import Fastify from "fastify";
import cors from "@fastify/cors";
import { z, ZodError } from "zod";
import { ApiError, cancelBooking, createBooking, getBooking, listDays, listMyBookings, listSlots, rescheduleBooking } from "./booking.js";
import { ensureAdmin, registerAdmin } from "./admin.js";
import { createBarberLink, openTelegram, telegramWebhook } from "./bot.js";
import { prisma } from "./db.js";
import { runReminders } from "./reminders.js";
import { readInitData, TelegramAuthError, verifyInitData } from "./telegram.js";

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  durationMin: true,
  price: true,
  sortOrder: true,
} as const;

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  sortOrder: number;
};

function mapService(service: ServiceRow, override?: { durationMin: number | null; price: number | null }) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMin: override?.durationMin ?? service.durationMin,
    price: override?.price ?? service.price,
    sortOrder: service.sortOrder,
  };
}

const barberSelect = {
  id: true,
  name: true,
  photoUrl: true,
  bio: true,
  experienceYears: true,
  sortOrder: true,
  services: {
    where: { isEnabled: true, service: { isActive: true } },
    orderBy: { service: { sortOrder: "asc" as const } },
    select: {
      durationMin: true,
      price: true,
      service: { select: serviceSelect },
    },
  },
};

type BarberRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  sortOrder: number;
  services: { durationMin: number | null; price: number | null; service: ServiceRow }[];
};

function mapBarber(barber: BarberRow) {
  return {
    id: barber.id,
    name: barber.name,
    photoUrl: barber.photoUrl,
    bio: barber.bio,
    experienceYears: barber.experienceYears,
    sortOrder: barber.sortOrder,
    services: barber.services.map((item) => mapService(item.service, item)),
  };
}

const idParams = z.object({ id: z.string().uuid() });
const localOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"];
const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...localOrigins, ...configuredOrigins])];

function fail(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: allowedOrigins,
  allowedHeaders: ["content-type", "authorization"],
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof TelegramAuthError) return fail(reply, error.statusCode, error.code, error.message);
  if (error instanceof ApiError) return fail(reply, error.statusCode, error.code, error.message);
  if (error instanceof ZodError) {
    return fail(reply, 400, "VALIDATION", "Некорректный запрос");
  }
  const status = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
  if (status >= 500) request.log.error(error);
  const message = status >= 500 ? "Ошибка сервера" : error instanceof Error ? error.message : "Ошибка сервера";
  const code = status === 404 ? "NOT_FOUND" : "INTERNAL";
  return fail(reply, status, code, message);
});

app.setNotFoundHandler((_request, reply) => {
  fail(reply, 404, "NOT_FOUND", "Маршрут не найден");
});

app.get("/health", async () => ({ ok: true }));

app.get("/api/v1/services", async () => {
  const rows = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: serviceSelect,
  });
  return rows.map((row) => mapService(row));
});

app.get("/api/v1/barbers", async () => {
  const rows = await prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: barberSelect,
  });
  return rows.map(mapBarber);
});

app.get("/api/v1/barbers/:id", async (request, reply) => {
  const params = idParams.safeParse(request.params);
  if (!params.success) return fail(reply, 400, "VALIDATION", "Некорректный id");
  const row = await prisma.barber.findFirst({
    where: { id: params.data.id, isActive: true },
    select: barberSelect,
  });
  if (!row) return fail(reply, 404, "NOT_FOUND", "Барбер не найден");
  return mapBarber(row);
});

const idList = z.string().min(1).transform((value, ctx) => {
  const ids = value.split(",").filter(Boolean);
  const parsed = z.array(z.string().uuid()).min(1).max(3).safeParse(ids);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Некорректные услуги" });
    return z.NEVER;
  }
  return parsed.data;
});
const barberQuery = z.string().uuid().or(z.literal("any"));
const dayQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

app.get("/api/v1/availability", async (request) => {
  const query = z.object({ serviceIds: idList, barberId: barberQuery, date: dayQuery }).parse(request.query);
  return { slots: await listSlots(query) };
});

app.get("/api/v1/availability/days", async (request) => {
  const query = z.object({ serviceIds: idList, barberId: barberQuery }).parse(request.query);
  return { days: await listDays(query) };
});

function telegramUser(header: string | undefined) {
  const initData = readInitData(header);
  if (!initData) throw new TelegramAuthError("Нет initData");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new ApiError(503, "NO_BOT_TOKEN", "Задайте TELEGRAM_BOT_TOKEN");
  return verifyInitData(initData, botToken);
}

app.get("/api/v1/me/bookings", async (request) => {
  const user = telegramUser(request.headers.authorization);
  return { bookings: await listMyBookings(String(user.id)) };
});

app.post("/api/v1/telegram/verify", async (request) => {
  const body = z.object({ initData: z.string().min(1) }).parse(request.body);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new ApiError(503, "NO_BOT_TOKEN", "Задайте TELEGRAM_BOT_TOKEN");
  const user = verifyInitData(body.initData, botToken);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return { ok: true, userId: user.id, name };
});

app.post("/telegram/webhook", async (request, reply) => {
  if (!telegramWebhook) throw new ApiError(503, "NO_BOT_TOKEN", "Задайте TELEGRAM_BOT_TOKEN");
  await telegramWebhook(request, reply);
});

app.post("/api/v1/telegram/barber-links", async (request) => {
  const secret = process.env.BARBER_BIND_SECRET?.trim();
  if (!secret) throw new ApiError(503, "NO_BIND_SECRET", "Задайте BARBER_BIND_SECRET");
  if (request.headers.authorization !== `Bearer ${secret}`) throw new ApiError(401, "UNAUTHORIZED", "Неверный секрет привязки");
  const body = z.object({ barberId: z.string().uuid() }).parse(request.body);
  const link = await createBarberLink(body.barberId);
  if ("error" in link && link.error === "NOT_FOUND") throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  if ("error" in link) throw new ApiError(503, "NO_BOT", "Бот ещё не запущен");
  return link;
});

registerAdmin(app);

app.post("/internal/notifications", async (request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new ApiError(503, "NO_CRON_SECRET", "Задайте CRON_SECRET");
  if (request.headers.authorization !== `Bearer ${secret}`) throw new ApiError(401, "UNAUTHORIZED", "Неверный секрет cron");
  return runReminders();
});

app.post("/api/v1/bookings", async (request, reply) => {
  const body = z.object({
    serviceIds: z.array(z.string().uuid()).min(1).max(3),
    barberId: barberQuery,
    startsAt: z.string().min(16),
    client: z.object({ name: z.string().trim().min(2), phone: z.string().trim().min(9) }),
  }).parse(request.body);
  const initData = readInitData(request.headers.authorization);
  const telegramId = initData ? String(telegramUser(request.headers.authorization).id) : undefined;
  const booking = await createBooking({ ...body, startsAt: new Date(body.startsAt), telegramId });
  return reply.status(201).send(booking);
});

app.get("/api/v1/bookings/:token", async (request, reply) => {
  const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
  const booking = await getBooking(token);
  if (!booking) return fail(reply, 404, "NOT_FOUND", "Запись не найдена");
  return booking;
});

app.post("/api/v1/bookings/:token/cancel", async (request) => {
  const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
  return cancelBooking(token);
});

app.post("/api/v1/bookings/:token/reschedule", async (request) => {
  const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
  const body = z.object({ startsAt: z.string().min(16) }).parse(request.body);
  return rescheduleBooking(token, new Date(body.startsAt));
});

const isVercel = process.env.VERCEL === "1";
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
export default app;

async function startTelegram() {
  try {
    const mode = await openTelegram();
    if (mode === "polling") app.log.info("Telegram: long polling");
    if (mode === "webhook") app.log.info("Telegram: webhook");
  } catch (error) {
    app.log.error(error, "Telegram bot не запустился");
  }
}

if (isVercel) {
  if (process.env.TELEGRAM_WEBHOOK_URL?.trim()) {
    void startTelegram();
  } else if (process.env.TELEGRAM_BOT_TOKEN) {
    app.log.error("На Vercel задайте TELEGRAM_WEBHOOK_URL; long polling там не запускается");
  }
} else {
  try {
    await ensureAdmin();
  } catch (error) {
    app.log.error(error, "Администратор не создан");
  }
  await startTelegram();
  await app.listen({ port, host: "0.0.0.0" });
  const reminders = 5 * 60_000;
  setInterval(() => {
    void runReminders().catch((error: unknown) => app.log.error(error, "Напоминания"));
  }, reminders);
  void runReminders().catch((error: unknown) => app.log.error(error, "Напоминания"));
}
