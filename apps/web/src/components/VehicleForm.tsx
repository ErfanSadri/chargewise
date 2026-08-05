import {
  createVehicleRequestSchema,
  type CreateVehicleRequest,
  type PublicVehicle,
  type VehicleConnectorType,
} from "@chargewise/shared";
import { useState, type FormEvent } from "react";

import { focusFirstInvalidFormControl, getInvalidFieldNames } from "../forms/form-accessibility.ts";

const connectorOptions: readonly VehicleConnectorType[] = ["CCS", "NACS", "J1772", "CHADEMO"];

export interface VehicleFormProps {
  initialVehicle?: PublicVehicle;
  isSubmitting: boolean;
  serverMessage?: string | null;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (input: CreateVehicleRequest) => void;
}

function getOptionalDecimal(formData: FormData, fieldName: string): string | null {
  const value = String(formData.get(fieldName) ?? "").trim();

  return value === "" ? null : value;
}

function getPreferredNetworks(formData: FormData): string[] {
  return String(formData.get("preferredNetworks") ?? "")
    .split(",")
    .map((network) => network.trim())
    .filter((network) => network !== "");
}

export function VehicleForm({
  initialVehicle,
  isSubmitting,
  serverMessage = null,
  submitLabel,
  onCancel,
  onSubmit,
}: VehicleFormProps) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(new Set());

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const form = event.currentTarget;

    setValidationMessage(null);
    setInvalidFields(new Set());

    const formData = new FormData(form);

    const validation = createVehicleRequestSchema.safeParse({
      nickname: String(formData.get("nickname") ?? ""),
      make: String(formData.get("make") ?? ""),
      model: String(formData.get("model") ?? ""),
      year: Number(formData.get("year")),
      batteryCapacityKwh: getOptionalDecimal(formData, "batteryCapacityKwh"),
      efficiencyMiPerKwh: getOptionalDecimal(formData, "efficiencyMiPerKwh"),
      connectorTypes: formData.getAll("connectorTypes").map(String),
      preferredNetworks: getPreferredNetworks(formData),
      isDefault: formData.get("isDefault") === "on",
    });

    if (!validation.success) {
      const invalidFieldNames = getInvalidFieldNames(validation.error.issues);

      setInvalidFields(invalidFieldNames);
      setValidationMessage(
        validation.error.issues[0]?.message ?? "Please review the vehicle information.",
      );
      focusFirstInvalidFormControl(form, invalidFieldNames);
      return;
    }

    onSubmit(validation.data);
  }

  const message = validationMessage ?? serverMessage;

  return (
    <form className="vehicle-form" noValidate onSubmit={handleSubmit}>
      <div className="vehicle-form__grid">
        <div className="form-field">
          <label htmlFor="vehicle-nickname">Nickname</label>
          <input
            aria-invalid={invalidFields.has("nickname")}
            aria-describedby={invalidFields.has("nickname") ? "vehicle-form-error" : undefined}
            defaultValue={initialVehicle?.nickname ?? ""}
            id="vehicle-nickname"
            maxLength={80}
            name="nickname"
            placeholder="My i5"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="vehicle-make">Make</label>
          <input
            aria-invalid={invalidFields.has("make")}
            aria-describedby={invalidFields.has("make") ? "vehicle-form-error" : undefined}
            defaultValue={initialVehicle?.make ?? ""}
            id="vehicle-make"
            maxLength={80}
            name="make"
            placeholder="BMW"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="vehicle-model">Model</label>
          <input
            aria-invalid={invalidFields.has("model")}
            aria-describedby={invalidFields.has("model") ? "vehicle-form-error" : undefined}
            defaultValue={initialVehicle?.model ?? ""}
            id="vehicle-model"
            maxLength={120}
            name="model"
            placeholder="i5 eDrive40"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="vehicle-year">Year</label>
          <input
            aria-invalid={invalidFields.has("year")}
            aria-describedby={invalidFields.has("year") ? "vehicle-form-error" : undefined}
            defaultValue={initialVehicle?.year ?? ""}
            id="vehicle-year"
            inputMode="numeric"
            max={2100}
            min={1990}
            name="year"
            required
            type="number"
          />
        </div>

        <div className="form-field">
          <label htmlFor="vehicle-battery">Battery capacity</label>
          <div className="input-with-unit">
            <input
              aria-invalid={invalidFields.has("batteryCapacityKwh")}
              aria-describedby={
                invalidFields.has("batteryCapacityKwh") ? "vehicle-form-error" : undefined
              }
              defaultValue={initialVehicle?.batteryCapacityKwh ?? ""}
              id="vehicle-battery"
              inputMode="decimal"
              name="batteryCapacityKwh"
              placeholder="81.20"
            />
            <span>kWh</span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="vehicle-efficiency">Efficiency</label>
          <div className="input-with-unit">
            <input
              aria-invalid={invalidFields.has("efficiencyMiPerKwh")}
              aria-describedby={
                invalidFields.has("efficiencyMiPerKwh") ? "vehicle-form-error" : undefined
              }
              defaultValue={initialVehicle?.efficiencyMiPerKwh ?? ""}
              id="vehicle-efficiency"
              inputMode="decimal"
              name="efficiencyMiPerKwh"
              placeholder="3.10"
            />
            <span>mi/kWh</span>
          </div>
        </div>
      </div>

      <fieldset className="vehicle-form__fieldset">
        <legend>Connector types</legend>

        <div className="checkbox-grid">
          {connectorOptions.map((connectorType) => (
            <label className="checkbox-option" key={connectorType}>
              <input
                aria-invalid={invalidFields.has("connectorTypes")}
                aria-describedby={
                  invalidFields.has("connectorTypes") ? "vehicle-form-error" : undefined
                }
                defaultChecked={initialVehicle?.connectorTypes.includes(connectorType) ?? false}
                name="connectorTypes"
                type="checkbox"
                value={connectorType}
              />
              <span>{connectorType}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-field">
        <label htmlFor="vehicle-networks">Preferred charging networks</label>
        <input
          aria-invalid={invalidFields.has("preferredNetworks")}
          aria-describedby={
            invalidFields.has("preferredNetworks") ? "vehicle-form-error" : undefined
          }
          defaultValue={initialVehicle?.preferredNetworks.join(", ") ?? ""}
          id="vehicle-networks"
          name="preferredNetworks"
          placeholder="Electrify America, EVgo"
        />
        <p className="form-field__hint">Separate multiple networks with commas.</p>
      </div>

      <label className="checkbox-option checkbox-option--default">
        <input
          aria-invalid={invalidFields.has("isDefault")}
          aria-describedby={invalidFields.has("isDefault") ? "vehicle-form-error" : undefined}
          defaultChecked={initialVehicle?.isDefault ?? false}
          name="isDefault"
          type="checkbox"
        />
        <span>Use this as my default vehicle</span>
      </label>

      {message !== null && (
        <p className="form-message form-message--error" id="vehicle-form-error" role="alert">
          {message}
        </p>
      )}

      <div className="vehicle-form__actions">
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving…" : submitLabel}
        </button>

        {onCancel !== undefined && (
          <button
            className="button button--secondary"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
