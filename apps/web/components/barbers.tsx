"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { BarberCard } from "../lib/catalog";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function Barbers({ barbers }: { barbers: BarberCard[] }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (min-width: 768px)", () => {
      const track = root.current?.querySelector<HTMLElement>(".barber-grid");
      const viewport = track?.parentElement;
      if (!track || !viewport) return;
      const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
      gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top 78px",
          end: () => "+=" + distance(),
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    });
    return () => media.revert();
  }, { scope: root });

  return (
    <section className="barbers section-pad" id="barbers" ref={root}>
      <div className="section-top"><div><p className="eyebrow">Команда BRUT</p><h2>Шесть мастеров.<br /><em>Один стандарт.</em></h2></div><p>Выберите своего барбера. Каждый работает в собственном стиле и внимательно относится к деталям.</p></div>
      <div className="barber-viewport">
        <div className="barber-grid">
          {barbers.map((barber, index) => (
            <Link className="barber-card" href={`/barbers/${barber.id}`} key={barber.id}>
              <div className="barber-photo" role="img" aria-label={`Портрет барбера ${barber.name}`} style={{ backgroundImage: `url('${barber.image}')`, backgroundPosition: `${barber.panel * 50}% center` }}><span>0{index + 1}</span></div>
              <div className="barber-meta"><h3>{barber.name}</h3><p>{barber.role}</p><p className="barber-exp">{barber.experience}</p><p className="barber-fact">{barber.fact}</p></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
