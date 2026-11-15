"use client";
import { useEffect } from "react";
import { clampPointer, isPointerFxEnabled, pointerSmooth, pointerTarget } from "@/lib/pointer";

/**
 * Global pointer loop: one rAF, zero setState. Writes normalized
 * --pnx/--pny CSS vars (drives shell parallax) and the shared store
 * (drives the R3F Earth). Disabled on touch / reduced-motion.
 */
export function usePointerMotion() {
  useEffect(() => {
    if (!isPointerFxEnabled()) return;
    const root = document.documentElement;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let queued = false;

    const onMove = (e: PointerEvent) => {
      tx = clampPointer((e.clientX / window.innerWidth) * 2 - 1);
      ty = clampPointer((e.clientY / window.innerHeight) * 2 - 1);
      if (!queued) {
        queued = true;
        requestAnimationFrame(apply);
      }
    };
    const apply = () => {
      queued = false;
      pointerTarget.x = tx;
      pointerTarget.y = ty;
      root.style.setProperty("--pnx", tx.toFixed(4));
      root.style.setProperty("--pny", ty.toFixed(4));
    };
    const loop = () => {
      // Damped follow (~0.08) for the 3D layer: heavy, cinematic, inertial.
      pointerSmooth.x += (pointerTarget.x - pointerSmooth.x) * 0.08;
      pointerSmooth.y += (pointerTarget.y - pointerSmooth.y) * 0.08;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      root.style.removeProperty("--pnx");
      root.style.removeProperty("--pny");
    };
  }, []);
}
