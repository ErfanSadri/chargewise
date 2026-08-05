import { z } from "zod";

export const chargingIssueTypeSchema = z.enum([
  "NONE",
  "UNAVAILABLE",
  "BROKEN",
  "SLOW",
  "PAYMENT",
  "OCCUPIED",
  "OTHER",
]);

function createDecimalSchema(
  maximumIntegerDigits: number,
  decimalPlaces: number,
  allowZero: boolean,
) {
  const pattern = new RegExp(
    `^(?:0|[1-9]\\d{0,${maximumIntegerDigits - 1}})(?:\\.\\d{1,${decimalPlaces}})?$`,
    "u",
  );

  return z
    .string()
    .regex(pattern)
    .refine((value) => (allowZero ? Number(value) >= 0 : Number(value) > 0), {
      message: allowZero ? "Value must be at least zero" : "Value must be greater than zero",
    });
}

const energyAddedKwhSchema = createDecimalSchema(4, 3, false);
const totalCostSchema = createDecimalSchema(8, 2, true);
const notesSchema = z.string().trim().min(1).max(1000).nullable();

const chargingSessionRequiredFields = {
  vehicleId: z.string().uuid(),
  stationId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  chargingMinutes: z.number().int().positive(),
  waitMinutes: z.number().int().nonnegative(),
  energyAddedKwh: energyAddedKwhSchema,
  totalCost: totalCostSchema,
  startingSoc: z.number().int().min(0).max(99),
  endingSoc: z.number().int().min(1).max(100),
};

function validateStateOfCharge(
  value: {
    startingSoc?: number | undefined;
    endingSoc?: number | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.startingSoc !== undefined &&
    value.endingSoc !== undefined &&
    value.endingSoc <= value.startingSoc
  ) {
    context.addIssue({
      code: "custom",
      path: ["endingSoc"],
      message: "Ending state of charge must be greater than starting state of charge",
    });
  }
}

export const createChargingSessionRequestSchema = z
  .object({
    ...chargingSessionRequiredFields,
    odometerMiles: z.number().int().nonnegative().nullable().optional(),
    issueType: chargingIssueTypeSchema.default("NONE"),
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine(validateStateOfCharge);

export const updateChargingSessionRequestSchema = z
  .object({
    ...chargingSessionRequiredFields,
    odometerMiles: z.number().int().nonnegative().nullable(),
    issueType: chargingIssueTypeSchema,
    notes: notesSchema,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one charging-session field is required",
  })
  .superRefine(validateStateOfCharge);

export const chargingSessionPathParametersSchema = z
  .object({
    chargingSessionId: z.string().uuid(),
  })
  .strict();

export const chargingSessionListQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    cursor: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must not be before the start date",
      });
    }
  });

export const publicChargingSessionSchema = z
  .object({
    id: z.string().uuid(),
    vehicleId: z.string().uuid(),
    stationId: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }),
    chargingMinutes: z.number().int().positive(),
    waitMinutes: z.number().int().nonnegative(),
    energyAddedKwh: energyAddedKwhSchema,
    totalCost: totalCostSchema,
    startingSoc: z.number().int().min(0).max(99),
    endingSoc: z.number().int().min(1).max(100),
    odometerMiles: z.number().int().nonnegative().nullable(),
    issueType: chargingIssueTypeSchema,
    notes: notesSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine(validateStateOfCharge);

export const chargingSessionResponseSchema = z
  .object({
    data: publicChargingSessionSchema,
  })
  .strict();

export const chargingSessionListResponseSchema = z
  .object({
    data: z.array(publicChargingSessionSchema),
    meta: z
      .object({
        nextCursor: z.string().uuid().nullable(),
      })
      .strict(),
  })
  .strict();

export type ChargingIssueType = z.infer<typeof chargingIssueTypeSchema>;
export type CreateChargingSessionRequest = z.infer<typeof createChargingSessionRequestSchema>;
export type UpdateChargingSessionRequest = z.infer<typeof updateChargingSessionRequestSchema>;
export type ChargingSessionListQuery = z.infer<typeof chargingSessionListQuerySchema>;
export type PublicChargingSession = z.infer<typeof publicChargingSessionSchema>;
export type ChargingSessionResponse = z.infer<typeof chargingSessionResponseSchema>;
export type ChargingSessionListResponse = z.infer<typeof chargingSessionListResponseSchema>;
