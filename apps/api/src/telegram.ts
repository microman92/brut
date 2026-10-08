import { createHmac, timingSafeEqual } from "node:crypto";

export class TelegramAuthError extends Error {
  statusCode = 401;
  code = "UNAUTHORIZED";
}

export type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };

export function verifyInitData(initData: string, botToken: string, now = Date.now(), maxAgeSec = 86_400): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new TelegramAuthError("Нет подписи Telegram");
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const actual = Buffer.from(hash);
  const expected = Buffer.from(computed);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new TelegramAuthError("Подпись Telegram не сошлась");
  }
  const authDate = Number(params.get("auth_date"));
  if (!authDate || now / 1000 - authDate > maxAgeSec) throw new TelegramAuthError("Сессия Telegram устарела");
  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramAuthError("В initData нет пользователя");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!user.id) throw new TelegramAuthError("В initData нет пользователя");
  return user;
}

export function readInitData(header: string | undefined) {
  if (!header?.toLowerCase().startsWith("tma ")) return null;
  return header.slice(4);
}
