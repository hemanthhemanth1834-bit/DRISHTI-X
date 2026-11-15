"use client";
import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/** Isolates one dashboard panel: a provider failure shows UNAVAILABLE instead of crashing the command center. */
export default class PanelBoundary extends Component<{ name: string; children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    // Log for diagnostics; UI degrades to the fallback below.
    console.error(`[DRISHTI-X] panel "${this.props.name}" failed:`, err);
  }

  render() {
    if (this.state.failed) {
      return <p className="unavail">{this.props.name} DATA UNAVAILABLE — panel isolated, rest of the command center continues.</p>;
    }
    return this.props.children;
  }
}
