"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { adminSend, uploadImage, weekdays } from "../../../../../lib/admin-client";

type Day = { weekday: number; startTime: string; endTime: string };
type Service = { id: string; name: string };
type TimeOff = { id: string; startsAt: string; endsAt: string; type: string; note: string | null };
type Portfolio = { id: string; imageUrl: string };
type Barber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  sortOrder: number;
  isActive: boolean;
  photoUrl: string | null;
  services: { serviceId: string }[];
  workingHours: Day[];
  breaks: Day[];
  timeOff: TimeOff[];
  portfolio: Portfolio[];
};

const offTypes = [
  ["day_off", "Выходной"],
  ["vacation", "Отпуск"],
  ["sick", "Больничный"],
  ["closure", "Закрытие"],
] as const;

export default function AdminBarberPage() {
  const params = useParams<{ id: string }>();
  const [barber, setBarber] = useState<Barber | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [hours, setHours] = useState<Day[]>([]);
  const [breaks, setBreaks] = useState<Day[]>([]);
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offType, setOffType] = useState<(typeof offTypes)[number][0]>("day_off");
  const [offNote, setOffNote] = useState("");
  const [shopWide, setShopWide] = useState(false);
  const [offs, setOffs] = useState<(TimeOff & { barberId: string | null })[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [barberBody, serviceBody, offBody] = await Promise.all([
      adminSend("barbers") as Promise<{ barbers: Barber[] }>,
      adminSend("services") as Promise<{ services: Service[] }>,
      adminSend("time-off") as Promise<{ timeOff: (TimeOff & { barberId: string | null })[] }>,
    ]);
    const found = barberBody.barbers.find((item) => item.id === params.id) ?? null;
    setBarber(found);
    setServices(serviceBody.services);
    setServiceIds(found?.services.map((item) => item.serviceId) ?? []);
    setHours(found?.workingHours ?? []);
    setBreaks(found?.breaks ?? []);
    setOffs(offBody.timeOff.filter((item) => item.barberId === params.id || item.barberId === null));
  }

  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [params.id]);

  function day(list: Day[], weekday: number) {
    return list.find((item) => item.weekday === weekday);
  }

  function setDay(list: Day[], setList: (value: Day[]) => void, weekday: number, open: boolean, startTime = "10:00", endTime = "22:00") {
    setList(open ? [...list.filter((item) => item.weekday !== weekday), { weekday, startTime, endTime }] : list.filter((item) => item.weekday !== weekday));
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!barber) return;
    setMessage("");
    try {
      await adminSend(`barbers/${barber.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: barber.name,
          bio: barber.bio,
          experienceYears: barber.experienceYears,
          sortOrder: barber.sortOrder,
          isActive: barber.isActive,
          photoUrl: barber.photoUrl,
          serviceIds,
        }),
      });
      setMessage("Сохранено");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
    }
  }

  async function onPhoto(file: File | undefined, portfolio: boolean) {
    if (!file || !barber) return;
    setMessage("");
    try {
      const url = await uploadImage(file);
      if (portfolio) {
        await adminSend(`barbers/${barber.id}/portfolio`, { method: "POST", body: JSON.stringify({ imageUrl: url }) });
        await load();
      } else {
        setBarber({ ...barber, photoUrl: url });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Фото не загрузилось");
    }
  }

  async function saveHours() {
    if (!barber) return;
    setMessage("");
    try {
      await adminSend(`barbers/${barber.id}/hours`, { method: "PUT", body: JSON.stringify(hours) });
      setMessage("График сохранён. День без галочки — выходной.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить график");
    }
  }

  async function saveBreaks() {
    if (!barber) return;
    setMessage("");
    try {
      await adminSend(`barbers/${barber.id}/breaks`, { method: "PUT", body: JSON.stringify(breaks) });
      setMessage("Обеды сохранены");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить обеды");
    }
  }

  async function addOff(event: FormEvent) {
    event.preventDefault();
    if (!barber) return;
    setMessage("");
    try {
      await adminSend("time-off", {
        method: "POST",
        body: JSON.stringify({
          barberId: shopWide ? null : barber.id,
          startsAt: `${offStart}T00:00:00+05:00`,
          endsAt: `${offEnd}T23:59:00+05:00`,
          type: offType,
          note: offNote,
        }),
      });
      setOffNote("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить исключение");
    }
  }

  if (!barber) return <main><p>{message || "Загрузка"}</p></main>;

  return (
    <main>
      <p className="eyebrow">Мастер</p>
      <h1>{barber.name}</h1>
      <form className="book-fields" onSubmit={saveProfile}>
        <label>Имя<input value={barber.name} onChange={(event) => setBarber({ ...barber, name: event.target.value })} /></label>
        <label>О мастере<textarea value={barber.bio} onChange={(event) => setBarber({ ...barber, bio: event.target.value })} /></label>
        <label>Стаж<input type="number" value={barber.experienceYears} onChange={(event) => setBarber({ ...barber, experienceYears: Number(event.target.value) })} /></label>
        <label>Порядок<input type="number" value={barber.sortOrder} onChange={(event) => setBarber({ ...barber, sortOrder: Number(event.target.value) })} /></label>
        <label><input type="checkbox" checked={barber.isActive} onChange={(event) => setBarber({ ...barber, isActive: event.target.checked })} /> На сайте</label>
        <label>Портрет<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onPhoto(event.target.files?.[0], false)} /></label>
        {barber.photoUrl && <p>{barber.photoUrl}</p>}
        <div className="admin-checks">
          {services.map((item) => (
            <label key={item.id}>
              <input type="checkbox" checked={serviceIds.includes(item.id)} onChange={() => setServiceIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />
              {item.name}
            </label>
          ))}
        </div>
        <button className="button button-light" type="submit">СОХРАНИТЬ <span>↗</span></button>
      </form>

      <h2>Неделя</h2>
      <div className="admin-list">
        {weekdays.map((label, weekday) => {
          const row = day(hours, weekday);
          return (
            <div className="admin-row" key={label}>
              <label><input type="checkbox" checked={Boolean(row)} onChange={(event) => setDay(hours, setHours, weekday, event.target.checked, row?.startTime, row?.endTime)} /> {label}</label>
              <input type="time" disabled={!row} value={row?.startTime ?? "10:00"} onChange={(event) => setDay(hours, setHours, weekday, true, event.target.value, row?.endTime ?? "22:00")} />
              <input type="time" disabled={!row} value={row?.endTime ?? "22:00"} onChange={(event) => setDay(hours, setHours, weekday, true, row?.startTime ?? "10:00", event.target.value)} />
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => void saveHours()}>Сохранить график</button>

      <h2>Обед</h2>
      <div className="admin-list">
        {weekdays.map((label, weekday) => {
          const row = day(breaks, weekday);
          return (
            <div className="admin-row" key={label}>
              <label><input type="checkbox" checked={Boolean(row)} onChange={(event) => setDay(breaks, setBreaks, weekday, event.target.checked, "13:00", "14:00")} /> {label}</label>
              <input type="time" disabled={!row} value={row?.startTime ?? "13:00"} onChange={(event) => setDay(breaks, setBreaks, weekday, true, event.target.value, row?.endTime ?? "14:00")} />
              <input type="time" disabled={!row} value={row?.endTime ?? "14:00"} onChange={(event) => setDay(breaks, setBreaks, weekday, true, row?.startTime ?? "13:00", event.target.value)} />
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => void saveBreaks()}>Сохранить обеды</button>

      <h2>Исключения</h2>
      <form className="book-fields" onSubmit={addOff}>
        <label>С<input type="date" value={offStart} onChange={(event) => setOffStart(event.target.value)} /></label>
        <label>По<input type="date" value={offEnd} onChange={(event) => setOffEnd(event.target.value)} /></label>
        <label>Тип
          <select value={offType} onChange={(event) => setOffType(event.target.value as typeof offType)}>
            {offTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Заметка<input value={offNote} onChange={(event) => setOffNote(event.target.value)} /></label>
        <label><input type="checkbox" checked={shopWide} onChange={(event) => setShopWide(event.target.checked)} /> На весь барбершоп</label>
        <button type="submit">Добавить</button>
      </form>
      <div className="admin-list">
        {offs.map((item) => (
          <article className="admin-card" key={item.id}>
            <span>{item.type} · {item.startsAt.slice(0, 10)} — {item.endsAt.slice(0, 10)}</span>
            {item.note && <span>{item.note}</span>}
            <button type="button" onClick={() => void adminSend(`time-off/${item.id}`, { method: "DELETE" }).then(load)}>Удалить</button>
          </article>
        ))}
      </div>

      <h2>Портфолио</h2>
      <label className="book-fields">Фото<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onPhoto(event.target.files?.[0], true)} /></label>
      <div className="admin-list">
        {barber.portfolio.map((item) => (
          <article className="admin-card" key={item.id}>
            <span>{item.imageUrl}</span>
            <button type="button" onClick={() => void adminSend(`portfolio/${item.id}`, { method: "DELETE" }).then(load)}>Удалить</button>
          </article>
        ))}
      </div>
      {message && <p className="book-error">{message}</p>}
    </main>
  );
}
