"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const works = [
  { title: "Низкий fade", text: "Короткий висок и плотный верх, переход без полосы.", time: "45 мин", price: "150 000", panel: 0 },
  { title: "Контур бороды", text: "Шея и щека по линии челюсти, опасной бритвой.", time: "30 мин", price: "100 000", panel: 1 },
  { title: "Текстура сверху", text: "Ножницы по длине, направление волос остаётся своим.", time: "45 мин", price: "150 000", panel: 2 },
  { title: "Классика", text: "Спокойный силуэт, который держится без лака.", time: "45 мин", price: "150 000", panel: 0 },
  { title: "Борода и стрижка", text: "Одна линия от виска до бороды, без отдельного контура.", time: "75 мин", price: "220 000", panel: 1 },
  { title: "Плотная укладка", text: "Короткая макушка, которую можно повторить дома.", time: "45 мин", price: "150 000", panel: 2 },
];

export default function Works() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (min-width: 768px)", () => {
      const track = root.current?.querySelector<HTMLElement>(".work-gallery");
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
    <section className="work section-pad" id="work" ref={root}>
      <div className="section-top"><div><p className="eyebrow">Работы</p><h2>Говорит <em>форма.</em></h2></div><p>Никаких случайных линий. Посмотрите, как выглядит аккуратная работа.</p></div>
      <div className="work-viewport">
        <div className="work-gallery" aria-label="Примеры работ барберов">
          {works.map((work) => (
            <article className="work-tile" key={work.title} style={{ backgroundPosition: `${work.panel * 50}% center` }}>
              <div className="work-info">
                <h3>{work.title}</h3>
                <p>{work.text}</p>
                <div className="work-spec"><span>{work.time}</span><span>{work.price} сум</span></div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <p className="gallery-note">Листайте, чтобы посмотреть работы <span>→</span></p>
    </section>
  );
}
