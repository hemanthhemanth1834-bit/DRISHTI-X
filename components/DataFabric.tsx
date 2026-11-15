"use client";
import { useState } from "react";
import { Radio } from "lucide-react";
import type { SourceStatus } from "@/lib/locations";
import { ageLabel, fmtIST } from "@/lib/format";
import { StatusDot } from "./StatusBar";

export interface FabricSource {
  name: string;
  kind: string;
  status: SourceStatus;
  source?: string;
  lastUpdate?: string;
  dataType?: string;
  resolution?: string;
}

export default function DataFabric({ sources }: { sources: FabricSource[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="panel sourcePanel">
      <div className="sectionHead" style={{ marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 17 }}>Data Fabric</h2>
          <p>Click a source for provenance</p>
        </div>
        <Radio size={17} />
      </div>
      {sources.map((s) => (
        <div key={s.name}>
          <button className="sourceRowBtn" onClick={() => setOpen((o) => (o === s.name ? null : s.name))} aria-expanded={open === s.name}>
            <span>
              <span className="sourceName">{s.name}</span>
              <span className="sourceMeta">{s.kind}</span>
            </span>
            <span className="srcRight">
              <StatusDot status={s.status} />
              <span className="srcStatus">{s.status}</span>
            </span>
          </button>
          {open === s.name && (
            <dl className="srcDetail">
              <div><dt>Source</dt><dd>{s.source ?? s.name}</dd></div>
              <div><dt>Last update</dt><dd>{s.lastUpdate ? `${fmtIST(s.lastUpdate)} (${ageLabel(s.lastUpdate)}) — client fetch time; provider publication time unpublished` : "—"}</dd></div>
              <div><dt>Data type</dt><dd>{s.dataType ?? s.kind}</dd></div>
              <div><dt>Resolution</dt><dd>{s.resolution ?? "—"}</dd></div>
              <div><dt>Status</dt><dd>{s.status}</dd></div>
            </dl>
          )}
        </div>
      ))}
      <p className="prov">Data availability and latency depend on upstream providers.</p>
    </div>
  );
}
