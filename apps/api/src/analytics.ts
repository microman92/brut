import { prisma } from "./db.js";
import { addDays, type Interval, subtractInterval, tashkentDate, weekday, zoned } from "./slots.js";

type Period = { from: string; to: string };

function clock(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function mergeIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.start > last.end) merged.push({ ...interval });
    else last.end = Math.max(last.end, interval.end);
  }
  return merged;
}

function availableMinutes(input: {
  barber: {
    id: string;
    workingHours: { weekday: number; startTime: Date; endTime: Date }[];
    breaks: { weekday: number; startTime: Date; endTime: Date }[];
  };
  timeOff: { barberId: string | null; startsAt: Date; endsAt: Date }[];
  from: string;
  to: string;
}) {
  let total = 0;
  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const day = weekday(date);
    let open = mergeIntervals(input.barber.workingHours
      .filter((item) => item.weekday === day)
      .map((item) => ({ start: zoned(date, clock(item.startTime)), end: zoned(date, clock(item.endTime)) })));

    for (const item of input.barber.breaks.filter((row) => row.weekday === day)) {
      open = subtractInterval(open, { start: zoned(date, clock(item.startTime)), end: zoned(date, clock(item.endTime)) });
    }
    for (const item of input.timeOff) {
      if (item.barberId === null || item.barberId === input.barber.id) {
        open = subtractInterval(open, { start: item.startsAt.getTime(), end: item.endsAt.getTime() });
      }
    }
    total += open.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  }
  return Math.round(total / 60_000);
}

export async function getAnalytics(period: Period) {
  const startsAt = new Date(zoned(period.from, "00:00"));
  const endsAt = new Date(zoned(addDays(period.to, 1), "00:00"));
  const barbers = await prisma.barber.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      workingHours: { select: { weekday: true, startTime: true, endTime: true } },
      breaks: { select: { weekday: true, startTime: true, endTime: true } },
    },
  });

  const [bookings, timeOff, clientHistory] = await Promise.all([
    prisma.booking.findMany({
      where: { startsAt: { gte: startsAt, lt: endsAt } },
      select: {
        status: true,
        clientId: true,
        barberId: true,
        startsAt: true,
        totalPrice: true,
        totalDurationMin: true,
        services: { select: { name: true } },
      },
    }),
    barbers.length ? prisma.timeOff.findMany({
      where: {
        OR: [{ barberId: null }, { barberId: { in: barbers.map((barber) => barber.id) } }],
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { barberId: true, startsAt: true, endsAt: true },
    }) : Promise.resolve([]),
    prisma.booking.groupBy({
      by: ["clientId"],
      where: { status: "completed", startsAt: { lt: endsAt } },
      _count: { _all: true },
    }),
  ]);

  const completed = bookings.filter((booking) => booking.status === "completed");
  const completedClientIds = new Set(completed.map((booking) => booking.clientId));
  const returningClients = clientHistory.filter((row) => completedClientIds.has(row.clientId) && row._count._all > 1).length;
  const serviceCounts = new Map<string, number>();
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const barberBookings = new Map<string, number>();

  for (const booking of bookings) {
    if (booking.status !== "cancelled") {
      for (const service of booking.services) serviceCounts.set(service.name, (serviceCounts.get(service.name) ?? 0) + 1);
      const date = tashkentDate(booking.startsAt.getTime());
      const hour = new Date(booking.startsAt.getTime() + 5 * 60 * 60_000).getUTCHours();
      heatmap[weekday(date)][hour] += 1;
    }
    if (booking.status === "completed" || booking.status === "confirmed") {
      barberBookings.set(booking.barberId, (barberBookings.get(booking.barberId) ?? 0) + booking.totalDurationMin);
    }
  }

  const completedClients = completedClientIds.size;
  const services = [...serviceCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));

  const barberLoad = barbers.map((barber) => {
    const bookedMinutes = barberBookings.get(barber.id) ?? 0;
    const capacityMinutes = availableMinutes({ barber, timeOff, from: period.from, to: period.to });
    return {
      id: barber.id,
      name: barber.name,
      bookedMinutes,
      capacityMinutes,
      loadPercent: capacityMinutes ? Math.round(bookedMinutes / capacityMinutes * 100) : null,
    };
  }).sort((a, b) => (b.loadPercent ?? -1) - (a.loadPercent ?? -1));

  const weekdayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const cancelled = bookings.filter((booking) => booking.status === "cancelled").length;
  const noShows = bookings.filter((booking) => booking.status === "no_show").length;

  return {
    period,
    summary: {
      revenue: completed.reduce((sum, booking) => sum + booking.totalPrice, 0),
      bookings: bookings.length,
      completed: completed.length,
      cancelled,
      noShows,
      returningClients,
      completedClients,
      returnRate: completedClients ? Math.round(returningClients / completedClients * 1000) / 10 : 0,
    },
    services,
    barbers: barberLoad,
    heatmap: heatmap.map((counts, day) => ({ weekday: day, label: weekdayNames[day], counts })),
    hours: Array.from({ length: 24 }, (_, hour) => hour),
  };
}
