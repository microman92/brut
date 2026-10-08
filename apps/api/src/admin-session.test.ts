import { describe, expect, it } from "vitest";
import { assertLoginAllowed, clearLoginFailures, noteLoginFailure } from "./login-limit.js";
import { readSession, signSession } from "./session.js";

describe("сессия админа", () => {
  it("принимает свою подпись и отвергает чужую", () => {
    const token = signSession("admin-1", "secret", 1_000);
    expect(readSession(token, "secret", 1_000)).toBe("admin-1");
    expect(readSession(token, "other", 1_000)).toBeNull();
    expect(readSession(token, "secret", 1_000 + 15 * 86_400_000)).toBeNull();
  });
});

describe("лимит входа", () => {
  it("после восьми ошибок блокирует логин", () => {
    const login = `limit-${Date.now()}`;
    for (let index = 0; index < 8; index += 1) noteLoginFailure(login, 5_000);
    expect(() => assertLoginAllowed(login, 5_000)).toThrow(/15 минут/);
    clearLoginFailures(login);
    expect(() => assertLoginAllowed(login, 5_000)).not.toThrow();
  });
});
