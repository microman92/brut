"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { adminSend } from "../../../../lib/admin-client";

type Barber = { id: string; name: string; isActive: boolean; experienceYears: number; sortOrder: number };

export default function AdminBarbersPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState(1);
  const [message, setMessage] = useState("");

  async function load() {
    const body = await adminSend("barbers") as { barbers: Barber[] };
    setBarbers(body.barbers);
  }

  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await adminSend("barbers", { method: "POST", body: JSON.stringify({ name, bio, experienceYears: years, sortOrder: barbers.length + 1 }) });
      setName("");
      setBio("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить");
    }
  }

  async function remove(id: string) {
    setMessage("");
    try {
      const body = await adminSend(`barbers/${id}`, { method: "DELETE" }) as { hidden?: boolean };
      setMessage(body.hidden ? "У мастера есть записи, он скрыт." : "");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить");
    }
  }

  return (
    <main>
      <p className="eyebrow">Мастера</p>
      <h1>Команда.</h1>
      <form className="book-fields" onSubmit={create}>
        <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>О мастере<input value={bio} onChange={(event) => setBio(event.target.value)} /></label>
        <label>Стаж, лет<input type="number" value={years} onChange={(event) => setYears(Number(event.target.value))} /></label>
        <button className="button button-light" type="submit">ДОБАВИТЬ <span>↗</span></button>
      </form>
      {message && <p className="book-error">{message}</p>}
      <div className="admin-list">
        {barbers.map((item) => (
          <article className="admin-card" key={item.id}>
            <b>{item.name}</b>
            <span>{item.isActive ? "На сайте" : "Скрыт"} · {item.experienceYears} лет</span>
            <div className="admin-row">
              <Link href={`/admin/barbers/${item.id}`}>График и фото</Link>
              <button type="button" onClick={() => void remove(item.id)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
