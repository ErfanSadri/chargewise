import type { HealthResponse } from "@chargewise/shared";
import { useEffect, useState } from "react";

import { getHealth } from "../api/health-client.ts";
import "./DiagnosticsPage.css";

type DiagnosticsState =
  | {
      status: "loading";
    }
  | {
      status: "loaded";
      health: HealthResponse;
    }
  | {
      status: "error";
    };

function HealthDetails({ health }: { health: HealthResponse }) {
  const readinessLabel = health.data.readiness === "ready" ? "Ready" : "Not ready";

  return (
    <div className="diagnostics__result">
      <p className={`status-badge status-badge--${health.data.readiness}`}>{readinessLabel}</p>
      <dl className="diagnostics__list">
        <div>
          <dt>API process</dt>
          <dd>{health.data.process}</dd>
        </div>
        <div>
          <dt>PostgreSQL/PostGIS</dt>
          <dd>{health.data.dependencies.database}</dd>
        </div>
        <div>
          <dt>Redis</dt>
          <dd>{health.data.dependencies.cache}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DiagnosticsPage() {
  const [state, setState] = useState<DiagnosticsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth(): Promise<void> {
      try {
        const health = await getHealth(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "loaded",
          health,
        });
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      }
    }

    void loadHealth();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section className="page diagnostics" aria-labelledby="diagnostics-heading">
      <p className="eyebrow">Development only</p>
      <h1 id="diagnostics-heading">System diagnostics</h1>
      <p className="page__lede">
        This page follows one typed browser request through the API to its local dependencies.
      </p>

      <div aria-live="polite" className="diagnostics__status">
        {state.status === "loading" && <p>Checking API readiness…</p>}
        {state.status === "error" && (
          <p>The API diagnostic is unavailable. Confirm that the local API is running.</p>
        )}
        {state.status === "loaded" && <HealthDetails health={state.health} />}
      </div>
    </section>
  );
}
