import { describe, expect, it } from "vitest";
import { barberBookedText, confirmedText, movedText, startKind, whenLabel } from "./messages.js";

const card = {
  services: "Стрижка",
  barberName: "Азиз",
  clientName: "Иван",
  when: "5 октября, 11:00",
  price: "150 000",
};

describe("start payload", () => {
  it("отличает запись, барбера и пустой /start", () => {
    expect(startKind("b_abc")).toEqual({ type: "book", token: "abc" });
    expect(startKind("m_code")).toEqual({ type: "barber", code: "code" });
    expect(startKind("")).toEqual({ type: "menu" });
  });
});

describe("тексты", () => {
  it("собирает дату по Ташкенту и карточку записи", () => {
    expect(whenLabel("2026-10-05", "11:00")).toBe("5 октября, 11:00");
    expect(confirmedText(card)).toContain("Мастер: Азиз");
    expect(movedText(card, "4 октября, 10:00")).toContain("Было: 4 октября, 10:00");
    expect(barberBookedText(card)).toContain("Клиент: Иван");
  });
});
