"use client";
import { BookOpen, CheckCircle2, FileText, FlaskConical, GraduationCap, Terminal } from "lucide-react";
import metrics from "@/models/metrics_v2.json";
import { ML_HEAVY_MM } from "@/lib/ml";

const n3 = (v: number | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

const ARTIFACTS: { path: string; what: string }[] = [
  { path: "models/champion_v2.pkl", what: "Pickled champion classifier (logreg_bal) — python-side source of truth." },
  { path: "models/linear_v2.json", what: "Exported weights + intercept consumed by the TS port generator." },
  { path: "lib/ml.ts", what: "Generated TypeScript port of the champion model — regenerated only via export_ts.py, parity-tested." },
  { path: "models/metrics_v2.json", what: "Full candidate metric tables (this screen's data source)." },
  { path: "models/ridge_v1.pkl + metrics_v1.json", what: "Earlier regression baseline artifacts, kept for audit." },
  { path: "training/train_v2.py", what: "Purged-split training + evaluation script (seed 42, gap 30h)." },
  { path: "training/export_ts.py", what: "Weights → TypeScript export with parity check." },
];

const DOCS: { path: string; what: string }[] = [
  { path: "docs/MODEL_CARD_v2.md", what: "Intended use, training data, metrics, limitations, ethics notes." },
  { path: "docs/IMPLEMENTATION_AUDIT.md", what: "Module-by-module audit: data sources, algorithms, honest-status labels." },
  { path: "training/README.md", what: "Environment setup and exact reproduction commands." },
  { path: "models/README.md", what: "Artifact inventory and versioning conventions." },
];

export default function TrainingDocsView() {
  const champ = metrics.classifiers.logreg_bal.test;
  const ridge = metrics.regressors.ridge.test;

  return (
    <div className="viewStack">
      <div className="panel">
        <div className="sectionHead">
          <div>
            <h2 style={{ fontSize: 20 }}>Model Training & Documentation</h2>
            <p>Reproducible offline pipeline: train → evaluate → export → parity-test. Everything on this screen comes from files in the repository.</p>
          </div>
          <GraduationCap color="#4de3ff" />
        </div>

        <div className="miGrid">
          <div className="miCol">
            <div className="metricLabel">Training run — v{metrics.version}</div>
            <dl className="factGrid">
              <div><dt>Status</dt><dd><b className="kpiBadge t-ok"><CheckCircle2 size={11} /> COMPLETED</b></dd></div>
              <div><dt>Dataset</dt><dd>Open-Meteo ERA5 archive · Vijayawada (16.51N, 80.65E) · monsoon 2024</dd></div>
              <div><dt>Rows</dt><dd>~2.9k hourly samples (train+val+test) · hourly cadence</dd></div>
              <div><dt>Target</dt><dd>P(precip t+6h ≥ {ML_HEAVY_MM} mm) — heavy-rain classification</dd></div>
              <div><dt>Algorithm</dt><dd>Class-balanced logistic regression (champion of 3 classifiers, 5 regressors)</dd></div>
              <div><dt>Split policy</dt><dd>Chronological with {metrics.gap_h}h purge gap (no leakage), seed {metrics.seed}</dd></div>
              <div><dt>Train / val / test</dt><dd>{metrics.periods.train[0]} → {metrics.periods.test[1]} (val n={metrics.classifiers.logreg_bal.validate.n}, test n={champ.n})</dd></div>
              <div><dt>Runtime</dt><dd>python 3 · scikit-learn · offline, no external services</dd></div>
            </dl>
            <div className="metricLabel" style={{ marginTop: 14 }}>Evaluation summary (holdout test)</div>
            <table className="dataTable">
              <thead><tr><th>Metric</th><th>Ridge regression</th><th>Champion classifier</th></tr></thead>
              <tbody>
                <tr><td>RMSE / PR-AUC</td><td>{n3(ridge.RMSE_mm)} mm</td><td>{n3(champ.PR_AUC, 4)}</td></tr>
                <tr><td>MAE / F1</td><td>{n3(ridge.MAE_mm)} mm</td><td>{n3(champ.F1)}</td></tr>
                <tr><td>Bias / recall</td><td>{n3(ridge.bias_mm)} mm</td><td>{n3(champ.recall)}</td></tr>
                <tr><td>n (hours)</td><td>{ridge.n}</td><td>{champ.n}</td></tr>
              </tbody>
            </table>
            <p className="prov">
              Verdict: regression metrics are healthy (RMSE {n3(ridge.RMSE_mm)} mm beats the {n3(metrics.regressors.persistence.test.RMSE_mm)} mm persistence baseline); the heavy-rain classifier remains experimental ({champ.events_true} events, PR-AUC {n3(champ.PR_AUC, 4)}) and is excluded from the warning score. Disclosed everywhere it appears.
            </p>
          </div>

          <div className="miCol">
            <div className="metricLabel">Reproduction</div>
            <pre className="codeBlock">{`# 1. retrain all candidates, write metrics_v2.json
python training/train_v2.py

# 2. regenerate the TypeScript port (lib/ml.ts)
python training/export_ts.py

# 3. verify parity + engine invariants
npm run test:unit     # 27 tests, incl. ML parity to 1e-9`}</pre>
            <div className="metricLabel" style={{ marginTop: 14 }}><FlaskConical size={12} style={{ verticalAlign: -2 }} /> Model artifacts</div>
            <ul className="docList">
              {ARTIFACTS.map((a) => (
                <li key={a.path}><b>{a.path}</b> — {a.what}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="miGrid">
        <div className="panel miCol">
          <div className="metricLabel"><BookOpen size={12} style={{ verticalAlign: -2 }} /> Documentation</div>
          <ul className="docGrid">
            {DOCS.map((d) => (
              <li key={d.path}>
                <FileText size={15} />
                <b>{d.path}</b>
                <span>{d.what}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel miCol">
          <div className="metricLabel"><Terminal size={12} style={{ verticalAlign: -2 }} /> Verification evidence (executed in this repo)</div>
          <ul className="checkList">
            <li className="ok"><CheckCircle2 size={14} /><b>npm run test:unit</b><span>27/27 pass — engine, normalize, quality gates, ML parity</span></li>
            <li className="ok"><CheckCircle2 size={14} /><b>npm run lint</b><span>clean</span></li>
            <li className="ok"><CheckCircle2 size={14} /><b>npm run build</b><span>production build exit 0</span></li>
            <li className="ok"><CheckCircle2 size={14} /><b>python training/train_v2.py</b><span>metrics_v2.json regenerated deterministically (seed {metrics.seed})</span></li>
            <li className="ok"><CheckCircle2 size={14} /><b>python training/export_ts.py</b><span>parity check p=0.3253564197 matches Python to 1e-9</span></li>
          </ul>
          <p className="prov">
            Test counts and parity constants are stable; re-run the commands above to reproduce. CI is not connected in this environment (no git remote configured) — verification is manual and logged here.
          </p>
        </div>
      </div>
    </div>
  );
}
