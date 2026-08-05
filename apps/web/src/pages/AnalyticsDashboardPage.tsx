import {
  analyticsDateRangeQuerySchema,
  type AnalyticsDateRangeQuery,
  type AnalyticsSummary,
  type PublicChargingSession,
} from "@chargewise/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router";

import { getApiErrorMessage, isUnauthenticatedError } from "../api/api-client.ts";
import {
  getAnalyticsNetworks,
  getAnalyticsQueryKey,
  getAnalyticsStations,
  getAnalyticsSummary,
  type AnalyticsDashboardFilters,
} from "../api/analytics-client.ts";
import { chargingSessionsQueryKey, listChargingSessions } from "../api/charging-session-client.ts";
import "./AnalyticsDashboardPage.css";

const emptyFilters: AnalyticsDashboardFilters = {
  from: "",
  to: "",
};

const issueLabels: Record<PublicChargingSession["issueType"], string> = {
  NONE: "No issue",
  UNAVAILABLE: "Station unavailable",
  BROKEN: "Charger broken",
  SLOW: "Slow charging",
  PAYMENT: "Payment issue",
  OCCUPIED: "Charger occupied",
  OTHER: "Other issue",
};

interface SummaryMetric {
  label: string;
  value: string;
  description: string;
}

function createAnalyticsQuery(filters: AnalyticsDashboardFilters): AnalyticsDateRangeQuery {
  return {
    ...(filters.from === "" ? {} : { from: filters.from }),
    ...(filters.to === "" ? {} : { to: filters.to }),
  };
}

function getDashboardRecentSessionsQueryKey(filters: AnalyticsDashboardFilters) {
  return [...chargingSessionsQueryKey, "dashboard-recent", filters] as const;
}

function formatUtcDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function describeDateRange(filters: AnalyticsDashboardFilters): string {
  if (filters.from === "" && filters.to === "") {
    return "All recorded charging sessions";
  }

  if (filters.from !== "" && filters.to !== "") {
    return `${formatUtcDate(filters.from)} through ${formatUtcDate(filters.to)}`;
  }

  if (filters.from !== "") {
    return `Sessions on or after ${formatUtcDate(filters.from)}`;
  }

  return `Sessions through ${formatUtcDate(filters.to)}`;
}

function createSummaryMetrics(summary: AnalyticsSummary): SummaryMetric[] {
  return [
    {
      label: "Sessions",
      value: summary.sessionCount.toLocaleString("en-US"),
      description: "Charging stops in this range",
    },
    {
      label: "Energy added",
      value: `${summary.totalEnergyKwh} kWh`,
      description: "Combined recorded energy",
    },
    {
      label: "Total spent",
      value: `$${summary.totalCost}`,
      description: "Combined charging cost",
    },
    {
      label: "Average cost",
      value:
        summary.averageCostPerKwh === null ? "Not available" : `$${summary.averageCostPerKwh}/kWh`,
      description: "Total cost divided by total energy",
    },
    {
      label: "Average charging",
      value:
        summary.averageChargingMinutes === null
          ? "Not available"
          : `${summary.averageChargingMinutes} min`,
      description: "Mean recorded charging duration",
    },
    {
      label: "Average wait",
      value:
        summary.averageWaitMinutes === null ? "Not available" : `${summary.averageWaitMinutes} min`,
      description: "Mean recorded wait before charging",
    },
    {
      label: "Observed power",
      value:
        summary.averageObservedPowerKw === null
          ? "Not available"
          : `${summary.averageObservedPowerKw} kW`,
      description: "Energy divided by charging hours",
    },
    {
      label: "Issue-free",
      value:
        summary.issueFreePercentage === null ? "Not available" : `${summary.issueFreePercentage}%`,
      description: "Sessions recorded with no issue",
    },
  ];
}

function getBarPercentage(value: string, maximum: number): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0 || maximum <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (numericValue / maximum) * 100));
}

function getStationFallbackName(stationId: string): string {
  return `Station ${stationId.slice(0, 8)}`;
}

export function AnalyticsDashboardPage() {
  const [draftFilters, setDraftFilters] = useState<AnalyticsDashboardFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsDashboardFilters>(emptyFilters);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: getAnalyticsQueryKey("summary", appliedFilters),
    queryFn: ({ signal }) => getAnalyticsSummary(createAnalyticsQuery(appliedFilters), signal),
  });

  const networksQuery = useQuery({
    queryKey: getAnalyticsQueryKey("networks", appliedFilters),
    queryFn: ({ signal }) => getAnalyticsNetworks(createAnalyticsQuery(appliedFilters), signal),
  });

  const stationsQuery = useQuery({
    queryKey: getAnalyticsQueryKey("stations", appliedFilters),
    queryFn: ({ signal }) => getAnalyticsStations(createAnalyticsQuery(appliedFilters), signal),
  });

  const recentSessionsQuery = useQuery({
    queryKey: getDashboardRecentSessionsQueryKey(appliedFilters),
    queryFn: ({ signal }) => listChargingSessions(createAnalyticsQuery(appliedFilters), signal),
  });

  const recentSessions = useMemo(
    () => recentSessionsQuery.data?.data.slice(0, 5) ?? [],
    [recentSessionsQuery.data],
  );

  const stationNameById = useMemo(
    () => new Map((stationsQuery.data ?? []).map((station) => [station.stationId, station.name])),
    [stationsQuery.data],
  );

  const dependencyError =
    summaryQuery.error ?? networksQuery.error ?? stationsQuery.error ?? recentSessionsQuery.error;

  const isUnauthenticated =
    dependencyError !== null &&
    dependencyError !== undefined &&
    isUnauthenticatedError(dependencyError);

  const isPending =
    summaryQuery.isPending ||
    networksQuery.isPending ||
    stationsQuery.isPending ||
    recentSessionsQuery.isPending;

  const isComplete =
    summaryQuery.isSuccess &&
    networksQuery.isSuccess &&
    stationsQuery.isSuccess &&
    recentSessionsQuery.isSuccess;

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilterMessage(null);

    const validation = analyticsDateRangeQuerySchema.safeParse(createAnalyticsQuery(draftFilters));

    if (!validation.success) {
      setFilterMessage("Choose a valid date range whose end is not before its start.");
      return;
    }

    setAppliedFilters(draftFilters);
  }

  function clearFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterMessage(null);
  }

  if (isUnauthenticated) {
    return null;
  }

  const summaryMetrics =
    summaryQuery.data === undefined ? [] : createSummaryMetrics(summaryQuery.data);

  const maximumNetworkEnergy = Math.max(
    0,
    ...(networksQuery.data ?? []).map((network) => Number(network.totalEnergyKwh)),
  );

  return (
    <section aria-labelledby="analytics-dashboard-heading" className="analytics-dashboard">
      <header className="analytics-dashboard__header">
        <div>
          <p className="eyebrow">Personal analytics</p>
          <h1 id="analytics-dashboard-heading">Your charging dashboard.</h1>
          <p>
            Understand energy, spending, charging performance, and reliability from the sessions you
            recorded.
          </p>
        </div>

        <Link className="button button--primary" to="/sessions">
          View charging history
        </Link>
      </header>

      <form className="analytics-filters" onSubmit={applyFilters}>
        <div>
          <p className="eyebrow">Dashboard range</p>
          <h2>Filter analytics</h2>
          <p>{describeDateRange(appliedFilters)}</p>
        </div>

        <div className="analytics-filters__fields">
          <div className="form-field">
            <label htmlFor="analytics-from">From</label>
            <input
              id="analytics-from"
              name="from"
              onChange={(event) => {
                const value = event.currentTarget.value;

                setDraftFilters((current) => ({
                  ...current,
                  from: value,
                }));
              }}
              type="date"
              value={draftFilters.from}
            />
          </div>

          <div className="form-field">
            <label htmlFor="analytics-to">To</label>
            <input
              id="analytics-to"
              name="to"
              onChange={(event) => {
                const value = event.currentTarget.value;

                setDraftFilters((current) => ({
                  ...current,
                  to: value,
                }));
              }}
              type="date"
              value={draftFilters.to}
            />
          </div>
        </div>

        <div className="analytics-filters__actions">
          <button className="button button--primary" type="submit">
            Apply dates
          </button>
          <button className="button button--secondary" onClick={clearFilters} type="button">
            Clear dates
          </button>
        </div>

        {filterMessage !== null && (
          <p className="form-message form-message--error" role="alert">
            {filterMessage}
          </p>
        )}
      </form>

      {isPending && (
        <div aria-busy="true" aria-live="polite" className="analytics-state">
          <p>Calculating your charging analytics…</p>
        </div>
      )}

      {dependencyError !== null && dependencyError !== undefined && (
        <div className="analytics-state" role="alert">
          <p className="eyebrow">Dashboard unavailable</p>
          <h2>We could not calculate your analytics.</h2>
          <p>
            {getApiErrorMessage(
              dependencyError,
              "ChargeWise could not reach the analytics service.",
            )}
          </p>
          <button
            className="button button--secondary"
            onClick={() => {
              void Promise.all([
                summaryQuery.refetch(),
                networksQuery.refetch(),
                stationsQuery.refetch(),
                recentSessionsQuery.refetch(),
              ]);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {isComplete && summaryQuery.data.sessionCount === 0 && (
        <div className="analytics-state analytics-state--empty">
          <p className="eyebrow">No analytics yet</p>
          <h2>Your dashboard will appear after your first session.</h2>
          <p>
            Record a charging stop to begin measuring energy, cost, wait time, observed power, and
            reliability.
          </p>
          <Link className="button button--primary" to="/sessions">
            Log a charging session
          </Link>
        </div>
      )}

      {isComplete && summaryQuery.data.sessionCount > 0 && (
        <>
          <section aria-labelledby="analytics-overview-heading" className="analytics-section">
            <div className="analytics-section__heading">
              <div>
                <p className="eyebrow">Overview</p>
                <h2 id="analytics-overview-heading">Key charging metrics</h2>
              </div>
              <p>{describeDateRange(appliedFilters)}</p>
            </div>

            <dl className="analytics-summary-grid">
              {summaryMetrics.map((metric) => (
                <div className="analytics-summary-card" key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                  <p>{metric.description}</p>
                </div>
              ))}
            </dl>

            <p className="analytics-definition-note">
              Observed power reflects your recorded energy divided by charging time. It is not the
              charger&apos;s advertised maximum capacity.
            </p>
          </section>

          <section aria-labelledby="network-analytics-heading" className="analytics-section">
            <div className="analytics-section__heading">
              <div>
                <p className="eyebrow">Network comparison</p>
                <h2 id="network-analytics-heading">Energy by charging network</h2>
              </div>
              <p>Bars are scaled to the highest-energy network in this range.</p>
            </div>

            <figure
              aria-labelledby="network-analytics-heading"
              className="analytics-network-figure"
            >
              <ul className="analytics-network-chart">
                {networksQuery.data.map((network) => {
                  const percentage = getBarPercentage(network.totalEnergyKwh, maximumNetworkEnergy);

                  const barStyle = {
                    "--analytics-bar-width": `${percentage}%`,
                  } as CSSProperties;

                  return (
                    <li
                      aria-label={`${network.network}: ${network.sessionCount} sessions, ${network.totalEnergyKwh} kilowatt-hours, $${network.totalCost} total cost, ${network.issueFreePercentage}% issue-free`}
                      className="analytics-network-row"
                      key={network.network}
                    >
                      <div className="analytics-network-row__heading">
                        <strong>{network.network}</strong>
                        <span>
                          {network.totalEnergyKwh} kWh ·{" "}
                          {network.sessionCount.toLocaleString("en-US")}{" "}
                          {network.sessionCount === 1 ? "session" : "sessions"}
                        </span>
                      </div>

                      <div aria-hidden="true" className="analytics-network-bar">
                        <span style={barStyle} />
                      </div>

                      <dl className="analytics-network-row__metrics">
                        <div>
                          <dt>Cost</dt>
                          <dd>${network.totalCost}</dd>
                        </div>
                        <div>
                          <dt>Cost/kWh</dt>
                          <dd>${network.averageCostPerKwh}</dd>
                        </div>
                        <div>
                          <dt>Observed power</dt>
                          <dd>{network.averageObservedPowerKw} kW</dd>
                        </div>
                        <div>
                          <dt>Issue-free</dt>
                          <dd>{network.issueFreePercentage}%</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </figure>
          </section>

          <section aria-labelledby="station-analytics-heading" className="analytics-section">
            <div className="analytics-section__heading">
              <div>
                <p className="eyebrow">Station evidence</p>
                <h2 id="station-analytics-heading">Most-used stations</h2>
              </div>
              <p>Ranked by session count, followed by recorded energy.</p>
            </div>

            <div className="analytics-table-scroll">
              <table aria-label="Most-used stations">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Station</th>
                    <th scope="col">Sessions</th>
                    <th scope="col">Energy</th>
                    <th scope="col">Avg. power</th>
                    <th scope="col">Avg. wait</th>
                    <th scope="col">Issue-free</th>
                    <th scope="col">Last session</th>
                  </tr>
                </thead>
                <tbody>
                  {stationsQuery.data.map((station, index) => (
                    <tr key={station.stationId}>
                      <td>{index + 1}</td>
                      <th scope="row">
                        <strong>{station.name}</strong>
                        <span>{station.network ?? "Network not recorded"}</span>
                      </th>
                      <td>{station.sessionCount.toLocaleString("en-US")}</td>
                      <td>{station.totalEnergyKwh} kWh</td>
                      <td>{station.averageObservedPowerKw} kW</td>
                      <td>{station.averageWaitMinutes} min</td>
                      <td>{station.issueFreePercentage}%</td>
                      <td>{formatDateTime(station.lastSessionAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="recent-analytics-heading" className="analytics-section">
            <div className="analytics-section__heading">
              <div>
                <p className="eyebrow">Recent activity</p>
                <h2 id="recent-analytics-heading">Latest sessions</h2>
              </div>
              <Link to="/sessions">Open full history</Link>
            </div>

            {recentSessions.length === 0 ? (
              <p className="analytics-inline-empty">
                No recent sessions were returned for this range.
              </p>
            ) : (
              <div className="analytics-recent-list">
                {recentSessions.map((session) => (
                  <article className="analytics-recent-card" key={session.id}>
                    <div>
                      <p className="eyebrow">{formatDateTime(session.startedAt)}</p>
                      <h3>
                        {stationNameById.get(session.stationId) ??
                          getStationFallbackName(session.stationId)}
                      </h3>
                    </div>

                    <dl>
                      <div>
                        <dt>Energy</dt>
                        <dd>{session.energyAddedKwh} kWh</dd>
                      </div>
                      <div>
                        <dt>Cost</dt>
                        <dd>${session.totalCost}</dd>
                      </div>
                      <div>
                        <dt>Charging</dt>
                        <dd>{session.chargingMinutes} min</dd>
                      </div>
                      <div>
                        <dt>Result</dt>
                        <dd>{issueLabels[session.issueType]}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
