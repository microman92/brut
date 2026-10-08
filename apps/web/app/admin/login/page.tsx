"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Не удалось войти");
        return;
      }
      location.href = "/admin";
    } catch {
      setError("API не отвечает. Запустите npm run dev:api");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin admin-login-page">
      <section className="login-brand-panel" aria-labelledby="login-title">
        <div className="login-brandline">
          <span className="login-wordmark">BRUT<span>.</span></span>
          <span className="login-location">ВЛАДЕЛЕЦ / ТАШКЕНТ</span>
        </div>
        <div className="login-titleblock">
          <p className="login-kicker">ПРОСТРАНСТВО ВЛАДЕЛЬЦА</p>
          <h1 id="login-title">ВХОД<span>.</span></h1>
          <p className="login-note">Записи, команда и расписание<br />барбершопа BRUT.</p>
        </div>
        <div className="login-baseline"><span>BRUT BARBERSHOP</span><span>01 / OWNER ACCESS</span></div>
      </section>

      <section className="login-panel" aria-label="Вход в админ-панель">
        <div className="login-form-shell">
          <div className="login-panel-index"><span>ЛИЧНЫЙ КАБИНЕТ</span><span>01 — 02</span></div>
          <h2>Авторизация</h2>
          <p className="login-instruction">Введите данные администратора.</p>
          <form className="login-form" onSubmit={submit}>
            <label className="login-field" htmlFor="admin-login-name">
              <span>Логин</span>
              <input id="admin-login-name" value={login} autoComplete="username" required onChange={(event) => setLogin(event.target.value)} />
            </label>
            <label className="login-field" htmlFor="admin-login-password">
              <span>Пароль</span>
              <input id="admin-login-password" value={password} type="password" autoComplete="current-password" required onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="login-error" role="alert" aria-live="assertive">{error}</p>}
            <button className="login-submit" type="submit" disabled={pending}>
              <span>{pending ? "ВХОДИМ" : "ВОЙТИ"}</span>
              <span className="login-arrow" aria-hidden="true">↗</span>
            </button>
          </form>
          <div className="login-panel-foot"><span>Закрытый доступ</span><span>BRUT · 01</span></div>
        </div>
      </section>
    </main>
  );
}
