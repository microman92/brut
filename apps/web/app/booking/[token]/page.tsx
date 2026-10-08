import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BookingManage from "../../../components/booking-manage";

export const metadata: Metadata = { title: "Запись — BRUT" };

type Booking = {
  manageToken: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  date: string;
  time: string;
  barberId: string;
  barberName: string;
  serviceIds: string[];
  services: { name: string; durationMin: number; price: number }[];
  totalPrice: number;
  totalDurationMin: number;
  clientName: string;
  canChange: boolean;
  telegramUrl?: string | null;
};

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/v1/bookings/${token}`, { cache: "no-store" });
  } catch {
    return <main className="book-page"><p>Запись сейчас недоступна. Запустите API: npm run dev:api</p></main>;
  }
  if (response.status === 404) notFound();
  if (!response.ok) return <main className="book-page"><p>Запись сейчас недоступна. Запустите API: npm run dev:api</p></main>;
  const booking = await response.json() as Booking;
  return <BookingManage booking={booking} />;
}
