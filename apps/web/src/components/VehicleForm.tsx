import {
  createVehicleRequestSchema,
  type CreateVehicleRequest,
  type PublicVehicle,
  type VehicleConnectorType,
} from "@chargewise/shared";
import { useState, type FormEvent } from "react";

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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationMessage(null);

    const formData = new FormData(event.currentTarget);

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
      setValidationMessage(
        validation.error.issues[0]?.message ?? "Please review the vehicle information.",
      );
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
          defaultValue={initialVehicle?.preferredNetworks.join(", ") ?? ""}
          id="vehicle-networks"
          name="preferredNetworks"
          placeholder="Electrify America, EVgo"
        />
        <p className="form-field__hint">Separate multiple networks with commas.</p>
      </div>

      <label className="checkbox-option checkbox-option--default">
        <input
          defaultChecked={initialVehicle?.isDefault ?? false}
          name="isDefault"
          type="checkbox"
        />
        <span>Use this as my default vehicle</span>
      </label>

      {message !== null && (
        <p className="form-message form-message--error" role="alert">
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
