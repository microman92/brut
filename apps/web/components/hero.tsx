"use client";

import Image from "next/image";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    const trigger = root.current;
    media.add("(prefers-reduced-motion: no-preference) and (min-width: 768px)", () => {
      gsap.fromTo(".hero-frame", { clipPath: "inset(9% 8% 9% 8%)" }, {
        clipPath: "inset(0% 0% 0% 0%)",
        ease: "none",
        scrollTrigger: { trigger, start: "top top", end: "bottom bottom", scrub: 0.7, pin: ".hero-stage", pinSpacing: false },
      });
      gsap.fromTo(".hero-photo", { scale: 1.12 }, {
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger, start: "top top", end: "bottom bottom", scrub: 0.7 },
      });
    });
    return () => media.revert();
  }, { scope: root });

  return (
    <section className="hero-scroll" ref={root}>
      <div className="hero-stage">
        <div className="hero-frame">
          <Image className="hero-photo" src="/images/barbershop.png" alt="Кресло барбера в интерьере BRUT" fill preload sizes="100vw" />
          <div className="hero-overlay" />
          <div className="hero-content"><p className="eyebrow">БАРБЕРШОП · ТАШКЕНТ</p><h1>СИЛА<br />В <em>ФОРМЕ.</em></h1><p className="hero-subtitle">Место для точной работы<br />и своего ритма.</p><a className="button button-light" href="/book">ЗАПИСАТЬСЯ <span>↗</span></a></div>
          <div className="hero-bottom"><span>41°17′ С.Ш. · ТАШКЕНТ</span><a href="#work">СМОТРЕТЬ РАБОТЫ ↓</a><span>01 — 06</span></div>
          <span className="hero-side" aria-hidden="true">BRUT BARBERSHOP · TASHKENT</span>
        </div>
      </div>
    </section>
  );
}
