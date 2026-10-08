import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "../../../components/site-header";
import { loadBarber, type BarberCard } from "../../../lib/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let barber: BarberCard | null = null;
  try {
    barber = await loadBarber(slug);
  } catch {
    return { title: "Мастер недоступен — BRUT" };
  }
  if (!barber) return { title: "Мастер не найден — BRUT" };
  return { title: `${barber.name} — BRUT`, description: barber.fact };
}

export default async function BarberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let barber: BarberCard | null = null;
  try {
    barber = await loadBarber(slug);
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="master-page"><p>Список мастеров сейчас недоступен. Запустите API: npm run dev:api</p></main>
      </>
    );
  }
  if (!barber) notFound();

  return (
    <>
      <SiteHeader />
      <main className="master-page">
        <div className="master-photo" role="img" aria-label={`Портрет барбера ${barber.name}`} style={{ backgroundImage: `url('${barber.image}')`, backgroundPosition: `${barber.panel * 50}% center` }} />
        <div>
          <p className="eyebrow">Мастер · {String(barber.sortOrder).padStart(2, "0")}</p>
          <h1>{barber.name}</h1>
          <p className="master-role">{barber.role}</p>
          <p className="master-exp">{barber.experience} в кресле · Ташкент</p>
          <p className="master-bio">{barber.bio}</p>
          <div className="master-services">
            {barber.services.map((service) => (
              <article key={service.name}>
                <h2>{service.name}</h2>
                <span>{service.time}</span>
                <b>{service.price}<small> сум</small></b>
              </article>
            ))}
          </div>
          <a className="button button-light" href="/book">ЗАПИСАТЬСЯ <span>↗</span></a>
          <a className="underlink" href="/#barbers">Все мастера</a>
        </div>
      </main>
      <footer className="site-footer"><a className="footer-logo" href="/">BRUT<span>.</span></a><span>ТАШКЕНТ · 10:00—22:00</span><a href="/#top">НАВЕРХ ↑</a><small>© 2026 BRUT BARBERSHOP</small></footer>
    </>
  );
}
