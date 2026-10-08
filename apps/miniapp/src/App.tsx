import { useEffect, useState } from "react";
import { apiFetch, readError } from "./api";
import { initData, telegramName } from "./telegram";

type Service = { id: string; name: string; description: string; durationMin: number; price: number };
type Barber = { id: string; name: string; photoUrl: string | null; experienceYears: number; sortOrder: number; services: { id: string }[] };
type Day = { date: string; open: boolean };
type Mine = {
  manageToken: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  date: string;
  time: string;
  barberId: string;
  barberName: string;
  serviceIds: string[];
  services: { name: string }[];
  canChange: boolean;
};

const steps = ["Услуга", "Мастер", "Дата", "Время", "Контакты"] as const;
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

export default function App() {
  const [screen, setScreen] = useState<"book" | "mine">("book");
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState(telegramName);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState("");
  const [mine, setMine] = useState<Mine[]>([]);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/v1/services").then((response) => response.json()),
      apiFetch("/api/v1/barbers").then((response) => response.json()),
    ]).then(([serviceRows, barberRows]: [Service[], Barber[]]) => {
      setServices(serviceRows);
      setBarbers(barberRows);
    }).catch(() => setMessage("API не запущен. Нужен npm run dev:api"));
  }, []);

  useEffect(() => {
    if (!initData) return;
    apiFetch("/api/v1/telegram/verify", { method: "POST", body: JSON.stringify({ initData }) })
      .catch(() => setMessage("initData не прошёл проверку. Проверьте TELEGRAM_BOT_TOKEN."));
  }, []);

  const picked = serviceIds.flatMap((id) => {
    const item = services.find((service) => service.id === id);
    return item ? [item] : [];
  });
  const masters = barbers.filter((barber) => serviceIds.every((id) => barber.services.some((service) => service.id === id)));

  function toggleService(id: string) {
    setDate(null);
    setTime(null);
    setServiceIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  async function loadDays() {
    setMessage("");
    const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId: barberId ?? "" });
    const response = await apiFetch(`/api/v1/availability/days?${params}`);
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    const body = await response.json() as { days: Day[] };
    setDays(body.days);
    setStep(2);
  }

  async function loadSlots(nextDate: string) {
    setDate(nextDate);
    setTime(null);
    const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId: barberId ?? "", date: nextDate });
    const response = await apiFetch(`/api/v1/availability?${params}`);
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    const body = await response.json() as { slots: string[] };
    setSlots(body.slots);
    setMessage(body.slots.length ? "" : "В этот день свободных окон нет.");
    setStep(3);
  }

  async function submit() {
    if (!date || !time || !barberId || name.trim().length < 2 || phone.replace(/\D/g, "").length < 9) {
      setMessage("Введите имя и телефон, минимум 9 цифр.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/v1/bookings", {
        method: "POST",
        body: JSON.stringify({
          serviceIds,
          barberId,
          startsAt: `${date}T${time}:00+05:00`,
          client: { name: name.trim(), phone: phone.trim() },
        }),
      });
      if (!response.ok) {
        setMessage(await readError(response));
        return;
      }
      const body = await response.json() as { barberName: string };
      setDone(`${labelDate(date)} в ${time}, ${body.barberName}`);
    } catch {
      setMessage("Не удалось записать.");
    } finally {
      setPending(false);
    }
  }

  async function openMine() {
    setScreen("mine");
    setMessage("");
    if (!initData) return;
    const response = await apiFetch("/api/v1/me/bookings");
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    const body = await response.json() as { bookings: Mine[] };
    setMine(body.bookings);
  }

  async function cancel(token: string) {
    const response = await apiFetch(`/api/v1/bookings/${token}/cancel`, { method: "POST" });
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    await openMine();
  }

  async function move(item: Mine, nextDate: string, nextTime: string) {
    const response = await apiFetch(`/api/v1/bookings/${item.manageToken}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startsAt: `${nextDate}T${nextTime}:00+05:00` }),
    });
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    setMoving(null);
    await openMine();
  }

  const barberName = barberId === "any" ? "Любой свободный" : barbers.find((item) => item.id === barberId)?.name ?? "—";

  return (
    <>
      <header className="top">
        <p className="brand">BRUT<span>.</span></p>
        <button className="header-book" type="button" onClick={() => screen === "mine" ? setScreen("book") : openMine()}>{screen === "mine" ? "ЗАПИСЬ" : "МОИ"} <span>↗</span></button>
      </header>
      <main className="book">
        {screen === "mine" ? (
          <MineList items={mine} signedIn={Boolean(initData)} moving={moving} message={message} onCancel={cancel} onMove={move} onStartMove={setMoving} />
        ) : done ? (
          <section className="book-done">
            <p className="eyebrow">Запись</p>
            <h1>Вы записаны.</h1>
            <p>{name.trim()}, {done}. {picked.map((item) => item.name).join(", ")}.</p>
          </section>
        ) : (
          <>
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
                      <button className={item ? "seat is-on" : "seat"} type="button" key={index} disabled={!item} onClick={() => item && toggleService(item.id)}>
                        <small>0{index + 1}</small>
                        <b>{item ? item.name : "—"}</b>
                      </button>
                    );
                  })}
                </div>
                <div className={serviceIds.length === 3 ? "choice-list is-full" : "choice-list"}>
                  {services.map((item, index) => {
                    const seat = serviceIds.indexOf(item.id);
                    const on = seat >= 0;
                    return (
                      <button className={on ? "choice is-on" : "choice"} type="button" key={item.id} onClick={() => toggleService(item.id)}>
                        <span className="choice-index">{on ? `0${seat + 1}` : String(index + 1).padStart(2, "0")}</span>
                        <span><b>{item.name}</b><small>{item.description}</small></span>
                        <span>{item.durationMin} мин<small>{money(item.price)} сум</small></span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {step === 1 && (
              <div className="barber-picks">
                <button className={barberId === "any" ? "barber-pick is-on" : "barber-pick"} type="button" onClick={() => { setBarberId("any"); setDate(null); setTime(null); }}>
                  <span className="any-mark">Любой</span>
                  <b>Любой свободный</b>
                  <small>Поставим мастера, у которого есть это время.</small>
                </button>
                {masters.map((item) => (
                  <button className={barberId === item.id ? "barber-pick is-on" : "barber-pick"} type="button" key={item.id} onClick={() => { setBarberId(item.id); setDate(null); setTime(null); }}>
                    <span className="barber-photo" style={{ backgroundImage: item.photoUrl ? `url('${item.photoUrl}')` : undefined, backgroundPosition: `${((item.sortOrder - 1) % 3) * 50}% center` }} />
                    <b>{item.name}</b>
                    <small>{item.experienceYears} лет</small>
                  </button>
                ))}
              </div>
            )}
            {step === 2 && (
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
            )}
            {step === 3 && (
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button className={slot === time ? "slot is-on" : "slot"} type="button" key={slot} onClick={() => setTime(slot)}>{slot}</button>
                ))}
              </div>
            )}
            {step === 4 && (
              <div className="book-fields">
                <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Телефон<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" /></label>
              </div>
            )}
            {message && <p className="book-error">{message}</p>}
            <div className="book-nav">
              <button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Назад</button>
              {step < 4 ? (
                <button className="button button-light" type="button" disabled={(step === 0 && serviceIds.length === 0) || (step === 1 && !barberId) || step === 2 || (step === 3 && !time)} onClick={() => step === 1 ? loadDays() : setStep((value) => value + 1)}>ДАЛЬШЕ <span>↗</span></button>
              ) : (
                <button className="button button-light" type="button" disabled={pending} onClick={submit}>{pending ? "ЗАПИСЫВАЕМ" : "ПОДТВЕРДИТЬ"} <span>↗</span></button>
              )}
            </div>
            <aside className="book-summary">
              <p className="eyebrow">Ваша запись</p>
              <p><span>Услуга</span><b>{picked.length ? picked.map((item) => item.name).join(", ") : "—"}</b></p>
              <p><span>Мастер</span><b>{barberName}</b></p>
              <p><span>Дата</span><b>{date ? labelDate(date) : "—"}</b></p>
              <p><span>Время</span><b>{time ?? "—"}</b></p>
            </aside>
          </>
        )}
      </main>
    </>
  );
}

function MineList({ items, signedIn, moving, message, onCancel, onMove, onStartMove }: {
  items: Mine[];
  signedIn: boolean;
  moving: string | null;
  message: string;
  onCancel: (token: string) => void;
  onMove: (item: Mine, date: string, time: string) => void;
  onStartMove: (token: string | null) => void;
}) {
  const [days, setDays] = useState<Day[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);

  async function start(item: Mine) {
    onStartMove(item.manageToken);
    setDate(null);
    setSlots([]);
    const params = new URLSearchParams({ serviceIds: item.serviceIds.join(","), barberId: item.barberId });
    const response = await apiFetch(`/api/v1/availability/days?${params}`);
    if (!response.ok) return;
    const body = await response.json() as { days: Day[] };
    setDays(body.days);
  }

  async function pickDay(item: Mine, nextDate: string) {
    setDate(nextDate);
    const params = new URLSearchParams({ serviceIds: item.serviceIds.join(","), barberId: item.barberId, date: nextDate });
    const response = await apiFetch(`/api/v1/availability?${params}`);
    if (!response.ok) return;
    const body = await response.json() as { slots: string[] };
    setSlots(body.slots);
  }

  if (!signedIn) {
    return (
      <section>
        <p className="eyebrow">Записи</p>
        <h1>Мои записи.</h1>
        <p className="lead">Список своих записей открывается внутри Telegram: нужна подпись initData.</p>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">Записи</p>
      <h1>Мои записи.</h1>
      {items.length === 0 && <p className="lead">Пока пусто.</p>}
      <div className="mine-list">
        {items.map((item) => (
          <article className="book-summary" key={item.manageToken}>
            <p className="eyebrow">{statusLabel[item.status]}</p>
            <p><span>Когда</span><b>{labelDate(item.date)} · {item.time}</b></p>
            <p><span>Услуга</span><b>{item.services.map((service) => service.name).join(", ")}</b></p>
            <p><span>Мастер</span><b>{item.barberName}</b></p>
            {item.canChange && moving !== item.manageToken && (
              <div className="book-nav">
                <button type="button" onClick={() => onCancel(item.manageToken)}>Отменить</button>
                <button className="button button-light" type="button" onClick={() => start(item)}>ПЕРЕНЕСТИ <span>↗</span></button>
              </div>
            )}
            {moving === item.manageToken && (
              <>
                <div className="day-row">
                  {days.map((day) => {
                    const parsed = new Date(`${day.date}T12:00:00`);
                    return (
                      <button className={day.date === date ? "day is-on" : "day"} type="button" key={day.date} onClick={() => pickDay(item, day.date)}>
                        <small>{weekdays[parsed.getDay()]}</small>
                        <b>{parsed.getDate()}</b>
                        <small>{months[parsed.getMonth()]}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="slot-grid">
                  {slots.map((slot) => (
                    <button className="slot" type="button" key={slot} onClick={() => date && onMove(item, date, slot)}>{slot}</button>
                  ))}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {message && <p className="book-error">{message}</p>}
    </section>
  );
}
