import { randomBytes } from "node:crypto";
import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { prisma } from "./db";
import { formatTashkent, tashkentDate } from "./slots";
import {
  barberBookedText,
  barberCancelledText,
  barberMovedText,
  cancelledText,
  confirmedText,
  money,
  movedText,
  startKind,
  whenLabel,
  type Card,
} from "./messages";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
export const bot = token ? new Bot(token) : null;

let username = "";

type Saved = {
  startsAt: Date;
  totalPrice: number;
  client: { id: string; name: string; telegramId: string | null; telegramChatId: string | null };
  barber: { id: string; name: string; telegramChatId: string | null };
  services: { name: string }[];
};

function cardOf(booking: Saved): Card & { clientChat: string | null; barberChat: string | null } {
  return {
    services: booking.services.map((item) => item.name).join(", "),
    barberName: booking.barber.name,
    clientName: booking.client.name,
    when: whenLabel(tashkentDate(booking.startsAt.getTime()), formatTashkent(booking.startsAt.getTime())),
    price: money(booking.totalPrice),
    clientChat: booking.client.telegramChatId ?? booking.client.telegramId,
    barberChat: booking.barber.telegramChatId,
  };
}

function menuButton() {
  const url = process.env.MINIAPP_URL?.trim();
  if (!url) return undefined;
  return new InlineKeyboard().webApp("Запись", url);
}

async function send(chatId: string | null, text: string) {
  return deliver(chatId, text);
}

export async function deliver(chatId: string | null, text: string) {
  if (!bot || !chatId) return false;
  try {
    await bot.api.sendMessage(chatId, text, { reply_markup: menuButton() });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    console.error(`telegram: ${message}`);
    return false;
  }
}

export function bookingTelegramUrl(manageToken: string) {
  if (!username) return null;
  return `https://t.me/${username}?start=b_${manageToken}`;
}

export async function notifyCreated(booking: Saved) {
  const card = cardOf(booking);
  await send(card.clientChat, confirmedText(card));
  await send(card.barberChat, barberBookedText(card));
}

export async function notifyCancelled(booking: Saved) {
  const card = cardOf(booking);
  await send(card.clientChat, cancelledText(card));
  await send(card.barberChat, barberCancelledText(card));
}

export async function notifyMoved(booking: Saved, previous: string) {
  const card = cardOf(booking);
  await send(card.clientChat, movedText(card, previous));
  await send(card.barberChat, barberMovedText(card, previous));
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function attachBooking(tokenValue: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: tokenValue },
    include: { client: true, barber: true, services: true },
  });
  if (!booking) return "Эта ссылка не ведёт к записи.";
  if (booking.client.telegramId && booking.client.telegramId !== userId) return "Эта запись уже привязана к другому Telegram.";
  try {
    await prisma.client.update({
      where: { id: booking.client.id },
      data: { telegramId: userId, telegramChatId: userId },
    });
  } catch (error) {
    if (isUnique(error)) return "Этот Telegram уже привязан к другому клиенту.";
    throw error;
  }
  booking.client.telegramId = userId;
  booking.client.telegramChatId = userId;
  return `${confirmedText(cardOf(booking))}\n\nЭтот чат привязан к записи. Сюда придут отмена и перенос.`;
}

async function attachBarber(code: string, userId: string) {
  const key = `barber_link_${code}`;
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return "Код привязки недействителен. Он одноразовый.";
  const barber = await prisma.barber.findUnique({ where: { id: row.value } });
  if (!barber) {
    await prisma.setting.delete({ where: { key } });
    return "Барбер для этого кода не найден.";
  }
  await prisma.$transaction([
    prisma.barber.update({ where: { id: barber.id }, data: { telegramChatId: userId } }),
    prisma.setting.delete({ where: { key } }),
  ]);
  return `Вы привязаны как мастер ${barber.name}. Новые записи будут приходить в этот чат.`;
}

export async function createBarberLink(barberId: string) {
  if (!username) return { error: "NO_BOT" as const };
  const barber = await prisma.barber.findFirst({ where: { id: barberId, isActive: true } });
  if (!barber) return { error: "NOT_FOUND" as const };
  const code = randomBytes(9).toString("base64url");
  await prisma.setting.create({ data: { key: `barber_link_${code}`, value: barberId } });
  return { url: `https://t.me/${username}?start=m_${code}` };
}

if (bot) {
  bot.command("start", async (ctx) => {
    if (ctx.chat?.type !== "private" || !ctx.from) {
      await ctx.reply("Откройте бота в личном чате.");
      return;
    }
    const userId = String(ctx.from.id);
    const kind = startKind(typeof ctx.match === "string" ? ctx.match : "");
    if (kind.type === "book") {
      await ctx.reply(await attachBooking(kind.token, userId), { reply_markup: menuButton() });
      return;
    }
    if (kind.type === "barber") {
      await ctx.reply(await attachBarber(kind.code, userId));
      return;
    }
    const markup = menuButton();
    const text = markup
      ? "BRUT.\nНажмите «Запись», чтобы выбрать услугу и время."
      : "BRUT.\nБот на связи. Кнопка записи появится, когда в MINIAPP_URL будет адрес Mini App.";
    await ctx.reply(text, { reply_markup: markup });
  });
  bot.catch((error) => {
    console.error(`telegram: ${error.message}`);
  });
}

const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() ?? "";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
export const telegramWebhook = bot && webhookUrl
  ? webhookCallback(bot, "fastify", webhookSecret ? { secretToken: webhookSecret } : undefined)
  : null;

export async function openTelegram() {
  if (!bot) return "no-token" as const;
  const me = await bot.api.getMe();
  username = me.username;
  const mini = process.env.MINIAPP_URL?.trim();
  if (mini) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Запись", web_app: { url: mini } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "menu button failed";
      console.error(`telegram menu: ${message}`);
    }
  }
  await bot.api.setMyCommands([{ command: "start", description: "Запись" }]);
  const webhook = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  if (webhook) {
    await bot.api.setWebhook(webhook, webhookSecret ? { secret_token: webhookSecret } : undefined);
    return "webhook" as const;
  }
  await bot.api.deleteWebhook();
  process.once("SIGINT", () => {
    void bot.stop();
  });
  process.once("SIGTERM", () => {
    void bot.stop();
  });
  void bot.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "polling failed";
    console.error(`telegram polling: ${message}`);
  });
  return "polling" as const;
}
