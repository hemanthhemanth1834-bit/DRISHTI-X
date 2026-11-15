"use client";
import { useState } from "react";
import { Activity, AlertTriangle, BrainCircuit, GitBranch, Gauge, ListTree, Ruler, Target, TrendingDown } from "lucide-react";
import metrics from "@/models/metrics_v2.json";
import { ML_FEATURES, ML_HEAVY_MM, ML_LOGREG_COEF, ML_VALIDATION, ML_VERSION } from "@/lib/ml";
import { FEATURE_DOCS } from "@/lib/engine";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import KpiRow, { type Kpi } from "./KpiRow";
import NwpPanel from "./NwpPanel";

interface Split {
  n?: number;
  MAE_mm?: number;
  RMSE_mm?: number;
  bias_mm?: number;
  precision?: number;
  recall?: number;
  F1?: number;
  false_alarm_rate?: number;
  events_true?: number;
  PR_AUC?: number;
  brier?: number;
}
type RegModel = { validate: Split; test: Split };

const REG = metrics.regressors as Record<string, RegModel>;
const CLF = metrics.classifiers as Record<string, RegModel>;
const REG_NAMES: Record<string, string> = {
  persistence: "Persistence baseline",
  ridge: "Ridge regression",
  random_forest: "Random forest",
  extra_trees: "Extra trees",
  hgb: "Histogram gradient boosting",
};
const CLF_NAMES: Record<string, string> = {
  logreg_bal: "Logistic regression (balanced)",
  rf_clf_bal: "Random forest classifier (balanced)",
  hgb_clf_bal: "HGB classifier (balanced)",
};

const n3 = (v: number | null | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

type Tab = "performance" | "comparison" | "features" | "card";

export default function ModelInsightsView({
  analysis,
  live,
  label,
  onRefreshAnalysis,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
  onRefreshAnalysis: () => void;
}) {
  const [tab, setTab] = useState<Tab>("performance");
  const ml = analysis?.ml;
  const ridge = REG.ridge.test;
  const champ = CLF.logreg_bal.test;

  const kpis: Kpi[] = [
    { icon: <Ruler size={17} />, label: "Test RMSE (ridge)", value: n3(ridge.RMSE_mm), unit: " mm", sub: "v1.1 persistence baseline 1.31 mm", tone: "info" },
    { icon: <Activity size={17} />, label: "Test MAE (ridge)", value: n3(ridge.MAE_mm), sub: `n=${ridge.n} holdout hours`, tone: "info" },
    { icon: <Gauge size={17} />, label: "Heavy-rain PR-AUC", value: n3(champ.PR_AUC, 4), sub: `${champ.events_true} events / n=${champ.n}`, tone: "watch", badge: "EXPERIMENTAL" },
    { icon: <TrendingDown size={17} />, label: "False-alarm rate", value: n3(champ.false_alarm_rate, 4), sub: "champion classifier holdout", tone: "watch" },
  ];

  return (
    <div className="viewStack">
      <div className="panel modelInsights">
        <div className="sectionHead">
          <div>
            <h2 style={{ fontSize: 20 }}>Model Insights</h2>
            <p>
              Validated v2 artifacts in models/ — champion <b>{metrics.selection.champion}</b> (selection: {metrics.selection.policy}). The experimental signal is displayed beside its holdout metrics and never feeds the warning score.
            </p>
          </div>
          <BrainCircuit color="#9b6cff" />
        </div>
        <KpiRow items={kpis} />
        <div className="tabsBar" role="tablist" aria-label="Model insight sections">
          {([
            ["performance", "PERFORMANCE"],
            ["comparison", "MODEL COMPARISON"],
            ["features", "FEATURE IMPORTANCE"],
            ["card", "MODEL CARD & RUNS"],
          ] as [Tab, string][]).map(([id, name]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
              {name}
            </button>
          ))}
        </div>

        {tab === "performance" && (
          <div className="miGrid">
            <div className="miCol">
              <div className="metricLabel">Live experimental signal — {label}</div>
              {ml ? (
                <div className="miLive">
                  <div className="miBig">{ml.p == null ? "INSUFFICIENT HISTORY" : `${(ml.p * 100).toFixed(1)}%`}</div>
                  <p className="prov" style={{ marginTop: 4 }}>{ml.model} · {ml.target}. {ml.note}</p>
                </div>
              ) : (
                <p className="unavail">LIVE SIGNAL UNAVAILABLE — analysis offline.</p>
              )}
              <div className="metricLabel" style={{ marginTop: 14 }}>Champion classifier — holdout splits (logreg_bal)</div>
              <table className="dataTable">
                <thead>
                  <tr><th>Split</th><th>n</th><th>Events</th><th>Precision</th><th>Recall</th><th>F1</th><th>FAR</th><th>PR-AUC</th><th>Brier</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Validation</td><td>{CLF.logreg_bal.validate.n}</td><td>{CLF.logreg_bal.validate.events_true}</td>
                    <td>{n3(CLF.logreg_bal.validate.precision)}</td><td>{n3(CLF.logreg_bal.validate.recall)}</td>
                    <td>{n3(CLF.logreg_bal.validate.F1)}</td><td>{n3(CLF.logreg_bal.validate.false_alarm_rate)}</td>
                    <td>{n3(CLF.logreg_bal.validate.PR_AUC, 4)}</td><td>{n3(CLF.logreg_bal.validate.brier, 5)}</td>
                  </tr>
                  <tr>
                    <td>Test</td><td>{champ.n}</td><td>{champ.events_true}</td>
                    <td>{n3(champ.precision)}</td><td>{n3(champ.recall)}</td>
                    <td>{n3(champ.F1)}</td><td>{n3(champ.false_alarm_rate)}</td>
                    <td>{n3(champ.PR_AUC, 4)}</td><td>{n3(champ.brier, 5)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="prov">
                The holdout window contains only {champ.events_true} heavy-rain hours; PR-AUC {n3(champ.PR_AUC, 4)} is far below an operational bar. Status: experimental / unvalidated for operations — shown for transparency, never used in the warning.
              </p>
            </div>
            <div className="miCol">
              <div className="metricLabel">Why the live score does not use this signal</div>
              <ul className="docList">
                <li><b>Dependence on data availability</b> — features need 24h of continuous hourly history; gaps return &quot;insufficient history&quot;.</li>
                <li><b>High false-alarm rate</b> — {(ML_VALIDATION.far * 100).toFixed(1)}% of non-events raise alarms at the current threshold.</li>
                <li><b>Few extreme samples</b> — {ML_VALIDATION.events} true events in the {ML_VALIDATION.n}-hour holdout.</li>
                <li><b>Single-station training</b> — weights learned on one archive location (ERA5, Vijayawada 2024); generalization untested.</li>
              </ul>
              <p className="unavail" style={{ color: "#ffd166", borderColor: "rgba(255,200,87,.35)", background: "rgba(255,200,87,.06)" }}>
                <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Model is disclosed as experimental in every surface that displays it (Command Center, Warnings, this panel).
              </p>
            </div>
          </div>
        )}

        {tab === "comparison" && (
          <div className="miCol">
            <div className="metricLabel">Regression candidates — precipitation t+6h (mm), purged chronological split</div>
            <table className="dataTable">
              <thead>
                <tr><th>Model</th><th>Val RMSE</th><th>Test RMSE</th><th>Test MAE</th><th>Test bias</th><th>Status</th></tr>
              </thead>
              <tbody>
                {Object.entries(REG).map(([id, m]) => (
                  <tr key={id} className={id === "ridge" ? "rowHi" : undefined}>
                    <td>{REG_NAMES[id] ?? id}</td>
                    <td>{n3(m.validate.RMSE_mm)}</td>
                    <td>{n3(m.test.RMSE_mm)}</td>
                    <td>{n3(m.test.MAE_mm)}</td>
                    <td>{n3(m.test.bias_mm)}</td>
                    <td>{id === "ridge" ? <b className="kpiBadge t-info">ARTIFACT — ridge_v1.pkl</b> : id === "persistence" ? "baseline" : "not wired"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="metricLabel" style={{ marginTop: 16 }}>Classifier candidates — P(precip t+6h ≥ {ML_HEAVY_MM} mm)</div>
            <table className="dataTable">
              <thead>
                <tr><th>Model</th><th>Val PR-AUC</th><th>Test PR-AUC</th><th>Test F1</th><th>Test recall</th><th>Test FAR</th><th>Status</th></tr>
              </thead>
              <tbody>
                {Object.entries(CLF).map(([id, m]) => (
                  <tr key={id} className={id === metrics.selection.champion ? "rowHi" : undefined}>
                    <td>{CLF_NAMES[id] ?? id}</td>
                    <td>{n3(m.validate.PR_AUC, 4)}</td>
                    <td>{n3(m.test.PR_AUC, 4)}</td>
                    <td>{n3(m.test.F1)}</td>
                    <td>{n3(m.test.recall)}</td>
                    <td>{n3(m.test.false_alarm_rate)}</td>
                    <td>{id === metrics.selection.champion ? <b className="kpiBadge t-ok">CHAMPION — wired via lib/ml.ts</b> : "evaluated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="prov">
              Selection policy: {metrics.selection.policy}. Ranking (validation PR-AUC): {(metrics.selection.ranking as [number, string][]).map(([v, id]) => `${id} ${v.toFixed(4)}`).join(" · ")}. Artifacts: models/metrics_v2.json (this table&apos;s source), models/champion_v2.pkl, models/linear_v2.json.
            </p>
          </div>
        )}

        {tab === "features" && (
          <div className="miGrid">
            <div className="miCol">
              <div className="metricLabel">Champion classifier — logistic coefficients (|β|, normalized)</div>
              {ML_FEATURES.map((f, i) => {
                const c = ML_LOGREG_COEF[i] ?? 0;
                const max = Math.max(...ML_LOGREG_COEF.map((x) => Math.abs(x)), 1e-9);
                return (
                  <div className="xaiRow" key={f}>
                    <span className="xaiName">{f}</span>
                    <div className="bar xaiBar"><span style={{ width: `${Math.round((Math.abs(c) / max) * 100)}%` }} /></div>
                    <b>{c.toFixed(3)}</b>
                  </div>
                );
              })}
              <p className="prov">
                Signed weights of the {ML_VERSION} classifier ({ML_FEATURES.length} features: precipitation lags 1–24h, 24h sum, gap count, hour-of-day sin/cos). Negative lag24 ≈ dry-out after long dry spells; sum24 carries the positive accumulation signal.
              </p>
            </div>
            <div className="miCol">
              <div className="metricLabel">Warning engine — transparent fusion weights (sums to 100)</div>
              {FEATURE_DOCS.map((f) => (
                <div className="xaiRow" key={f.feature} title={`${f.reason} — normalization: ${f.normalization}`}>
                  <span className="xaiName">{f.feature}</span>
                  <div className="bar xaiBar"><span style={{ width: `${(f.weight / 25) * 100}%`, background: "linear-gradient(90deg,#9b6cff,#4d7cff)" }} /></div>
                  <b>{f.weight}</b>
                </div>
              ))}
              <p className="prov">
                The live warning uses these documented weights over plausibility-checked provider inputs — the ML classifier above is displayed separately and excluded from the score.
              </p>
            </div>
          </div>
        )}

        {tab === "card" && (
          <div className="miGrid">
            <div className="miCol">
              <div className="metricLabel">Training run {ML_VERSION}</div>
              <dl className="factGrid">
                <div><dt>Dataset</dt><dd>Open-Meteo ERA5 archive · Vijayawada (16.51N, 80.65E) · 2024 monsoon</dd></div>
                <div><dt>Target</dt><dd>P(precip t+6h ≥ {ML_HEAVY_MM} mm)</dd></div>
                <div><dt>Model</dt><dd>Class-balanced logistic regression (champion)</dd></div>
                <div><dt>Seed</dt><dd>{metrics.seed}</dd></div>
                <div><dt>Purge gap</dt><dd>{metrics.gap_h} h (no hourly leakage across splits)</dd></div>
                <div><dt>Train window</dt><dd>{metrics.periods.train[0]} → {metrics.periods.train[1]}</dd></div>
                <div><dt>Validate window</dt><dd>{metrics.periods.validate[0]} → {metrics.periods.validate[1]} (n={CLF.logreg_bal.validate.n})</dd></div>
                <div><dt>Test window</dt><dd>{metrics.periods.test[0]} → {metrics.periods.test[1]} (n={champ.n})</dd></div>
              </dl>
              <div className="metricLabel" style={{ marginTop: 14 }}>Reproduce</div>
              <pre className="codeBlock">{`python training/train_v2.py      # retrain + metrics_v2.json
python training/export_ts.py     # regenerate lib/ml.ts
npm run test:unit                # 27 tests incl. ML parity`}</pre>
              <button className="tab" onClick={onRefreshAnalysis} style={{ marginTop: 8 }}>↻ REFRESH LIVE SIGNAL</button>
            </div>
            <div className="miCol">
              <div className="metricLabel">Artifacts & documentation</div>
              <ul className="docList">
                <li><b>models/champion_v2.pkl</b> — pickled champion classifier (python-side truth).</li>
                <li><b>models/linear_v2.json</b> — weights/intercept exported for the TS port.</li>
                <li><b>lib/ml.ts</b> — generated TypeScript port (parity-tested to 1e-9 against Python).</li>
                <li><b>models/metrics_v2.json</b> — full metric tables used above.</li>
                <li><b>docs/MODEL_CARD_v2.md</b> — model card: intended use, limitations, ethics.</li>
                <li><b>docs/IMPLEMENTATION_AUDIT.md</b> — reproducibility audit of every module.</li>
                <li><b>training/README.md</b> — environment + run instructions.</li>
              </ul>
              <div className="metricLabel" style={{ marginTop: 14 }}>Known limitations (disclosed)</div>
              <ul className="docList">
                <li>Five holdout heavy-rain events — metrics carry wide uncertainty.</li>
                <li>Reanalysis inputs (ERA5) trained offline; live inputs come from forecast reanalysis — distribution shift possible.</li>
                <li>Probabilities are raw sigmoid scores, not calibrated frequencies.</li>
                <li>One climatology — no spatial cross-validation yet.</li>
              </ul>
              <div className="miStatus">
                <span className="kpiBadge t-ok"><Target size={11} /> pipeline reproducible</span>
                <span className="kpiBadge t-watch"><GitBranch size={11} /> single-location training</span>
                <span className="kpiBadge t-watch"><ListTree size={11} /> experimental only</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <NwpPanel
          models={analysis?.models}
          agreement01={analysis?.agreement01}
          spreadMM={analysis?.spreadMM}
          consensus={analysis?.consensus}
          locationLabel={`${label} (${analysis?.lat?.toFixed(2) ?? "—"}, ${analysis?.lon?.toFixed(2) ?? "—"})`}
          windowNote={analysis?.nwpWindowNote ?? `common ${analysis?.nwpWindowH ?? 0}h window`}
          onRefresh={onRefreshAnalysis}
        />
      </div>
      {!live && <p className="unavail">LIVE ANALYSIS OFFLINE — artifact metrics above are static validated values; the live signal card resumes with the next successful fetch.</p>}
    </div>
  );
}
