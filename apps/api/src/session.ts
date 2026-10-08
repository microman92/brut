import { createHmac, timingSafeEqual } from "node:crypto";

const TWO_WEEKS = 14 * 86_400;

export function signSession(adminId: string, secret: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TWO_WEEKS;
  const body = `${adminId}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string, secret: string, now = Date.now()) {
  const [adminId, expRaw, sig] = token.split(".");
  if (!adminId || !expRaw || !sig || token.split(".").length !== 3) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  const expected = createHmac("sha256", secret).update(`${adminId}.${expRaw}`).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return adminId;
}
