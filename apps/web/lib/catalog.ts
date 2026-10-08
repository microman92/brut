export type ServiceCard = {
  id: string;
  number: string;
  name: string;
  description: string;
  duration: string;
  price: string;
};

export type BarberCard = {
  id: string;
  name: string;
  role: string;
  experience: string;
  fact: string;
  bio: string;
  image: string;
  panel: number;
  sortOrder: number;
  services: { name: string; time: string; price: string }[];
};

type ApiService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  sortOrder: number;
};

type ApiBarber = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  sortOrder: number;
  services: ApiService[];
};

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
export const browserApi = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function money(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function years(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} года`;
  return `${value} лет`;
}

function serviceCard(item: ApiService): ServiceCard {
  return {
    id: item.id,
    number: String(item.sortOrder).padStart(2, "0"),
    name: item.name,
    description: item.description,
    duration: `${item.durationMin} мин`,
    price: money(item.price),
  };
}

function barberCard(item: ApiBarber): BarberCard {
  const services = item.services.map((service) => ({
    name: service.name,
    time: `${service.durationMin} мин`,
    price: money(service.price),
  }));
  const dot = item.bio.indexOf(". ");
  return {
    id: item.id,
    name: item.name,
    role: item.services[0]?.name ?? "Мастер",
    experience: years(item.experienceYears),
    fact: dot === -1 ? item.bio : item.bio.slice(0, dot + 1),
    bio: item.bio,
    image: item.photoUrl ?? "",
    panel: (item.sortOrder - 1) % 3,
    sortOrder: item.sortOrder,
    services,
  };
}

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store" });
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${response.status} ${path}`);
  return response.json() as Promise<T>;
}

export async function loadCatalog(): Promise<{ services: ServiceCard[]; barbers: BarberCard[]; error: string | null }> {
  try {
    const [services, barbers] = await Promise.all([
      getJson<ApiService[]>("/api/v1/services"),
      getJson<ApiBarber[]>("/api/v1/barbers"),
    ]);
    return {
      services: (services ?? []).map(serviceCard),
      barbers: (barbers ?? []).map(barberCard),
      error: null,
    };
  } catch {
    return { services: [], barbers: [], error: "Список сейчас недоступен. Запустите API: npm run dev:api" };
  }
}

export async function loadBarber(id: string): Promise<BarberCard | null> {
  const barber = await getJson<ApiBarber>(`/api/v1/barbers/${id}`);
  return barber ? barberCard(barber) : null;
}
