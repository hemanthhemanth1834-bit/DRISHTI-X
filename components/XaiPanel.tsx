"use client";
import { BrainCircuit } from "lucide-react";
import { ENGINE_LABEL, ENGINE_NOTE, RISK_FORMULA, WARNING_SYSTEM, type EngineOutput } from "@/lib/engine";

export interface MlSignal {
  p: number | null;
  complete: boolean;
  model: string;
  target: string;
  validation: { pr_auc: number; far: number; events: number; n: number };
  note: string;
}

export default function XaiPanel({ risk, live, ml }: { risk?: EngineOutput; live: boolean; ml?: MlSignal | null }) {
  if (!risk || !live) {
    return (
      <div className="panel explain">
        <div className="metricLabel">Why this warning?</div>
        <p className="unavail">Explainability trace appears once live inputs arrive.</p>
      </div>
    );
  }
  return (
    <div className="panel explain">
      <div className="sectionHead">
        <div>
          <h2 style={{ fontSize: 20 }}>Why this warning?</h2>
          <p>Explainable fusion — every point traced to a measured input ({WARNING_SYSTEM})</p>
        </div>
        <BrainCircuit color="#9b6cff" />
      </div>
      <p className="prov" style={{ marginTop: 0 }}>{RISK_FORMULA}</p>
      {risk.renormNote && <p className="unavail" style={{ color: "#ffd166", borderColor: "rgba(255,200,87,.35)", background: "rgba(255,200,87,.06)" }}>{risk.renormNote}</p>}
      <div className="xaiRows">
        {risk.contributions.map((c) => (
          <div className="xaiRow" key={c.feature}>
            <span className="xaiName" title={c.detail}>{c.feature}{c.available ? "" : " (n/a)"}</span>
            <div className="bar xaiBar"><span style={{ width: c.available && c.effectiveWeight > 0 ? `${Math.round((c.points / c.effectiveWeight) * 100)}%` : "0%" }} /></div>
            <b>{c.points.toFixed(1)}<em>/{c.effectiveWeight.toFixed(1)}</em></b>
          </div>
        ))}
      </div>
      <div className="inundBox">
        <div className="metricLabel">Inundation intelligence — {risk.inundation.class} (MODEL ESTIMATE — NOT OBSERVED FLOOD EXTENT)</div>
        <div className="inundGrid">
          {risk.inundation.factors.map((f) => (
            <div key={f.name} className="reason"><b>{f.name}</b>{f.value}</div>
          ))}
        </div>
        <p className="prov">{risk.inundation.terrainNote}</p>
      </div>
      <p className="proto">{ENGINE_LABEL} — {ENGINE_NOTE}</p>
      {ml && (
        <div className="inundBox">
          <div className="metricLabel">
            Experimental ML signal — {ml.model} · {ml.target}: {ml.p == null ? "insufficient history" : `${(ml.p * 100).toFixed(1)}%`}
          </div>
          <p className="prov">
            Holdout PR-AUC {ml.validation.pr_auc}, false-alarm rate {ml.validation.far} ({ml.validation.events} events / n={ml.validation.n}). {ml.note} Excluded from the warning score by design.
          </p>
        </div>
      )}
    </div>
  );
}
