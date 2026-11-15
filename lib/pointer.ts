/**
 * Shared pointer-motion store. Mutable refs only — never React state —
 * so 60Hz pointer updates never re-render the tree.
 * Normalized: center = 0, left/top = -1, right/bottom = +1.
 */

export const pointerTarget = { x: 0, y: 0 };
/** Lerp-smoothed copy, updated by the global rAF loop. */
export const pointerSmooth = { x: 0, y: 0 };

let cached: boolean | null = null;

/** False on touch devices and when the user prefers reduced motion. */
export function isPointerFxEnabled(): boolean {
  if (cached != null) return cached;
  if (typeof window === "undefined" || typeof matchMedia === "undefined") {
    cached = false;
    return cached;
  }
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  cached = !coarse && !reduced;
  return cached;
}

export const clampPointer = (v: number) => Math.min(1, Math.max(-1, v));
