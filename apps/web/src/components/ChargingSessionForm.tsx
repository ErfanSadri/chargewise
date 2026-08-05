import {
  chargingIssueTypeSchema,
  createChargingSessionRequestSchema,
  type ChargingIssueType,
  type CreateChargingSessionRequest,
  type PublicChargingSession,
  type PublicVehicle,
} from "@chargewise/shared";
import { useState, type FormEvent } from "react";

export interface ChargingStationOption {
  id: string;
  name: string;
}

interface ChargingSessionFormProps {
  initialSession?: PublicChargingSession;
  initialStationId?: string | undefined;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateChargingSessionRequest) => void;
  serverMessage: string | null;
  stations: readonly ChargingStationOption[];
  submitLabel: string;
  vehicles: readonly PublicVehicle[];
}

type ChargingSessionField =
  | "vehicleId"
  | "stationId"
  | "startedAt"
  | "chargingMinutes"
  | "waitMinutes"
  | "energyAddedKwh"
  | "totalCost"
  | "startingSoc"
  | "endingSoc"
  | "odometerMiles"
  | "issueType"
  | "notes";

type FieldErrors = Partial<Record<ChargingSessionField, string>>;

const issueTypeLabels: Record<ChargingIssueType, string> = {
  NONE: "No issue",
  UNAVAILABLE: "Station unavailable",
  BROKEN: "Charger broken",
  SLOW: "Charging was slow",
  PAYMENT: "Payment issue",
  OCCUPIED: "Charger occupied",
  OTHER: "Other issue",
};

function toLocalDateTimeInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const timezoneOffsetMilliseconds = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffsetMilliseconds).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function readRequiredNumber(formData: FormData, field: string): number {
  const value = String(formData.get(field) ?? "").trim();

  return value === "" ? Number.NaN : Number(value);
}

function readOptionalInteger(formData: FormData, field: string): number | null {
  const value = String(formData.get(field) ?? "").trim();

  return value === "" ? null : Number(value);
}

function getFieldErrors(
  issues: readonly {
    path: PropertyKey[];
    message: string;
  }[],
): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field === "string" && errors[field as ChargingSessionField] === undefined) {
      errors[field as ChargingSessionField] = issue.message;
    }
  }

  return errors;
}

function getVehicleLabel(vehicle: PublicVehicle): string {
  return `${vehicle.nickname} — ${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

function FieldError({ field, errors }: { field: ChargingSessionField; errors: FieldErrors }) {
  const message = errors[field];

  return message === undefined ? null : (
    <p className="form-field__error" id={`charging-session-${field}-error`}>
      {message}
    </p>
  );
}

export function ChargingSessionForm({
  initialSession,
  initialStationId,
  isSubmitting,
  onCancel,
  onSubmit,
  serverMessage,
  stations,
  submitLabel,
  vehicles,
}: ChargingSessionFormProps) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const initialVehicleId =
    initialSession?.vehicleId ??
    vehicles.find((vehicle) => vehicle.isDefault)?.id ??
    vehicles[0]?.id ??
    "";

  const initialEffectiveStationId =
    initialSession?.stationId ?? initialStationId ?? stations[0]?.id ?? "";

  const initialStartedAt = toLocalDateTimeInput(initialSession?.startedAt ?? new Date());

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFieldErrors({});
    setValidationMessage(null);

    const formData = new FormData(event.currentTarget);

    const validation = createChargingSessionRequestSchema.safeParse({
      vehicleId: String(formData.get("vehicleId") ?? ""),
      stationId: String(formData.get("stationId") ?? ""),
      startedAt: toIsoDateTime(String(formData.get("startedAt") ?? "")),
      chargingMinutes: readRequiredNumber(formData, "chargingMinutes"),
      waitMinutes: readRequiredNumber(formData, "waitMinutes"),
      energyAddedKwh: String(formData.get("energyAddedKwh") ?? "").trim(),
      totalCost: String(formData.get("totalCost") ?? "").trim(),
      startingSoc: readRequiredNumber(formData, "startingSoc"),
      endingSoc: readRequiredNumber(formData, "endingSoc"),
      odometerMiles: readOptionalInteger(formData, "odometerMiles"),
      issueType: String(formData.get("issueType") ?? ""),
      notes:
        String(formData.get("notes") ?? "").trim() === ""
          ? null
          : String(formData.get("notes") ?? "").trim(),
    });

    if (!validation.success) {
      setFieldErrors(getFieldErrors(validation.error.issues));
      setValidationMessage("Review the highlighted charging-session fields.");
      return;
    }

    onSubmit(validation.data);
  }

  return (
    <form className="charging-session-form" noValidate onSubmit={handleSubmit}>
      <div className="charging-session-form__grid">
        <div className="form-field">
          <label htmlFor="charging-session-vehicleId">Vehicle</label>
          <select
            aria-describedby={
              fieldErrors.vehicleId === undefined ? undefined : "charging-session-vehicleId-error"
            }
            defaultValue={initialVehicleId}
            id="charging-session-vehicleId"
            name="vehicleId"
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {getVehicleLabel(vehicle)}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors} field="vehicleId" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-stationId">Charging station</label>
          <select
            aria-describedby={
              fieldErrors.stationId === undefined ? undefined : "charging-session-stationId-error"
            }
            defaultValue={initialEffectiveStationId}
            id="charging-session-stationId"
            name="stationId"
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors} field="stationId" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-startedAt">Session started</label>
          <input
            aria-describedby={
              fieldErrors.startedAt === undefined ? undefined : "charging-session-startedAt-error"
            }
            defaultValue={initialStartedAt}
            id="charging-session-startedAt"
            name="startedAt"
            required
            type="datetime-local"
          />
          <FieldError errors={fieldErrors} field="startedAt" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-issueType">Charging issue</label>
          <select
            defaultValue={initialSession?.issueType ?? "NONE"}
            id="charging-session-issueType"
            name="issueType"
          >
            {chargingIssueTypeSchema.options.map((issueType) => (
              <option key={issueType} value={issueType}>
                {issueTypeLabels[issueType]}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors} field="issueType" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-chargingMinutes">Charging time</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.chargingMinutes ?? 30}
              id="charging-session-chargingMinutes"
              inputMode="numeric"
              min="1"
              name="chargingMinutes"
              required
              step="1"
              type="number"
            />
            <span>minutes</span>
          </div>
          <FieldError errors={fieldErrors} field="chargingMinutes" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-waitMinutes">Wait time</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.waitMinutes ?? 0}
              id="charging-session-waitMinutes"
              inputMode="numeric"
              min="0"
              name="waitMinutes"
              required
              step="1"
              type="number"
            />
            <span>minutes</span>
          </div>
          <FieldError errors={fieldErrors} field="waitMinutes" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-energyAddedKwh">Energy added</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.energyAddedKwh ?? ""}
              id="charging-session-energyAddedKwh"
              inputMode="decimal"
              name="energyAddedKwh"
              placeholder="42.700"
              required
              type="text"
            />
            <span>kWh</span>
          </div>
          <FieldError errors={fieldErrors} field="energyAddedKwh" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-totalCost">Total cost</label>
          <div className="input-with-unit input-with-unit--prefix">
            <span>$</span>
            <input
              defaultValue={initialSession?.totalCost ?? "0.00"}
              id="charging-session-totalCost"
              inputMode="decimal"
              name="totalCost"
              required
              type="text"
            />
          </div>
          <FieldError errors={fieldErrors} field="totalCost" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-startingSoc">Starting charge</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.startingSoc ?? 20}
              id="charging-session-startingSoc"
              inputMode="numeric"
              max="99"
              min="0"
              name="startingSoc"
              required
              step="1"
              type="number"
            />
            <span>%</span>
          </div>
          <FieldError errors={fieldErrors} field="startingSoc" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-endingSoc">Ending charge</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.endingSoc ?? 80}
              id="charging-session-endingSoc"
              inputMode="numeric"
              max="100"
              min="1"
              name="endingSoc"
              required
              step="1"
              type="number"
            />
            <span>%</span>
          </div>
          <FieldError errors={fieldErrors} field="endingSoc" />
        </div>

        <div className="form-field">
          <label htmlFor="charging-session-odometerMiles">Odometer</label>
          <div className="input-with-unit">
            <input
              defaultValue={initialSession?.odometerMiles ?? ""}
              id="charging-session-odometerMiles"
              inputMode="numeric"
              min="0"
              name="odometerMiles"
              step="1"
              type="number"
            />
            <span>miles</span>
          </div>
          <FieldError errors={fieldErrors} field="odometerMiles" />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="charging-session-notes">Notes</label>
        <textarea
          defaultValue={initialSession?.notes ?? ""}
          id="charging-session-notes"
          maxLength={1000}
          name="notes"
          placeholder="Availability, charging speed, or anything useful for your next visit"
          rows={4}
        />
        <FieldError errors={fieldErrors} field="notes" />
      </div>

      {validationMessage !== null && (
        <p className="form-message form-message--error" role="alert">
          {validationMessage}
        </p>
      )}

      {serverMessage !== null && (
        <p className="form-message form-message--error" role="alert">
          {serverMessage}
        </p>
      )}

      <div className="charging-session-form__actions">
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
        <button
          className="button button--secondary"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
