"use client";

import { useEffect, useRef, useState } from "react";
import SiteHeader from "./site-header";
import { browserApi, type BarberCard, type ServiceCard } from "../lib/catalog";

const steps = ["Услуга", "Мастер", "Дата", "Время", "Контакты"];
const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function labelDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getDate()} ${months[date.getMonth()]}, ${weekdays[date.getDay()]}`;
}

function amount(price: string) {
  return Number(price.replace(/\D/g, ""));
}

function minutes(duration: string) {
  return Number(duration.match(/\d+/)?.[0] ?? 0);
}

function money(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function durationLabel(total: number) {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} мин`;
  if (!rest) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

export default function BookFlow({ services, barbers }: { services: ServiceCard[]; barbers: BarberCard[] }) {
  const [step, setStep] = useState(0);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotStatus, setSlotStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [days, setDays] = useState<{ date: string; open: boolean }[]>([]);
  const [dayStatus, setDayStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState("");
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [bookedBarber, setBookedBarber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [blockedId, setBlockedId] = useState<string | null>(null);
  const request = useRef(0);

  const picked = serviceIds.flatMap((id) => {
    const item = services.find((service) => service.id === id);
    return item ? [item] : [];
  });
  const totalMinutes = picked.reduce((sum, item) => sum + minutes(item.duration), 0);
  const totalPrice = picked.reduce((sum, item) => sum + amount(item.price), 0);
  const barber = barbers.find((item) => item.id === barberId);
  const phoneDigits = phone.replace(/\D/g, "");
  const ready = [
    picked.length > 0,
    Boolean(barberId),
    Boolean(date),
    Boolean(time),
    name.trim().length > 1 && phoneDigits.length >= 9,
  ];

  const serviceKey = serviceIds.join(",");

  useEffect(() => {
    if (step !== 2 || !barberId || !serviceKey) return;
    const current = ++request.current;
    setDayStatus("loading");
    const params = new URLSearchParams({ serviceIds: serviceKey, barberId });
    fetch(`${browserApi}/api/v1/availability/days?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ days: { date: string; open: boolean }[] }>;
      })
      .then((body) => {
        if (current !== request.current) return;
        setDays(body.days);
        setDayStatus("ready");
      })
      .catch(() => {
        if (current === request.current) setDayStatus("error");
      });
  }, [step, barberId, serviceKey, attempt]);

  useEffect(() => {
    if (step !== 3 || !date || !barberId || !serviceKey) return;
    const current = ++request.current;
    setSlotStatus("loading");
    const params = new URLSearchParams({ serviceIds: serviceKey, barberId, date });
    fetch(`${browserApi}/api/v1/availability?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ slots: string[] }>;
      })
      .then((body) => {
        if (current !== request.current) return;
        setSlots(body.slots);
        setTime((currentTime) => (currentTime && body.slots.includes(currentTime) ? currentTime : null));
        setSlotStatus(body.slots.length ? "ready" : "empty");
      })
      .catch(() => {
        if (current === request.current) setSlotStatus("error");
      });
  }, [step, date, barberId, serviceKey, attempt]);

  function resetSchedule() {
    setDate(null);
    setTime(null);
    setSlots([]);
    setSlotStatus("idle");
  }

  function toggleService(id: string) {
    resetSchedule();
    if (serviceIds.includes(id)) {
      setServiceIds(serviceIds.filter((item) => item !== id));
      return;
    }
    if (serviceIds.length >= 3) {
      setBlockedId(null);
      requestAnimationFrame(() => setBlockedId(id));
      return;
    }
    setServiceIds([...serviceIds, id]);
  }

  function pickDate(value: string) {
    setDate(value);
    setTime(null);
    setSlotStatus("idle");
  }

  async function submit() {
    if (!ready[4] || !date || !time || !barberId) {
      setFormError("Введите имя и телефон, минимум 9 цифр.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${browserApi}/api/v1/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceIds,
          barberId,
          startsAt: `${date}T${time}:00+05:00`,
          client: { name: name.trim(), phone: phone.trim() },
        }),
      });
      const body = await response.json() as { error?: { code?: string; message?: string }; manageToken?: string; barberName?: string; telegramUrl?: string | null };
      if (response.status === 409 || body.error?.code === "SLOT_TAKEN") {
        setFormError("Это время уже занято. Вернитесь и выберите другое.");
        return;
      }
      if (!response.ok || !body.manageToken) {
        setFormError(body.error?.message ?? "Не удалось записать.");
        return;
      }
      setToken(body.manageToken);
      setTelegramUrl(body.telegramUrl ?? null);
      setBookedBarber(body.barberName ?? barber?.name ?? "любой свободный мастер");
      setDone(true);
    } catch {
      setFormError("Не удалось записать. Проверьте, что API запущен.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="book-page">
        {done && picked.length > 0 && date && time ? (
          <section className="book-done">
            <p className="eyebrow">Запись</p>
            <h1>Вы записаны.</h1>
            <p>{name.trim()}, {labelDate(date)} в {time}. {picked.map((item) => item.name).join(", ")}, {bookedBarber}. {durationLabel(totalMinutes)}, {money(totalPrice)} сум.</p>
            <a className="button button-light" href={`/booking/${token}`}>УПРАВЛЯТЬ ЗАПИСЬЮ <span>↗</span></a>
            {telegramUrl && <a className="underlink" href={telegramUrl} target="_blank" rel="noreferrer">Получить сообщения в Telegram <span>↗</span></a>}
            <a className="underlink" href="/">На главную</a>
          </section>
        ) : (
          <>
            <section>
              <p className="eyebrow">Запись · BRUT</p>
              <h1>Ваше кресло.</h1>
              <ol className="book-steps">
                {steps.map((label, index) => <li className={index === step ? "is-on" : undefined} key={label}>0{index + 1} {label}</li>)}
              </ol>

              {step === 0 && (
                <>
                  <div className="seat-row">
                    {[0, 1, 2].map((index) => {
                      const item = picked[index];
                      return (
                        <button className={item ? "seat is-on" : "seat"} type="button" key={index} disabled={!item} aria-label={item ? `Снять ${item.name}` : undefined} onClick={() => item && toggleService(item.id)}>
                          <small>0{index + 1}</small>
                          <b>{item ? item.name : "—"}</b>
                          {item && <span className="seat-swap"><small className="seat-meta">{item.duration} · {item.price}</small><small className="seat-off">Снять</small></span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className={serviceIds.length === 3 ? "choice-list is-full" : "choice-list"}>
                    {services.map((item) => {
                      const seat = serviceIds.indexOf(item.id);
                      const on = seat >= 0;
                      const blocked = blockedId === item.id;
                      return (
                        <button className={on ? "choice is-on" : blocked ? "choice is-blocked" : "choice"} type="button" key={item.id} aria-pressed={on} onClick={() => toggleService(item.id)} onAnimationEnd={(event) => { if (event.animationName === "choice-no") setBlockedId((current) => current === item.id ? null : current); }}>
                          <span className="choice-index">{on ? `0${seat + 1}` : item.number}</span>
                          <span><b>{item.name}</b><small>{item.description}</small></span>
                          <span>{item.duration}<small>{item.price} сум</small></span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 1 && (
                <div className="barber-picks">
                  <button className={barberId === "any" ? "barber-pick is-on" : "barber-pick"} type="button" onClick={() => { setBarberId("any"); resetSchedule(); }}>
                    <span className="any-mark">Любой</span>
                    <b>Любой свободный</b>
                    <small>Поставим мастера, у которого есть это время.</small>
                  </button>
                  {barbers.map((item, index) => (
                    <button className={item.id === barberId ? "barber-pick is-on" : "barber-pick"} type="button" key={item.id} onClick={() => { setBarberId(item.id); resetSchedule(); }}>
                      <span className="barber-photo" style={{ backgroundImage: `url('${item.image}')`, backgroundPosition: `${item.panel * 50}% center` }}><span>0{index + 1}</span></span>
                      <b>{item.name}</b>
                      <small>{item.role}</small>
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="book-status" aria-live="polite">
                  {dayStatus === "loading" && <p>Смотрим свободные дни.</p>}
                  {dayStatus === "error" && <p>Не удалось загрузить дни. <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></p>}
                  {dayStatus === "ready" && (
                    <div className="day-row">
                      {days.map((item) => {
                        const parsed = new Date(`${item.date}T12:00:00`);
                        return (
                          <button className={item.date === date ? "day is-on" : item.open ? "day" : "day is-closed"} type="button" key={item.date} onClick={() => pickDate(item.date)}>
                            <small>{weekdays[parsed.getDay()]}</small>
                            <b>{parsed.getDate()}</b>
                            <small>{months[parsed.getMonth()]}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="book-status" aria-live="polite">
                  {slotStatus === "loading" && <p>Смотрим свободное время.</p>}
                  {slotStatus === "empty" && <p>В этот день свободных окон нет. Выберите другую дату.</p>}
                  {slotStatus === "error" && (
                    <p>Не удалось загрузить время. <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></p>
                  )}
                  {slotStatus === "ready" && (
                    <div className="slot-grid">
                      {slots.map((slot) => (
                        <button className={slot === time ? "slot is-on" : "slot"} type="button" key={slot} onClick={() => setTime(slot)}>{slot}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <form className="book-fields" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                  <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
                  <label>Телефон<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" /></label>
                  {formError && <p className="book-error">{formError}</p>}
                </form>
              )}

              <div className="book-nav">
                <button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Назад</button>
                {step < 4 ? (
                  <button className="button button-light" type="button" disabled={!ready[step] || (step === 2 && dayStatus !== "ready") || (step === 3 && slotStatus !== "ready")} onClick={() => setStep((value) => value + 1)}>ДАЛЬШЕ <span>↗</span></button>
                ) : (
                  <button className="button button-light" type="button" disabled={submitting} onClick={submit}>{submitting ? "ЗАПИСЫВАЕМ" : "ПОДТВЕРДИТЬ"} <span>↗</span></button>
                )}
              </div>
            </section>
            <aside className="book-summary">
              <p className="eyebrow">Ваша запись</p>
              {picked.length === 0 ? <p><span>Услуга</span><b>—</b></p> : picked.map((item, index) => <p className="summary-line" key={item.id}><span>0{index + 1}</span><b>{item.name}</b></p>)}
              <p><span>Мастер</span><b>{barberId === "any" ? "Любой свободный" : barber ? barber.name : "—"}</b></p>
              <p><span>Дата</span><b>{date ? labelDate(date) : "—"}</b></p>
              <p><span>Время</span><b>{time ?? "—"}</b></p>
              <p><span>Длительность</span><b>{picked.length ? durationLabel(totalMinutes) : "—"}</b></p>
              <p><span>Цена</span><b>{picked.length ? `${money(totalPrice)} сум` : "—"}</b></p>
            </aside>
          </>
        )}
      </main>
    </>
  );
}
