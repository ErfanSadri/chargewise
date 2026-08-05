import {
  chargingSessionListQuerySchema,
  type CreateChargingSessionRequest,
  type PublicChargingSession,
  type UpdateChargingSessionRequest,
} from "@chargewise/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import { getApiErrorMessage, isUnauthenticatedError } from "../api/api-client.ts";
import { analyticsQueryKey } from "../api/analytics-client.ts";
import {
  chargingSessionsQueryKey,
  createChargingSession,
  deleteChargingSession,
  getChargingSessionsQueryKey,
  listChargingSessions,
  updateChargingSession,
  type ChargingSessionHistoryFilters,
} from "../api/charging-session-client.ts";
import { favoritesQueryKey, listFavorites } from "../api/favorite-client.ts";
import { listVehicles, vehiclesQueryKey } from "../api/vehicle-client.ts";
import {
  ChargingSessionForm,
  type ChargingStationOption,
} from "../components/ChargingSessionForm.tsx";
import "./ChargingSessionsPage.css";

interface UpdateChargingSessionVariables {
  chargingSessionId: string;
  input: UpdateChargingSessionRequest;
}

const emptyFilters: ChargingSessionHistoryFilters = {
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createListQuery(filters: ChargingSessionHistoryFilters, cursor: string | null) {
  return {
    ...(filters.from === "" ? {} : { from: filters.from }),
    ...(filters.to === "" ? {} : { to: filters.to }),
    ...(cursor === null ? {} : { cursor }),
  };
}

function addStationOption(
  options: Map<string, ChargingStationOption>,
  option: ChargingStationOption | undefined,
): void {
  if (option !== undefined && option.id !== "") {
    options.set(option.id, option);
  }
}

function getStationFallbackName(stationId: string): string {
  return `Station ${stationId.slice(0, 8)}`;
}

export function ChargingSessionsPage() {
  const queryClient = useQueryClient();
  const [searchParameters, setSearchParameters] = useSearchParams();

  const routeStationId = searchParameters.get("stationId") ?? "";
  const routeStationName =
    searchParameters.get("stationName") ??
    (routeStationId === "" ? "" : getStationFallbackName(routeStationId));

  const [isCreating, setIsCreating] = useState(routeStationId !== "");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<ChargingSessionHistoryFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<ChargingSessionHistoryFilters>(emptyFilters);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: vehiclesQueryKey,
    queryFn: ({ signal }) => listVehicles(signal),
  });

  const favoritesQuery = useQuery({
    queryKey: favoritesQueryKey,
    queryFn: ({ signal }) => listFavorites(signal),
  });

  const sessionsQuery = useInfiniteQuery({
    queryKey: getChargingSessionsQueryKey(appliedFilters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listChargingSessions(createListQuery(appliedFilters, pageParam), signal),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateChargingSessionRequest) => createChargingSession(input),
    onSuccess: async () => {
      setIsCreating(false);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: chargingSessionsQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: analyticsQueryKey,
        }),
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ chargingSessionId, input }: UpdateChargingSessionVariables) =>
      updateChargingSession(chargingSessionId, input),
    onSuccess: async () => {
      setEditingSessionId(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: chargingSessionsQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: analyticsQueryKey,
        }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (chargingSessionId: string) => deleteChargingSession(chargingSessionId),
    onSuccess: async (_result, chargingSessionId) => {
      if (editingSessionId === chargingSessionId) {
        setEditingSessionId(null);
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: chargingSessionsQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: analyticsQueryKey,
        }),
      ]);
    },
  });

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  const favorites = useMemo(() => favoritesQuery.data ?? [], [favoritesQuery.data]);

  const sessions = useMemo(
    () => sessionsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [sessionsQuery.data],
  );

  const stationOptions = useMemo(() => {
    const options = new Map<string, ChargingStationOption>();

    for (const favorite of favorites) {
      addStationOption(options, {
        id: favorite.stationId,
        name: favorite.name,
      });
    }

    if (routeStationId !== "") {
      addStationOption(options, {
        id: routeStationId,
        name: routeStationName,
      });
    }

    for (const session of sessions) {
      addStationOption(options, {
        id: session.stationId,
        name: options.get(session.stationId)?.name ?? getStationFallbackName(session.stationId),
      });
    }

    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [favorites, routeStationId, routeStationName, sessions]);

  const stationNameById = useMemo(
    () => new Map(stationOptions.map((station) => [station.id, station.name])),
    [stationOptions],
  );

  const vehicleNameById = useMemo(
    () =>
      new Map(
        vehicles.map((vehicle) => [
          vehicle.id,
          `${vehicle.nickname} — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        ]),
      ),
    [vehicles],
  );

  const editingSession =
    editingSessionId === null
      ? undefined
      : sessions.find((session) => session.id === editingSessionId);

  const dependencyError = vehiclesQuery.error ?? favoritesQuery.error ?? sessionsQuery.error;

  const isUnauthenticated =
    dependencyError !== null &&
    dependencyError !== undefined &&
    isUnauthenticatedError(dependencyError);

  function beginCreate(): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingSessionId(null);
    setIsCreating(true);
  }

  function closeCreate(): void {
    createMutation.reset();
    setIsCreating(false);
    setSearchParameters({}, { replace: true });
  }

  function beginEdit(chargingSessionId: string): void {
    updateMutation.reset();
    createMutation.reset();
    setIsCreating(false);
    setEditingSessionId(chargingSessionId);
  }

  function handleDelete(session: PublicChargingSession): void {
    const confirmed = window.confirm(
      `Delete the charging session from ${formatDateTime(
        session.startedAt,
      )}? This cannot be undone.`,
    );

    if (confirmed) {
      deleteMutation.mutate(session.id);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilterMessage(null);

    const validation = chargingSessionListQuerySchema.safeParse({
      ...(draftFilters.from === "" ? {} : { from: draftFilters.from }),
      ...(draftFilters.to === "" ? {} : { to: draftFilters.to }),
    });

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

  const pageMutationError = deleteMutation.isError
    ? getApiErrorMessage(deleteMutation.error, "ChargeWise could not delete the charging session.")
    : null;

  if (isUnauthenticated) {
    return null;
  }

  return (
    <section aria-labelledby="charging-sessions-heading" className="charging-sessions-page">
      <header className="charging-sessions-page__header">
        <div>
          <p className="eyebrow">Charging history</p>
          <h1 id="charging-sessions-heading">Track every charging stop.</h1>
          <p>
            Log energy, cost, wait time, and charger issues so your driving history stays useful.
          </p>
        </div>

        {!isCreating && (
          <button
            className="button button--primary"
            disabled={vehicles.length === 0 || stationOptions.length === 0}
            onClick={beginCreate}
            type="button"
          >
            Log session
          </button>
        )}
      </header>

      {(vehiclesQuery.isPending || favoritesQuery.isPending || sessionsQuery.isPending) && (
        <div aria-busy="true" aria-live="polite" className="charging-session-state">
          <p>Loading your charging history…</p>
        </div>
      )}

      {dependencyError !== null && dependencyError !== undefined && (
        <div className="charging-session-state">
          <h2>We could not load your charging history.</h2>
          <p>
            {getApiErrorMessage(
              dependencyError,
              "ChargeWise could not reach the charging-history service.",
            )}
          </p>
          <button
            className="button button--secondary"
            onClick={() => {
              void Promise.all([
                vehiclesQuery.refetch(),
                favoritesQuery.refetch(),
                sessionsQuery.refetch(),
              ]);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {vehiclesQuery.isSuccess && vehicles.length === 0 && (
        <div className="charging-session-state">
          <p className="eyebrow">Vehicle required</p>
          <h2>Add an EV before logging a session.</h2>
          <p>Each charging session belongs to one of your saved vehicles.</p>
          <Link className="button button--primary" to="/vehicles">
            Add a vehicle
          </Link>
        </div>
      )}

      {favoritesQuery.isSuccess && stationOptions.length === 0 && vehicles.length > 0 && (
        <div className="charging-session-state">
          <p className="eyebrow">Station required</p>
          <h2>Select a station from the route planner.</h2>
          <p>
            Open a station's details and choose Log charging session. Favorite stations also become
            reusable form options.
          </p>
          <Link className="button button--primary" to="/routes">
            Plan a route
          </Link>
        </div>
      )}

      {isCreating && vehicles.length > 0 && stationOptions.length > 0 && (
        <section
          aria-labelledby="create-charging-session-heading"
          className="charging-session-editor"
        >
          <div className="charging-session-editor__heading">
            <p className="eyebrow">New record</p>
            <h2 id="create-charging-session-heading">Log a charging session</h2>
          </div>

          <ChargingSessionForm
            initialStationId={routeStationId === "" ? undefined : routeStationId}
            isSubmitting={createMutation.isPending}
            onCancel={closeCreate}
            onSubmit={(input) => {
              createMutation.mutate(input);
            }}
            serverMessage={
              createMutation.isError
                ? getApiErrorMessage(
                    createMutation.error,
                    "ChargeWise could not create the charging session.",
                  )
                : null
            }
            stations={stationOptions}
            submitLabel="Log session"
            vehicles={vehicles}
          />
        </section>
      )}

      {pageMutationError !== null && (
        <p className="form-message form-message--error" role="alert">
          {pageMutationError}
        </p>
      )}

      {sessionsQuery.isSuccess && (
        <>
          <form className="charging-history-filters" onSubmit={applyFilters}>
            <div>
              <p className="eyebrow">History range</p>
              <h2>Filter sessions</h2>
            </div>

            <div className="charging-history-filters__fields">
              <div className="form-field">
                <label htmlFor="charging-history-from">From</label>
                <input
                  id="charging-history-from"
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
                <label htmlFor="charging-history-to">To</label>
                <input
                  id="charging-history-to"
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

            <div className="charging-history-filters__actions">
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

          {sessions.length === 0 ? (
            <div className="charging-session-state charging-session-state--empty">
              <p className="eyebrow">No sessions found</p>
              <h2>Your charging history is empty.</h2>
              <p>Log a session from a selected route station to begin tracking energy and cost.</p>
            </div>
          ) : (
            <div className="charging-history-list">
              {sessions.map((session) => {
                const isEditing = editingSessionId === session.id;
                const isUpdating =
                  updateMutation.isPending &&
                  updateMutation.variables?.chargingSessionId === session.id;
                const isDeleting =
                  deleteMutation.isPending && deleteMutation.variables === session.id;

                return (
                  <article className="charging-history-card" key={session.id}>
                    <div className="charging-history-card__heading">
                      <div>
                        <p className="eyebrow">{formatDateTime(session.startedAt)}</p>
                        <h2>
                          {stationNameById.get(session.stationId) ??
                            getStationFallbackName(session.stationId)}
                        </h2>
                        <p>{vehicleNameById.get(session.vehicleId) ?? "Saved vehicle"}</p>
                      </div>

                      <span
                        className={
                          session.issueType === "NONE"
                            ? "charging-issue-badge charging-issue-badge--clear"
                            : "charging-issue-badge charging-issue-badge--warning"
                        }
                      >
                        {issueLabels[session.issueType]}
                      </span>
                    </div>

                    {!isEditing && (
                      <>
                        <dl className="charging-history-card__metrics">
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
                            <dt>Wait</dt>
                            <dd>{session.waitMinutes} min</dd>
                          </div>
                          <div>
                            <dt>Battery</dt>
                            <dd>
                              {session.startingSoc}% → {session.endingSoc}%
                            </dd>
                          </div>
                          <div>
                            <dt>Odometer</dt>
                            <dd>
                              {session.odometerMiles === null
                                ? "Not recorded"
                                : `${session.odometerMiles.toLocaleString("en-US")} mi`}
                            </dd>
                          </div>
                        </dl>

                        {session.notes !== null && (
                          <p className="charging-history-card__notes">{session.notes}</p>
                        )}

                        <div className="charging-history-card__actions">
                          <button
                            className="button button--secondary"
                            disabled={isUpdating || isDeleting}
                            onClick={() => {
                              beginEdit(session.id);
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button button--danger"
                            disabled={isUpdating || isDeleting}
                            onClick={() => {
                              handleDelete(session);
                            }}
                            type="button"
                          >
                            {isDeleting ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </>
                    )}

                    {isEditing && editingSession !== undefined && (
                      <ChargingSessionForm
                        initialSession={editingSession}
                        isSubmitting={isUpdating}
                        key={editingSession.id}
                        onCancel={() => {
                          updateMutation.reset();
                          setEditingSessionId(null);
                        }}
                        onSubmit={(input) => {
                          updateMutation.mutate({
                            chargingSessionId: editingSession.id,
                            input,
                          });
                        }}
                        serverMessage={
                          updateMutation.isError
                            ? getApiErrorMessage(
                                updateMutation.error,
                                "ChargeWise could not update the charging session.",
                              )
                            : null
                        }
                        stations={stationOptions}
                        submitLabel="Save changes"
                        vehicles={vehicles}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {sessionsQuery.hasNextPage && (
            <div className="charging-history-load-more">
              <button
                className="button button--secondary"
                disabled={sessionsQuery.isFetchingNextPage}
                onClick={() => {
                  void sessionsQuery.fetchNextPage();
                }}
                type="button"
              >
                {sessionsQuery.isFetchingNextPage ? "Loading more…" : "Load more sessions"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
