"use client";
import type { SourceStatus } from "@/lib/locations";
import { StatusDot } from "./StatusBar";

/** SIH presentation aid: the live pipeline with per-stage status. No redesign, no fake data. */
export default function PipelineTrace({ stages }: { stages: { name: string; status: SourceStatus; note: string }[] }) {
  return (
    <ol className="pipeTrace" aria-label="Data pipeline: ingestion to early warning">
      {stages.map((s, i) => (
        <li key={s.name}>
          <span className="pipeDot"><StatusDot status={s.status} /></span>
          <span className="pipeName">{s.name}</span>
          <span className="pipeNote">{s.note}</span>
          {i < stages.length - 1 && <span className="pipeArrow" aria-hidden>↓</span>}
        </li>
      ))}
    </ol>
  );
}
