import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app" style={{ display: "grid", placeItems: "center", minHeight: "60vh", textAlign: "center", padding: 40 }}>
      <div>
        <div className="metricLabel">404 — signal not found</div>
        <h2 style={{ fontFamily: "Space Grotesk", fontSize: 32, margin: "12px 0" }}>No inundation data at this coordinate.</h2>
        <p style={{ color: "#91a0b7", fontSize: 13 }}>The requested view does not exist. Return to the DRISHTI-X command center.</p>
        <Link className="btn primary" href="/" style={{ display: "inline-block", marginTop: 18, textDecoration: "none" }}>
          Back to Command Center
        </Link>
      </div>
    </main>
  );
}
