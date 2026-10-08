import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram.js";

const token = "123456:TEST";

function signed(fields: Record<string, string>) {
  const dataCheck = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("initData", () => {
  it("принимает подпись и достаёт пользователя", () => {
    const initData = signed({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "AAE",
      user: JSON.stringify({ id: 42, first_name: "Иван" }),
    });
    expect(verifyInitData(initData, token).id).toBe(42);
  });

  it("отклоняет чужой hash и старую сессию", () => {
    expect(() => verifyInitData("auth_date=1&user=%7B%22id%22%3A1%7D&hash=dead", token)).toThrow(/не сошлась/);
    const stale = signed({
      auth_date: "1000",
      user: JSON.stringify({ id: 7, first_name: "Азиз" }),
    });
    expect(() => verifyInitData(stale, token)).toThrow(/устарела/);
  });
});
