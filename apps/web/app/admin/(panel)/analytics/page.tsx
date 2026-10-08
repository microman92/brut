"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminSend } from "../../../../lib/admin-client";

type Analytics = {
  summary: {
    revenue: number;
    bookings: number;
    completed: number;
    cancelled: number;
    noShows: number;
    returningClients: number;
    completedClients: number;
    returnRate: number;
  };
  services: { name: string; count: number }[];
  barbers: { id: string; name: string; bookedMinutes: number; capacityMinutes: number; loadPercent: number | null }[];
  heatmap: { weekday: number; label: string; counts: number[] }[];
  hours: number[];
};

type Preset = "7" | "30" | "90" | "custom";

function tashkentToday() {
  const today = new Date(Date.now() + 5 * 60 * 60_000);
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}

const number = new Intl.NumberFormat("ru-RU");

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<Preset>("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    if (start > end) {
      setError("Конец периода должен быть не раньше начала.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await adminSend(`analytics?from=${start}&to=${end}`) as Analytics;
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить аналитику");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const end = tashkentToday();
    const start = shiftDate(end, -29);
    setFrom(start);
    setTo(end);
    void load(start, end);
  }, [load]);

  function chooseDays(days: 7 | 30 | 90) {
    const end = tashkentToday();
    const start = shiftDate(end, 1 - days);
    setPreset(String(days) as Preset);
    setFrom(start);
    setTo(end);
    void load(start, end);
  }

  function applyDates(event: FormEvent) {
    event.preventDefault();
    setPreset("custom");
    void load(from, to);
  }

  const maxServiceCount = Math.max(1, ...(data?.services.map((service) => service.count) ?? []));
  const maxHeat = Math.max(1, ...(data?.heatmap.flatMap((day) => day.counts) ?? []));

  return (
    <main className="analytics-page">
      <div className="analytics-heading">
        <div>
          <h1>Аналитика</h1>
          <p>Записи и рабочая загрузка за выбранный период</p>
        </div>
        <div className="analytics-controls">
          <div className="analytics-presets" aria-label="Быстрый выбор периода">
            {(["7", "30", "90"] as const).map((days) => (
              <button key={days} type="button" aria-pressed={preset === days} onClick={() => chooseDays(Number(days) as 7 | 30 | 90)}>
                {days} дней
              </button>
            ))}
            <button type="button" aria-pressed={preset === "custom"} onClick={() => setPreset("custom")}>Период</button>
          </div>
          <form className="analytics-date-form" onSubmit={applyDates}>
            <label>С <input aria-label="Начало периода" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPreset("custom"); }} /></label>
            <label>По <input aria-label="Конец периода" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPreset("custom"); }} /></label>
            <button className="analytics-apply" type="submit" disabled={!from || !to || loading}>Показать</button>
          </form>
        </div>
      </div>

      {error && <p className="analytics-error" role="alert">{error}</p>}
      {loading && !data ? <p className="analytics-state">Загружаем данные…</p> : null}

      {data && (
        <div className={loading ? "analytics-content is-loading" : "analytics-content"} aria-busy={loading}>
          <section className="analytics-metrics" aria-label="Основные показатели">
            <article className="analytics-metric analytics-revenue">
              <span>Выручка</span>
              <strong>{number.format(data.summary.revenue)} <small>сум</small></strong>
              <p>Только завершённые записи</p>
            </article>
            <article className="analytics-metric">
              <span>Все записи</span>
              <strong>{number.format(data.summary.bookings)}</strong>
              <p>{number.format(data.summary.completed)} завершено</p>
            </article>
            <article className="analytics-metric">
              <span>Отмены</span>
              <strong>{number.format(data.summary.cancelled)}</strong>
              <p>За выбранный период</p>
            </article>
            <article className="analytics-metric">
              <span>Неявки</span>
              <strong>{number.format(data.summary.noShows)}</strong>
              <p>Статус «Не пришли»</p>
            </article>
            <article className="analytics-metric">
              <span>Повторные клиенты</span>
              <strong>{data.summary.returnRate}<small>%</small></strong>
              <p>{data.summary.returningClients} из {data.summary.completedClients} клиентов с визитом</p>
            </article>
          </section>

          <div className="analytics-columns">
            <section className="analytics-section">
              <div className="analytics-section-head">
                <h2>Популярные услуги</h2>
                <span>Записи без отмен</span>
              </div>
              {data.services.length ? (
                <ol className="analytics-service-list">
                  {data.services.map((service, index) => (
                    <li key={service.name}>
                      <span className="analytics-service-rank">{String(index + 1).padStart(2, "0")}</span>
                      <span className="analytics-service-name">{service.name}</span>
                      <span className="analytics-service-bar" aria-hidden="true"><i style={{ width: `${service.count / maxServiceCount * 100}%` }} /></span>
                      <strong>{service.count}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="analytics-empty">За этот период записей нет.</p>}
            </section>

            <section className="analytics-section">
              <div className="analytics-section-head">
                <h2>Загрузка мастеров</h2>
                <span>Занятое время / рабочее время</span>
              </div>
              {data.barbers.length ? (
                <div className="analytics-barber-list">
                  {data.barbers.map((barber) => {
                    const level = barber.loadPercent === null ? 0 : Math.min(barber.loadPercent, 100);
                    return (
                      <article className="analytics-barber" key={barber.id}>
                        <div className="analytics-barber-info">
                          <strong>{barber.name}</strong>
                          <span>{durationLabel(barber.bookedMinutes)} / {durationLabel(barber.capacityMinutes)}</span>
                        </div>
                        <div className="analytics-load-track" role="meter" aria-label={`Загрузка: ${barber.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(barber.loadPercent ?? 0, 100)}>
                          <i style={{ width: `${level}%` }} />
                        </div>
                        <b>{barber.loadPercent === null ? "—" : `${barber.loadPercent}%`}</b>
                      </article>
                    );
                  })}
                </div>
              ) : <p className="analytics-empty">Добавьте мастеров, чтобы увидеть загрузку.</p>}
            </section>
          </div>

          <section className="analytics-section analytics-heat-section">
            <div className="analytics-section-head">
              <div>
                <h2>Когда приходят клиенты</h2>
                <p>Количество записей по дню недели и часу начала. Отмены не учитываются.</p>
              </div>
              <div className="analytics-legend" aria-label="Меньше записей — больше записей">
                <span>Меньше</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}<span>Больше</span>
              </div>
            </div>
            <div className="analytics-heat-scroll">
              <table className="analytics-heatmap">
                <thead><tr><th scope="col">День</th>{data.hours.map((hour) => <th scope="col" key={hour}>{String(hour).padStart(2, "0")}</th>)}</tr></thead>
                <tbody>
                  {data.heatmap.map((day) => (
                    <tr key={day.weekday}>
                      <th scope="row">{day.label}</th>
                      {day.counts.map((count, hour) => {
                        const level = count ? Math.max(1, Math.ceil(count / maxHeat * 4)) : 0;
                        return <td key={hour}><span role="img" title={`${day.label}, ${String(hour).padStart(2, "0")}:00 — ${count} записей`} aria-label={`${day.label}, ${String(hour).padStart(2, "0")}:00 — ${count} записей`} data-level={level}>{count || ""}</span></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="analytics-footnote">Загрузка рассчитана по текущему графику мастеров с учётом перерывов и исключений. Отмены и неявки считаются по дате записи. Повторный клиент — тот, у кого к концу периода было больше одного завершённого визита.</p>
        </div>
      )}
    </main>
  );
}
