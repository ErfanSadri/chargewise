import type { CreateVehicleRequest, PublicVehicle, UpdateVehicleRequest } from "@chargewise/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { getApiErrorMessage, isUnauthenticatedError } from "../api/api-client.ts";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicle,
  vehiclesQueryKey,
} from "../api/vehicle-client.ts";

import { VehicleForm } from "../components/VehicleForm.tsx";
import "./VehiclesPage.css";

interface UpdateVehicleVariables {
  vehicleId: string;
  input: UpdateVehicleRequest;
}

function getVehicleDescription(vehicle: PublicVehicle): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function VehiclesPage() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: vehiclesQueryKey,
    queryFn: ({ signal }) => listVehicles(signal),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateVehicleRequest) => createVehicle(input),
    onSuccess: async () => {
      setIsCreating(false);

      await queryClient.invalidateQueries({
        queryKey: vehiclesQueryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ vehicleId, input }: UpdateVehicleVariables) => updateVehicle(vehicleId, input),

    onSuccess: async () => {
      setEditingVehicleId(null);

      await queryClient.invalidateQueries({
        queryKey: vehiclesQueryKey,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vehicleId: string) => deleteVehicle(vehicleId),
    onSuccess: async (_result, vehicleId) => {
      if (editingVehicleId === vehicleId) {
        setEditingVehicleId(null);
      }

      await queryClient.invalidateQueries({
        queryKey: vehiclesQueryKey,
      });
    },
  });

  function beginCreate(): void {
    createMutation.reset();
    setEditingVehicleId(null);
    setIsCreating(true);
  }

  function beginEdit(vehicleId: string): void {
    updateMutation.reset();
    setIsCreating(false);
    setEditingVehicleId(vehicleId);
  }

  function handleDelete(vehicle: PublicVehicle): void {
    const confirmed = window.confirm(`Delete ${vehicle.nickname}? This cannot be undone.`);

    if (confirmed) {
      deleteMutation.mutate(vehicle.id);
    }
  }

  function makeDefault(vehicleId: string): void {
    updateMutation.reset();
    updateMutation.mutate({
      vehicleId,
      input: {
        isDefault: true,
      },
    });
  }

  const vehicles = vehiclesQuery.data ?? [];
  const editingVehicle =
    editingVehicleId === null
      ? undefined
      : vehicles.find((vehicle) => vehicle.id === editingVehicleId);

  const pageMutationError =
    updateMutation.isError && editingVehicleId === null
      ? getApiErrorMessage(updateMutation.error, "ChargeWise could not update the vehicle.")
      : deleteMutation.isError
        ? getApiErrorMessage(deleteMutation.error, "ChargeWise could not delete the vehicle.")
        : null;

  if (vehiclesQuery.isError && isUnauthenticatedError(vehiclesQuery.error)) {
    return null;
  }

  return (
    <section aria-labelledby="vehicles-heading" className="vehicles-page">
      <header className="vehicles-page__header">
        <div>
          <p className="eyebrow">Your garage</p>
          <h1 id="vehicles-heading">Manage your vehicles.</h1>
          <p>
            Vehicle details help ChargeWise determine compatible chargers and estimate route energy
            needs.
          </p>
        </div>

        {!isCreating && (
          <button className="button button--primary" onClick={beginCreate} type="button">
            Add vehicle
          </button>
        )}
      </header>

      {isCreating && (
        <section aria-labelledby="create-vehicle-heading" className="vehicle-editor">
          <div className="vehicle-editor__heading">
            <div>
              <p className="eyebrow">New vehicle</p>
              <h2 id="create-vehicle-heading">Add vehicle details</h2>
            </div>
          </div>

          <VehicleForm
            isSubmitting={createMutation.isPending}
            onCancel={() => {
              createMutation.reset();
              setIsCreating(false);
            }}
            onSubmit={(input: CreateVehicleRequest) => {
              createMutation.mutate(input);
            }}
            serverMessage={
              createMutation.isError
                ? getApiErrorMessage(
                    createMutation.error,
                    "ChargeWise could not create the vehicle.",
                  )
                : null
            }
            submitLabel="Add vehicle"
          />
        </section>
      )}

      {pageMutationError !== null && (
        <p className="form-message form-message--error" role="alert">
          {pageMutationError}
        </p>
      )}

      {vehiclesQuery.isPending && (
        <div aria-busy="true" aria-live="polite" className="vehicle-state">
          <p>Loading your vehicles…</p>
        </div>
      )}

      {vehiclesQuery.isError && (
        <div className="vehicle-state">
          <h2>We could not load your vehicles.</h2>
          <p>
            {getApiErrorMessage(
              vehiclesQuery.error,
              "ChargeWise could not reach the vehicle service.",
            )}
          </p>
          <button
            className="button button--secondary"
            onClick={() => {
              void vehiclesQuery.refetch();
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {vehiclesQuery.isSuccess && vehicles.length === 0 && (
        <div className="vehicle-state vehicle-state--empty">
          <p className="eyebrow">No vehicles yet</p>
          <h2>Add your first EV.</h2>
          <p>
            Save its connector type and efficiency so future route searches can use the right
            assumptions.
          </p>

          {!isCreating && (
            <button className="button button--primary" onClick={beginCreate} type="button">
              Add your first vehicle
            </button>
          )}
        </div>
      )}

      {vehiclesQuery.isSuccess && vehicles.length > 0 && (
        <div className="vehicle-grid">
          {vehicles.map((vehicle) => {
            const isEditing = editingVehicleId === vehicle.id;

            const isUpdatingThisVehicle =
              updateMutation.isPending && updateMutation.variables?.vehicleId === vehicle.id;

            const isDeletingThisVehicle =
              deleteMutation.isPending && deleteMutation.variables === vehicle.id;

            return (
              <article className="vehicle-card" key={vehicle.id}>
                <div className="vehicle-card__heading">
                  <div>
                    <div className="vehicle-card__title-row">
                      <h2>{vehicle.nickname}</h2>

                      {vehicle.isDefault && <span className="vehicle-badge">Default</span>}
                    </div>

                    <p>{getVehicleDescription(vehicle)}</p>
                  </div>
                </div>

                {!isEditing && (
                  <>
                    <dl className="vehicle-details">
                      <div>
                        <dt>Connectors</dt>
                        <dd>{vehicle.connectorTypes.join(", ")}</dd>
                      </div>
                      <div>
                        <dt>Battery</dt>
                        <dd>
                          {vehicle.batteryCapacityKwh === null
                            ? "Not provided"
                            : `${vehicle.batteryCapacityKwh} kWh`}
                        </dd>
                      </div>
                      <div>
                        <dt>Efficiency</dt>
                        <dd>
                          {vehicle.efficiencyMiPerKwh === null
                            ? "Not provided"
                            : `${vehicle.efficiencyMiPerKwh} mi/kWh`}
                        </dd>
                      </div>
                      <div>
                        <dt>Networks</dt>
                        <dd>
                          {vehicle.preferredNetworks.length === 0
                            ? "No preference"
                            : vehicle.preferredNetworks.join(", ")}
                        </dd>
                      </div>
                    </dl>

                    <div className="vehicle-card__actions">
                      <button
                        className="button button--secondary"
                        disabled={isUpdatingThisVehicle || isDeletingThisVehicle}
                        onClick={() => {
                          beginEdit(vehicle.id);
                        }}
                        type="button"
                      >
                        Edit
                      </button>

                      {!vehicle.isDefault && (
                        <button
                          className="button button--secondary"
                          disabled={isUpdatingThisVehicle || isDeletingThisVehicle}
                          onClick={() => {
                            makeDefault(vehicle.id);
                          }}
                          type="button"
                        >
                          {isUpdatingThisVehicle ? "Updating…" : "Make default"}
                        </button>
                      )}

                      <button
                        className="button button--danger"
                        disabled={isUpdatingThisVehicle || isDeletingThisVehicle}
                        onClick={() => {
                          handleDelete(vehicle);
                        }}
                        type="button"
                      >
                        {isDeletingThisVehicle ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </>
                )}

                {isEditing && editingVehicle !== undefined && (
                  <VehicleForm
                    initialVehicle={editingVehicle}
                    isSubmitting={isUpdatingThisVehicle}
                    key={editingVehicle.id}
                    onCancel={() => {
                      updateMutation.reset();
                      setEditingVehicleId(null);
                    }}
                    onSubmit={(input) => {
                      updateMutation.mutate({
                        vehicleId: editingVehicle.id,
                        input,
                      });
                    }}
                    serverMessage={
                      updateMutation.isError
                        ? getApiErrorMessage(
                            updateMutation.error,
                            "ChargeWise could not update the vehicle.",
                          )
                        : null
                    }
                    submitLabel="Save changes"
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
