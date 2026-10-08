"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminSend } from "../../../lib/admin-client";

type Booking = {
  id: string;
  manageToken: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  date: string;
  time: string;
  barberId: string;
  barberName: string;
  clientName: string;
  phone: string;
  services: string[];
  totalPrice: number;
};

type Service = { id: string; name: string; isActive: boolean };
type Barber = { id: string; name: string; isActive: boolean };
const statuses = ["confirmed", "completed", "cancelled", "no_show"] as const;
const statusLabel = { confirmed: "Подтверждена", completed: "Завершена", cancelled: "Отменена", no_show: "Не пришли" };
function bookingCountWord(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastDigit === 1 && lastTwoDigits !== 11) return "запись";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return "записи";
  return "записей";
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [move, setMove] = useState<Record<string, { date: string; time: string }>>({});

  async function load() {
    const [bookingBody, serviceBody, barberBody] = await Promise.all([
      adminSend("bookings") as Promise<{ bookings: Booking[] }>,
      adminSend("services") as Promise<{ services: Service[] }>,
      adminSend("barbers") as Promise<{ barbers: Barber[] }>,
    ]);
    setBookings(bookingBody.bookings);
    setServices(serviceBody.services.filter((item) => item.isActive));
    setBarbers(barberBody.barbers.filter((item) => item.isActive));
  }

  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await adminSend("bookings", { method: "POST", body: JSON.stringify({ serviceIds: picked, barberId, startsAt: `${date}T${time}:00+05:00`, client: { name, phone } }) });
      setName("");
      setPhone("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать");
    }
  }

  async function changeStatus(id: string, status: string) {
    setMessage("");
    try {
      await adminSend(`bookings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сменить статус");
    }
  }

  async function cancel(token: string) {
    setMessage("");
    try {
      await adminSend(`bookings/${token}/cancel`, { method: "POST" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отменить");
    }
  }

  async function reschedule(token: string) {
    const next = move[token];
    if (!next?.date || !next.time) return;
    setMessage("");
    try {
      await adminSend(`bookings/${token}/reschedule`, { method: "POST", body: JSON.stringify({ startsAt: `${next.date}T${next.time}:00+05:00` }) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось перенести");
    }
  }

  return (
    <main className="bookings-page">
      <div className="bookings-heading">
        <div>
          <p className="eyebrow">Записи / Управление</p>
          <h1>Кресла<span>.</span></h1>
        </div>
        <p className="bookings-count"><strong>{bookings.length.toString().padStart(2, "0")}</strong> {bookingCountWord(bookings.length)}</p>
      </div>

      {message && <p className="booking-error" role="alert">{message}</p>}

      <div className="bookings-workspace">
        <aside className="booking-create-panel">
          <div className="booking-panel-index"><span>01 / Новая запись</span><span>BRUT · TASHKENT</span></div>
          <form className="booking-form" onSubmit={create}>
            <fieldset className="booking-services">
              <legend>Услуги <span>до 3</span></legend>
              <div className="booking-service-options">
                {services.map((item) => (
                  <label className={`booking-service-option${picked.includes(item.id) ? " is-selected" : ""}`} key={item.id}>
                    <input type="checkbox" checked={picked.includes(item.id)} onChange={() => toggle(item.id)} />
                    <span className="booking-checkbox" aria-hidden="true">{picked.includes(item.id) ? "×" : "+"}</span>
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
              <p className="booking-service-count">Выбрано {picked.length} из 3</p>
            </fieldset>

            <label className="booking-field">Мастер
              <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
                <option value="">Выберите мастера</option>
                {barbers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <div className="booking-field-pair">
              <label className="booking-field">Дата<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="booking-field">Время<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
            </div>

            <label className="booking-field">Имя клиента<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="booking-field">Телефон<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <button className="booking-submit" type="submit"><span>Записать клиента</span><span aria-hidden="true">↗</span></button>
          </form>
          <p className="booking-panel-foot"><span>ВРЕМЯ УЗБЕКИСТАНА</span><span>UTC +05:00</span></p>
        </aside>

        <section className="booking-ledger" aria-labelledby="booking-ledger-title">
          <div className="booking-ledger-heading">
            <div>
              <p className="booking-overline">02 / Журнал</p>
              <h2 id="booking-ledger-title">Все записи</h2>
            </div>
            <span>{bookings.length} {bookingCountWord(bookings.length).toLocaleUpperCase("ru-RU")}</span>
          </div>

          {bookings.length === 0 ? (
            <div className="booking-empty"><span>Пока тихо</span><p>Создайте первую запись в форме слева.</p></div>
          ) : (
            <div className="booking-list">
              {bookings.map((item, index) => (
                <article className="booking-entry" key={item.id}>
                  <div className="booking-entry-main">
                    <span className="booking-entry-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="booking-entry-person">
                      <p className="booking-entry-date">{item.date}<span>{item.time}</span></p>
                      <h3>{item.clientName}</h3>
                      <a href={`tel:${item.phone}`}>{item.phone}</a>
                    </div>
                    <p className="booking-entry-price">{new Intl.NumberFormat("ru-RU").format(item.totalPrice)} <span>сум</span></p>
                  </div>

                  <div className="booking-entry-details">
                    <p>{item.services.join(" · ")}</p>
                    <span>Мастер — {item.barberName}</span>
                  </div>

                  <div className="booking-entry-controls">
                    <label className="booking-status-field">Статус
                      <select data-status={item.status} value={item.status} onChange={(event) => void changeStatus(item.id, event.target.value)}>
                        {statuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
                      </select>
                    </label>
                    {item.status === "confirmed" && (
                      <div className="booking-actions">
                        <button className="booking-cancel" type="button" onClick={() => void cancel(item.manageToken)}>Отменить запись</button>
                        <label className="booking-move-field"><span className="visually-hidden">Новая дата</span><input aria-label="Новая дата" type="date" value={move[item.manageToken]?.date ?? item.date} onChange={(event) => setMove((current) => ({ ...current, [item.manageToken]: { date: event.target.value, time: current[item.manageToken]?.time ?? item.time } }))} /></label>
                        <label className="booking-move-field"><span className="visually-hidden">Новое время</span><input aria-label="Новое время" type="time" value={move[item.manageToken]?.time ?? item.time} onChange={(event) => setMove((current) => ({ ...current, [item.manageToken]: { date: current[item.manageToken]?.date ?? item.date, time: event.target.value } }))} /></label>
                        <button className="booking-reschedule" type="button" onClick={() => void reschedule(item.manageToken)}>Перенести <span aria-hidden="true">↗</span></button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
