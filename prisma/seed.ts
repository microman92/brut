import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const services = [
  { name: "Мужская стрижка", description: "Форма и укладка", durationMin: 45, price: 150000, sortOrder: 1 },
  { name: "Стрижка + борода", description: "Цельный образ и точный контур", durationMin: 75, price: 220000, sortOrder: 2 },
  { name: "Оформление бороды", description: "Форма, уход, горячее полотенце", durationMin: 30, price: 100000, sortOrder: 3 },
  { name: "Отец и сын", description: "Два кресла, одно хорошее время", durationMin: 90, price: 250000, sortOrder: 4 },
  { name: "Камуфляж седины", description: "Естественный оттенок без резких границ", durationMin: 30, price: 120000, sortOrder: 5 },
];

const barbers = [
  {
    name: "Азиз Каримов",
    photoUrl: "/images/barbers.png",
    experienceYears: 9,
    sortOrder: 1,
    bio: "Девять лет держит классику: спокойная длина сверху, чистый висок, линия, которая не расползается к пятнице. До машинки спрашивает, как вы причёсываетесь утром и сколько времени на это есть.",
    serviceNames: ["Мужская стрижка", "Стрижка + борода"],
  },
  {
    name: "Тимур Юлдашев",
    photoUrl: "/images/barbers.png",
    experienceYears: 6,
    sortOrder: 2,
    bio: "Шесть лет делает fade: переход без полосы, верх с направлением, а не с лаком. Если волосы тонкие или пушатся, сначала показывает длину на сухих, потом уже снимает.",
    serviceNames: ["Мужская стрижка", "Камуфляж седины"],
  },
  {
    name: "Бехзод Рахимов",
    photoUrl: "/images/barbers.png",
    experienceYears: 11,
    sortOrder: 3,
    bio: "Одиннадцать лет сводит стрижку и бороду в одну линию. Щека, шея и бакенбард садятся по вашей форме, а не по картинке из ленты. Горячее полотенце и контур входят в услугу.",
    serviceNames: ["Стрижка + борода", "Оформление бороды"],
  },
  {
    name: "Санжар Алиев",
    photoUrl: "/images/barbers-b.png",
    experienceYears: 7,
    sortOrder: 4,
    bio: "Семь лет стрижёт тех, кому нужна форма на каждый день: офис, встреча, обычное утро. Пробор не обязателен. Длина остаётся такой, чтобы через три недели стрижка всё ещё читалась.",
    serviceNames: ["Мужская стрижка", "Отец и сын"],
  },
  {
    name: "Даниил Ким",
    photoUrl: "/images/barbers-b.png",
    experienceYears: 5,
    sortOrder: 5,
    bio: "Пять лет делает skin fade. Низ до кожи, выше плотность возвращается ровно, без пятен у виска. Если кожа чувствительная, говорит об этом до работы и меняет насадку.",
    serviceNames: ["Мужская стрижка", "Стрижка + борода"],
  },
  {
    name: "Рустам Назаров",
    photoUrl: "/images/barbers-b.png",
    experienceYears: 8,
    sortOrder: 6,
    bio: "Восемь лет заканчивает стрижку укладкой, а не фотографией. Берёт ваш обычный воск или глину и показывает два движения, которыми это повторяется. Если средства нет, подбирает одно и на этом останавливается.",
    serviceNames: ["Мужская стрижка", "Камуфляж седины"],
  },
];

const settings = [
  { key: "cancel_cutoff_min", value: "30" },
  { key: "slot_step_min", value: "15" },
  { key: "booking_horizon_days", value: "30" },
  { key: "min_notice_min", value: "30" },
  { key: "reminder_day_minutes", value: "1440" },
  { key: "reminder_short_minutes", value: "30" },
  { key: "review_delay_min", value: "60" },
  { key: "timezone", value: "Asia/Tashkent" },
  { key: "review_public_min_rating", value: "4" },
];

function clock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

const week = [0, 1, 2, 3, 4, 5, 6];

async function main() {
  const existing = await prisma.service.count();
  if (existing > 0) {
    console.log("В базе уже есть услуги, seed пропущен.");
    return;
  }

  const createdServices = await prisma.service.createManyAndReturn({ data: services });
  const serviceId = new Map(createdServices.map((item) => [item.name, item.id]));

  for (const barber of barbers) {
    await prisma.barber.create({
      data: {
        name: barber.name,
        photoUrl: barber.photoUrl,
        bio: barber.bio,
        experienceYears: barber.experienceYears,
        sortOrder: barber.sortOrder,
        services: {
          create: barber.serviceNames.map((name) => {
            const serviceIdValue = serviceId.get(name);
            if (!serviceIdValue) throw new Error(`Нет услуги «${name}»`);
            return { serviceId: serviceIdValue, isEnabled: true };
          }),
        },
        workingHours: {
          create: week.map((weekday) => ({
            weekday,
            startTime: clock("10:00"),
            endTime: clock("22:00"),
          })),
        },
        breaks: {
          create: week.map((weekday) => ({
            weekday,
            startTime: clock("13:00"),
            endTime: clock("14:00"),
          })),
        },
      },
    });
  }

  await prisma.setting.createMany({ data: settings });
  console.log(`Seed: ${services.length} услуг, ${barbers.length} барберов, график 10:00–22:00, обед 13:00–14:00.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
