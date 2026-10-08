"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, useGSAP);

function headerOffset() {
  return window.matchMedia("(max-width: 680px)").matches ? "top 66px" : "top 78px";
}

function scrollToHash(smoother: ScrollSmoother, hash: string) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  if (!hash || hash === "#top") smoother.scrollTo(0, true);
  else {
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) smoother.scrollTo(target, true, headerOffset());
  }
  root.style.scrollBehavior = previous;
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const smoother = ScrollSmoother.create({
        wrapper: wrapper.current,
        content: content.current,
        smooth: 1,
        smoothTouch: false,
        effects: true,
      });

      const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = (event.target as Element | null)?.closest("a");
        if (!link || link.target === "_blank") return;
        const href = link.getAttribute("href");
        if (!href?.includes("#")) return;
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
        const id = decodeURIComponent(url.hash.slice(1));
        if (id && id !== "top" && !document.getElementById(id)) return;
        event.preventDefault();
        scrollToHash(smoother, url.hash);
        if (window.location.hash !== url.hash) history.pushState(null, "", url.hash);
      };

      const onPop = () => scrollToHash(smoother, window.location.hash);
      document.addEventListener("click", onClick);
      window.addEventListener("popstate", onPop);
      const pending = gsap.delayedCall(0.7, () => {
        if (window.location.hash) scrollToHash(smoother, window.location.hash);
      });

      return () => {
        pending.kill();
        document.removeEventListener("click", onClick);
        window.removeEventListener("popstate", onPop);
        smoother.kill();
      };
    });
    return () => media.revert();
  }, []);

  return (
    <div id="smooth-wrapper" ref={wrapper}>
      <div id="smooth-content" ref={content}>{children}</div>
    </div>
  );
}
