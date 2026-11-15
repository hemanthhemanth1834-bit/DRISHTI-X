"use client";
import { useEffect, useRef, useState } from "react";
import { isPointerFxEnabled } from "@/lib/pointer";

const TRAIL = 4;
const TILT_SEL = ".rCard,.bCol,.railBtn,.metric,.sourcePanel,.model,.explain";

/**
 * Holographic scanner light + minimal trail + click pulse + delegated
 * card tilt/spotlight. All refs + rAF; pointer-events never intercepted.
 * Rendered only when pointer FX is enabled (fine pointers, no reduced motion).
 */
export default function CursorGlow() {
  const [on, setOn] = useState(false);
  const glow = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLDivElement | null)[]>([]);
  const pulses = useRef<HTMLDivElement>(null);
  const lastCard = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const enabled = isPointerFxEnabled();
    setOn(enabled);
    if (!enabled) return;
    let raf = 0;
    const px = { x: -999, y: -999, gx: -999, gy: -999 };
    const trail: { x: number; y: number }[] = Array.from({ length: TRAIL }, () => ({ x: -999, y: -999 }));

    const onMove = (e: PointerEvent) => {
      px.x = e.clientX;
      px.y = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      // Subtle expanding ring, 500ms, capped — no explosions.
      if (!pulses.current) return;
      const s = document.createElement("span");
      s.className = "clickPulse";
      s.style.left = `${e.clientX}px`;
      s.style.top = `${e.clientY}px`;
      pulses.current.appendChild(s);
      while (pulses.current.children.length > 5) pulses.current.firstChild?.remove();
      setTimeout(() => s.remove(), 600);
    };
    const onCard = (e: PointerEvent) => {
      // Delegated spotlight + tilt: writes CSS vars on the card element only.
      const t = e.target as Element | null;
      const card = t?.closest?.(TILT_SEL) as HTMLElement | null;
      if (lastCard.current && lastCard.current !== card) {
        for (const k of ["--mx", "--my", "--rx", "--ry"]) lastCard.current.style.removeProperty(k);
      }
      lastCard.current = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      if (r.width === 0) return;
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${Math.round(nx * 100)}%`);
      card.style.setProperty("--my", `${Math.round(ny * 100)}%`);
      card.style.setProperty("--rx", `${((0.5 - ny) * 6).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((nx - 0.5) * 6).toFixed(2)}deg`);
    };

    const loop = () => {
      // Glow follows with delay (lerp 0.2); trail dots cascade behind it.
      px.gx += (px.x - px.gx) * 0.2;
      px.gy += (px.y - px.gy) * 0.2;
      if (glow.current) glow.current.style.transform = `translate3d(${px.gx - 110}px,${px.gy - 110}px,0)`;
      trail.unshift({ x: px.gx, y: px.gy });
      trail.pop();
      dots.current.forEach((d, i) => {
        if (!d) return;
        const t = trail[Math.min(i + 1, trail.length - 1)];
        d.style.transform = `translate3d(${t.x - 3}px,${t.y - 3}px,0)`;
        d.style.opacity = `${0.35 - i * 0.08}`;
      });
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointermove", onCard, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", onCard);
      window.removeEventListener("pointerdown", onDown);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!on) return null;
  return (
    <>
      <div ref={glow} className="cursorGlow" aria-hidden />
      {Array.from({ length: TRAIL }, (_, i) => (
        <div
          key={i}
          ref={(d) => {
            dots.current[i] = d;
          }}
          className="cursorDot"
          aria-hidden
        />
      ))}
      <div ref={pulses} className="pulseLayer" aria-hidden />
    </>
  );
}
