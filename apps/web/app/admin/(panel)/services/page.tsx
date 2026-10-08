"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminSend } from "../../../../lib/admin-client";

type Service = { id: string; name: string; description: string; durationMin: number; price: number; sortOrder: number; isActive: boolean };
const empty = { name: "", description: "", durationMin: 30, price: 0, sortOrder: 0, isActive: true };

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [draft, setDraft] = useState(empty);
  const [message, setMessage] = useState("");

  async function load() {
    const body = await adminSend("services") as { services: Service[] };
    setServices(body.services);
  }

  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await adminSend("services", { method: "POST", body: JSON.stringify(draft) });
      setDraft(empty);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
    }
  }

  async function update(item: Service) {
    setMessage("");
    try {
      await adminSend(`services/${item.id}`, { method: "PATCH", body: JSON.stringify(item) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
    }
  }

  async function remove(id: string) {
    setMessage("");
    try {
      const body = await adminSend(`services/${id}`, { method: "DELETE" }) as { hidden?: boolean };
      setMessage(body.hidden ? "У услуги есть записи, она скрыта." : "");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить");
    }
  }

  return (
    <main>
      <p className="eyebrow">Услуги</p>
      <h1>Прайс.</h1>
      <form className="book-fields" onSubmit={save}>
        <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Описание<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Минуты<input type="number" value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} /></label>
        <label>Цена<input type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
        <button className="button button-light" type="submit">ДОБАВИТЬ <span>↗</span></button>
      </form>
      {message && <p className="book-error">{message}</p>}
      <div className="admin-list">
        {services.map((item) => (
          <article className="admin-card" key={item.id}>
            <label>Название<input value={item.name} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} /></label>
            <label>Описание<input value={item.description} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row))} /></label>
            <div className="admin-row">
              <label>Минуты<input type="number" value={item.durationMin} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, durationMin: Number(event.target.value) } : row))} /></label>
              <label>Цена<input type="number" value={item.price} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, price: Number(event.target.value) } : row))} /></label>
              <label>Порядок<input type="number" value={item.sortOrder} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, sortOrder: Number(event.target.value) } : row))} /></label>
            </div>
            <label><input type="checkbox" checked={item.isActive} onChange={(event) => setServices((current) => current.map((row) => row.id === item.id ? { ...row, isActive: event.target.checked } : row))} /> На сайте</label>
            <div className="admin-row">
              <button type="button" onClick={() => void update(services.find((row) => row.id === item.id) ?? item)}>Сохранить</button>
              <button type="button" onClick={() => void remove(item.id)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
