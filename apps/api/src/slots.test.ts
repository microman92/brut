import { describe, expect, it } from "vitest";
import { canChange, collectSlots, zoned } from "./slots";

const date = "2026-10-06";

describe("слоты", () => {
  it("не ставит старт, если услуга вылезает за конец смены", () => {
    const slots = collectSlots({
      date,
      durationMin: 45,
      stepMin: 15,
      earliest: 0,
      work: [{ start: "10:00", end: "13:00" }],
      breaks: [],
      blocks: [],
    });
    expect(slots[0]).toBe("10:00");
    expect(slots).toContain("12:15");
    expect(slots).not.toContain("12:30");
  });

  it("вырезает обед", () => {
    const slots = collectSlots({
      date,
      durationMin: 45,
      stepMin: 15,
      earliest: 0,
      work: [{ start: "10:00", end: "16:00" }],
      breaks: [{ start: "13:00", end: "14:00" }],
      blocks: [],
    });
    expect(slots).toContain("12:15");
    expect(slots).not.toContain("12:30");
    expect(slots).not.toContain("13:00");
    expect(slots).toContain("14:00");
  });

  it("вырезает занятый интервал и выходной", () => {
    const slots = collectSlots({
      date,
      durationMin: 30,
      stepMin: 15,
      earliest: 0,
      work: [{ start: "10:00", end: "18:00" }],
      breaks: [],
      blocks: [{ start: zoned(date, "15:00"), end: zoned(date, "16:00") }],
    });
    expect(slots).toContain("14:30");
    expect(slots).not.toContain("14:45");
    expect(slots).not.toContain("15:00");
    expect(slots).toContain("16:00");
  });

  it("для длинной услуги оставляет меньше стартов", () => {
    const short = collectSlots({
      date,
      durationMin: 30,
      stepMin: 30,
      earliest: 0,
      work: [{ start: "10:00", end: "12:00" }],
      breaks: [],
      blocks: [],
    });
    const long = collectSlots({
      date,
      durationMin: 90,
      stepMin: 30,
      earliest: 0,
      work: [{ start: "10:00", end: "12:00" }],
      breaks: [],
      blocks: [],
    });
    expect(short).toEqual(["10:00", "10:30", "11:00", "11:30"]);
    expect(long).toEqual(["10:00", "10:30"]);
  });

  it("прячет слоты раньше min_notice", () => {
    const slots = collectSlots({
      date,
      durationMin: 30,
      stepMin: 30,
      earliest: zoned(date, "11:00"),
      work: [{ start: "10:00", end: "12:00" }],
      breaks: [],
      blocks: [],
    });
    expect(slots).toEqual(["11:00", "11:30"]);
  });

  it("без смены слотов нет", () => {
    expect(collectSlots({
      date,
      durationMin: 30,
      stepMin: 15,
      earliest: 0,
      work: [],
      breaks: [],
      blocks: [],
    })).toEqual([]);
  });
});

describe("отмена", () => {
  it("режет перенос и отмену внутри cutoff", () => {
    const start = Date.parse("2026-10-06T06:00:00.000Z");
    expect(canChange(start, start - 30 * 60_000, 30)).toBe(true);
    expect(canChange(start, start - 29 * 60_000, 30)).toBe(false);
  });
});
