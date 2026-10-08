"use client";

import { useRef } from "react";

const links = [["О BRUT", "/#about"], ["Услуги", "/#services"], ["Мастера", "/#barbers"], ["Работы", "/#work"], ["Контакты", "/#contacts"]];

export default function SiteHeader() {
  const menu = useRef<HTMLDialogElement>(null);

  return (
    <header className="site-header" id="top">
      <a className="brand" href="/" aria-label="BRUT — главная">BRUT<span>.</span></a>
      <nav className="desktop-nav" aria-label="Основная навигация">{links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</nav>
      <a className="header-book" href="/book">ЗАПИСАТЬСЯ <span>↗</span></a>
      <button className="menu-toggle" type="button" aria-label="Открыть меню" onClick={() => menu.current?.showModal()}><span /><span /></button>
      <dialog className="mobile-menu" ref={menu}>
        <div className="mobile-menu-head"><a className="brand" href="/" onClick={() => menu.current?.close()}>BRUT<span>.</span></a><button type="button" aria-label="Закрыть меню" onClick={() => menu.current?.close()}>ЗАКРЫТЬ <b>×</b></button></div>
        <nav aria-label="Мобильная навигация">{links.map(([label, href], i) => <a href={href} key={href} onClick={() => menu.current?.close()}><span>0{i + 1}</span>{label}<b>↗</b></a>)}</nav>
        <p>ТАШКЕНТ · ЕЖЕДНЕВНО 10:00—22:00</p>
      </dialog>
    </header>
  );
}
