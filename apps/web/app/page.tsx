import Image from "next/image";
import SiteHeader from "../components/site-header";
import Hero from "../components/hero";
import SmoothScroll from "../components/smooth-scroll";
import Barbers from "../components/barbers";
import Works from "../components/works";
import { loadCatalog } from "../lib/catalog";

export default async function HomePage() {
  const catalog = await loadCatalog();
  return (
    <>
    <SiteHeader />
    <SmoothScroll>
    <main>
      <Hero />

      <section className="manifesto section-pad" id="about">
        <p className="eyebrow">BRUT · ТАШКЕНТ</p>
        <h2>Меньше шума.<br /><em>Больше характера.</em></h2>
        <div className="manifesto-note"><span className="rule" /><p>Место, где знают цену хорошей форме. Точная работа, сильные мастера и время, которое принадлежит вам.</p></div>
        <span className="manifesto-index" aria-hidden="true">01 — 06</span>
      </section>

      <section className="services section-pad" id="services">
        <div className="section-top"><div><p className="eyebrow">Прайс · 2026</p><h2>Услуги</h2></div><p>Каждая услуга начинается с разговора о том, какой результат нужен именно вам.</p></div>
        <div className="service-list">
          {catalog.error ? <p>{catalog.error}</p> : catalog.services.map((service) => (
            <article className="service-row" key={service.id}>
              <span className="service-number">{service.number}</span><div className="service-name"><h3>{service.name}</h3><p>{service.description}</p></div><span className="service-duration">{service.duration}</span><span className="service-price">{service.price}<small> сум</small></span>
            </article>
          ))}
        </div>
        <a className="underlink" href="/book">Выбрать время <span>↗</span></a>
      </section>

      {catalog.error ? <section className="barbers section-pad" id="barbers"><p>{catalog.error}</p></section> : <Barbers barbers={catalog.barbers} />}

      <Works />

      <section className="atmosphere" aria-label="Интерьер барбершопа">
        <Image src="/images/barbershop.png" alt="Интерьер BRUT: кресло барбера и рабочее место" fill sizes="100vw" />
        <div className="atmosphere-shade" />
        <div className="atmosphere-copy"><p className="eyebrow">Пространство BRUT</p><h2>Ваше время.<br /><em>Ваш ритм.</em></h2><span>ТАШКЕНТ · ЕЖЕДНЕВНО 10:00—22:00</span></div>
      </section>

      <section className="why section-pad">
        <div><p className="eyebrow">Принципы</p><h2>Хорошая работа<br />видна <em>сразу.</em></h2></div>
        <div className="why-list"><article><span>01</span><div><h3>Сначала слушаем</h3><p>Обсудим длину, привычки и укладку до того, как возьмёмся за машинку.</p></div></article><article><span>02</span><div><h3>Работаем точно</h3><p>Чистые переходы и форма, которая подходит именно вам.</p></div></article><article><span>03</span><div><h3>Уважаем время</h3><p>Запись по времени и спокойный сервис без ожидания в очереди.</p></div></article></div>
      </section>

      <section className="reviews section-pad" id="reviews">
        <div className="section-top"><div><p className="eyebrow">Отзывы гостей</p><h2>После <em>BRUT.</em></h2></div><p>Скоро здесь появятся истории гостей о своих мастерах и стрижках.</p></div>
        <div className="review-pending"><span>ОТЗЫВЫ</span><p>Место для ваших впечатлений.</p></div>
      </section>

      <section className="booking section-pad" id="booking"><p className="eyebrow">Ваше кресло ждёт</p><h2>Время привести<br /><em>себя в форму.</em></h2><a className="button button-light" href="/book">ЗАПИСАТЬСЯ <span>↗</span></a><p>Ежедневно · 10:00—22:00</p></section>

      <section className="contacts section-pad" id="contacts"><div><p className="eyebrow">Найдите нас</p><h2>До встречи<br /><em>в BRUT.</em></h2><p className="address">Ташкент<br />Адрес и телефон скоро появятся</p><a className="underlink" href="https://maps.google.com/?q=barbershop+Tashkent" target="_blank" rel="noreferrer">Открыть карту Ташкента <span>↗</span></a></div><div className="contact-image"><Image src="/images/barbershop.png" alt="Барбер-зона в интерьере BRUT" fill sizes="(max-width: 700px) 100vw, 50vw" /></div></section>

      <footer className="site-footer"><a className="footer-logo" href="#top">BRUT<span>.</span></a><span>ТАШКЕНТ · 10:00—22:00</span><a href="#top">НАВЕРХ ↑</a><small>© 2026 BRUT BARBERSHOP</small></footer>
    </main>
    </SmoothScroll>
    </>
  );
}
