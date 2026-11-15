/**
 * Exact-window accumulation with explicit missing-data semantics.
 *
 * A total is returned only when every expected hour is present. Partial sums
 * are never relabelled as a complete window; callers receive coverage so the
 * UI can disclose gaps instead of substituting zero.
 */
export interface WindowSum {
  value: number | null;
  missing: number;
  expected: number;
  coverage01: number;
}

export function sumWindow(
  arr: (number | null)[],
  nowIdx: number,
  hours: number,
  past = false
): WindowSum {
  const start = past ? nowIdx - hours : nowIdx;
  const end = past ? nowIdx : nowIdx + hours;
  let sum = 0;
  let missing = 0;
  for (let i = start; i < end; i++) {
    const v = i >= 0 && i < arr.length ? arr[i] : null;
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
    else missing++;
  }
  return {
    value: missing === 0 ? Math.round(sum * 10) / 10 : null,
    missing,
    expected: hours,
    coverage01: Math.round(((hours - missing) / hours) * 100) / 100,
  };
}
