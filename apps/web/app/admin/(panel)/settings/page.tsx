"use client";

import { useEffect, useState } from "react";
import { adminSend } from "../../../../lib/admin-client";

const labels: Record<string, string> = {
  cancel_cutoff_min: "Минут до визита, когда отмена ещё возможна",
  slot_step_min: "Шаг слота, минут",
  booking_horizon_days: "Горизонт записи, дней",
  min_notice_min: "Минимальный запас до записи, минут",
  reminder_day_minutes: "Напоминание за, минут",
  reminder_short_minutes: "Короткое напоминание за, минут",
  review_delay_min: "Просьба об отзыве через, минут",
  review_public_min_rating: "Публиковать отзывы от оценки",
  timezone: "Часовой пояс",
};

type Setting = { key: string; value: string };

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void adminSend("settings").then((body) => setSettings((body as { settings: Setting[] }).settings)).catch((error: Error) => setMessage(error.message));
  }, []);

  async function save(item: Setting) {
    setMessage("");
    try {
      await adminSend("settings", { method: "PUT", body: JSON.stringify(item) });
      setMessage("Сохранено");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
    }
  }

  return (
    <main>
      <p className="eyebrow">Настройки</p>
      <h1>Правила.</h1>
      <div className="admin-list">
        {settings.map((item) => (
          <label className="admin-card" key={item.key}>
            {labels[item.key] ?? item.key}
            <input value={item.value} onChange={(event) => setSettings((current) => current.map((row) => row.key === item.key ? { ...row, value: event.target.value } : row))} />
            <button type="button" onClick={() => void save(settings.find((row) => row.key === item.key) ?? item)}>Сохранить</button>
          </label>
        ))}
      </div>
      {message && <p className="book-error">{message}</p>}
    </main>
  );
}
