import { afterAll, describe, expect, it } from "vitest";
import { ApiError, createBooking } from "./booking.js";
import { prisma } from "./db.js";
import { addDays, tashkentDate, zoned } from "./slots.js";

describe("гонка на один слот", () => {
  let serviceId = "";
  let barberId = "";
  const phone = `99890${Date.now().toString().slice(-7)}`;

  afterAll(async () => {
    if (barberId) {
      await prisma.booking.deleteMany({ where: { barberId } });
      await prisma.workingHour.deleteMany({ where: { barberId } });
      await prisma.barberService.deleteMany({ where: { barberId } });
      await prisma.barber.delete({ where: { id: barberId } }).catch(() => undefined);
    }
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } }).catch(() => undefined);
    await prisma.client.deleteMany({ where: { phone } });
    await prisma.$disconnect();
  });

  it("пускает одну запись и отвечает 409 второй", async () => {
    const service = await prisma.service.create({
      data: { name: "Race cut", description: "test", durationMin: 45, price: 1000, sortOrder: 99 },
    });
    serviceId = service.id;
    const barber = await prisma.barber.create({
      data: {
        name: "Race Barber",
        bio: "test",
        experienceYears: 1,
        sortOrder: 99,
        services: { create: { serviceId: service.id, isEnabled: true } },
        workingHours: {
          create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            startTime: new Date(Date.UTC(1970, 0, 1, 10, 0, 0)),
            endTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
          })),
        },
      },
    });
    barberId = barber.id;
    const date = addDays(tashkentDate(Date.now()), 3);
    const startsAt = new Date(zoned(date, "10:00"));
    const input = {
      serviceIds: [service.id],
      barberId: barber.id,
      startsAt,
      client: { name: "Race Guest", phone },
    };
    const results = await Promise.allSettled([createBooking(input), createBooking(input)]);
    const ok = results.filter((item) => item.status === "fulfilled");
    const taken = results.filter((item) => item.status === "rejected" && item.reason instanceof ApiError && item.reason.code === "SLOT_TAKEN");
    expect(ok).toHaveLength(1);
    expect(taken).toHaveLength(1);
  });
});
