"use client";

import { useState } from "react";
import SiteHeader from "./site-header";
import { browserApi } from "../lib/catalog";

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

const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const statusLabel = { confirmed: "Подтверждена", completed: "Завершена", cancelled: "Отменена", no_show: "Не пришли" };

function money(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function labelDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getDate()} ${months[date.getMonth()]}, ${weekdays[date.getDay()]}`;
}

export default function BookingManage({ booking }: { booking: Booking }) {
  const [current, setCurrent] = useState(booking);
  const [mode, setMode] = useState<"view" | "move">("view");
  const [days, setDays] = useState<{ date: string; open: boolean }[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function loadDays() {
    setMessage("");
    setPending(true);
    try {
      const params = new URLSearchParams({ serviceIds: current.serviceIds.join(","), barberId: current.barberId });
      const response = await fetch(`${browserApi}/api/v1/availability/days?${params}`);
      if (!response.ok) throw new Error();
      const body = await response.json() as { days: { date: string; open: boolean }[] };
      setDays(body.days);
      setMode("move");
    } catch {
      setMessage("Не удалось загрузить дни.");
    } finally {
      setPending(false);
    }
  }

  async function loadSlots(nextDate: string) {
    setDate(nextDate);
    setTime(null);
    setSlots([]);
    const params = new URLSearchParams({ serviceIds: current.serviceIds.join(","), barberId: current.barberId, date: nextDate });
    const response = await fetch(`${browserApi}/api/v1/availability?${params}`);
    if (!response.ok) {
      setMessage("Не удалось загрузить время.");
      return;
    }
    const body = await response.json() as { slots: string[] };
    setSlots(body.slots);
    setMessage(body.slots.length ? "" : "В этот день свободных окон нет.");
  }

  async function cancel() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${browserApi}/api/v1/bookings/${current.manageToken}/cancel`, { method: "POST" });
      const body = await response.json() as Booking & { error?: { message?: string } };
      if (!response.ok) {
        setMessage(body.error?.message ?? "Не удалось отменить.");
        return;
      }
      setCurrent(body);
      setMode("view");
    } catch {
      setMessage("Не удалось отменить.");
    } finally {
      setPending(false);
    }
  }

  async function move() {
    if (!date || !time) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${browserApi}/api/v1/bookings/${current.manageToken}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt: `${date}T${time}:00+05:00` }),
      });
      const body = await response.json() as Booking & { error?: { message?: string; code?: string } };
      if (!response.ok) {
        setMessage(body.error?.code === "SLOT_TAKEN" ? "Это время уже занято." : body.error?.message ?? "Не удалось перенести.");
        return;
      }
      setCurrent(body);
      setMode("view");
      setMessage("Запись перенесена.");
    } catch {
      setMessage("Не удалось перенести.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="book-page book-manage">
        <section>
          <p className="eyebrow">Запись · {statusLabel[current.status]}</p>
          <h1>{current.clientName}</h1>
          <p className="master-bio">{labelDate(current.date)} в {current.time}. {current.services.map((item) => item.name).join(", ")}. {current.barberName}. {current.totalDurationMin} мин, {money(current.totalPrice)} сум.</p>
          {current.telegramUrl && <a className="underlink" href={current.telegramUrl} target="_blank" rel="noreferrer">Получить сообщения в Telegram <span>↗</span></a>}
          {current.canChange && mode === "view" && (
            <div className="book-nav">
              <button type="button" disabled={pending} onClick={cancel}>Отменить</button>
              <button className="button button-light" type="button" disabled={pending} onClick={loadDays}>ПЕРЕНЕСТИ <span>↗</span></button>
            </div>
          )}
          {mode === "move" && (
            <>
              <div className="day-row">
                {days.map((item) => {
                  const parsed = new Date(`${item.date}T12:00:00`);
                  return (
                    <button className={item.date === date ? "day is-on" : item.open ? "day" : "day is-closed"} type="button" key={item.date} onClick={() => loadSlots(item.date)}>
                      <small>{weekdays[parsed.getDay()]}</small>
                      <b>{parsed.getDate()}</b>
                      <small>{months[parsed.getMonth()]}</small>
                    </button>
                  );
                })}
              </div>
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button className={slot === time ? "slot is-on" : "slot"} type="button" key={slot} onClick={() => setTime(slot)}>{slot}</button>
                ))}
              </div>
              <div className="book-nav">
                <button type="button" onClick={() => setMode("view")}>Назад</button>
                <button className="button button-light" type="button" disabled={!time || pending} onClick={move}>СОХРАНИТЬ <span>↗</span></button>
              </div>
            </>
          )}
          {message && <p className="book-error">{message}</p>}
        </section>
      </main>
    </>
  );
}
