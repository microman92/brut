const WINDOW_MS = 15 * 60_000;
const LIMIT = 8;
const attempts = new Map<string, { count: number; since: number }>();

export function assertLoginAllowed(login: string, now = Date.now()) {
  const row = attempts.get(login);
  if (!row || now - row.since > WINDOW_MS) return;
  if (row.count >= LIMIT) {
    const error = new Error("Слишком много попыток. Подождите 15 минут.");
    Object.assign(error, { statusCode: 429, code: "RATE_LIMIT" });
    throw error;
  }
}

export function noteLoginFailure(login: string, now = Date.now()) {
  const row = attempts.get(login);
  if (!row || now - row.since > WINDOW_MS) {
    attempts.set(login, { count: 1, since: now });
    return;
  }
  row.count += 1;
}

export function clearLoginFailures(login: string) {
  attempts.delete(login);
}
