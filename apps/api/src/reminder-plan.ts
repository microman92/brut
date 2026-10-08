export type ReminderSettings = {
  dayMinutes: number;
  shortMinutes: number;
  reviewDelayMin: number;
};

export type ReminderBooking = {
  now: number;
  startsAt: number;
  endsAt: number;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  daySent: boolean;
  shortSent: boolean;
  reviewSent: boolean;
  settings: ReminderSettings;
};

export type ReminderAction = "complete" | "day" | "short" | "review";

export function dueActions(input: ReminderBooking): ReminderAction[] {
  const actions: ReminderAction[] = [];
  const untilStart = input.startsAt - input.now;
  const stillAhead = input.status === "confirmed" && untilStart > 0;
  if (stillAhead && !input.daySent && untilStart <= input.settings.dayMinutes * 60_000 && untilStart > input.settings.shortMinutes * 60_000) {
    actions.push("day");
  }
  if (stillAhead && !input.shortSent && untilStart <= input.settings.shortMinutes * 60_000) {
    actions.push("short");
  }
  const ended = input.status === "confirmed" && input.endsAt <= input.now;
  if (ended) actions.push("complete");
  const finished = input.status === "completed" || ended;
  const reviewAt = input.endsAt + input.settings.reviewDelayMin * 60_000;
  if (finished && !input.reviewSent && input.now >= reviewAt) actions.push("review");
  return actions;
}
