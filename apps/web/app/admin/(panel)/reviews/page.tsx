"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminSend } from "../../../../lib/admin-client";

type Review = { id: string; rating: number; comment: string | null; isPublic: boolean; clientName: string; barberName: string };
type Booking = { id: string; date: string; time: string; clientName: string; status: string };

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [reviewBody, bookingBody] = await Promise.all([
      adminSend("reviews") as Promise<{ reviews: Review[] }>,
      adminSend("bookings") as Promise<{ bookings: Booking[] }>,
    ]);
    setReviews(reviewBody.reviews);
    setBookings(bookingBody.bookings.filter((item) => item.status === "completed"));
  }

  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await adminSend("reviews", { method: "POST", body: JSON.stringify({ bookingId, rating, comment, isPublic }) });
      setComment("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить отзыв");
    }
  }

  async function toggle(item: Review) {
    setMessage("");
    try {
      await adminSend(`reviews/${item.id}`, { method: "PATCH", body: JSON.stringify({ isPublic: !item.isPublic }) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить");
    }
  }

  return (
    <main>
      <p className="eyebrow">Отзывы</p>
      <h1>Голоса.</h1>
      <form className="book-fields" onSubmit={create}>
        <label>Запись
          <select value={bookingId} onChange={(event) => setBookingId(event.target.value)}>
            <option value="">Завершённая запись</option>
            {bookings.map((item) => <option key={item.id} value={item.id}>{item.date} {item.time} · {item.clientName}</option>)}
          </select>
        </label>
        <label>Оценка<input type="number" min={1} max={5} value={rating} onChange={(event) => setRating(Number(event.target.value))} /></label>
        <label>Текст<input value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <label><input type="checkbox" checked={isPublic} onChange={(event) => setPublic(event.target.checked)} /> Показать на сайте</label>
        <button className="button button-light" type="submit">СОХРАНИТЬ <span>↗</span></button>
      </form>
      {message && <p className="book-error">{message}</p>}
      <div className="admin-list">
        {reviews.map((item) => (
          <article className="admin-card" key={item.id}>
            <b>{item.rating} / 5 · {item.clientName}</b>
            <span>{item.barberName}</span>
            {item.comment && <p>{item.comment}</p>}
            <button type="button" onClick={() => void toggle(item)}>{item.isPublic ? "Скрыть" : "Показать"}</button>
          </article>
        ))}
      </div>
    </main>
  );
}
