export const TASHKENT_OFFSET_MIN = 5 * 60;

export type Interval = { start: number; end: number };

export function zoned(isoDate: string, time: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - TASHKENT_OFFSET_MIN * 60_000;
}

export function formatTashkent(ms: number) {
  const shifted = new Date(ms + TASHKENT_OFFSET_MIN * 60_000);
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function tashkentDate(ms: number) {
  const shifted = new Date(ms + TASHKENT_OFFSET_MIN * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

export function weekday(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function canChange(startsAtMs: number, nowMs: number, cutoffMin: number) {
  return startsAtMs - nowMs >= cutoffMin * 60_000;
}

export function subtractInterval(open: Interval[], block: Interval) {
  const next: Interval[] = [];
  for (const item of open) {
    if (block.end <= item.start || block.start >= item.end) {
      next.push(item);
      continue;
    }
    if (block.start > item.start) next.push({ start: item.start, end: block.start });
    if (block.end < item.end) next.push({ start: block.end, end: item.end });
  }
  return next;
}

export function collectSlots(input: {
  date: string;
  durationMin: number;
  stepMin: number;
  earliest: number;
  work: { start: string; end: string }[];
  breaks: { start: string; end: string }[];
  blocks: Interval[];
}) {
  let open: Interval[] = input.work.map((item) => ({
    start: zoned(input.date, item.start),
    end: zoned(input.date, item.end),
  }));
  for (const item of input.breaks) {
    open = subtractInterval(open, { start: zoned(input.date, item.start), end: zoned(input.date, item.end) });
  }
  for (const block of input.blocks) open = subtractInterval(open, block);
  if (open.length === 0 || input.work.length === 0) return [];

  const gridStart = Math.min(...input.work.map((item) => zoned(input.date, item.start)));
  const gridEnd = Math.max(...open.map((item) => item.end));
  const step = input.stepMin * 60_000;
  const duration = input.durationMin * 60_000;
  const result: string[] = [];
  for (let time = gridStart; time + duration <= gridEnd; time += step) {
    if (time < input.earliest) continue;
    const end = time + duration;
    if (open.some((item) => time >= item.start && end <= item.end)) result.push(formatTashkent(time));
  }
  return result;
}
