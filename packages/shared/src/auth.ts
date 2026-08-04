import { z } from "zod";

export const authenticationEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));

export const authenticationPasswordSchema = z.string().superRefine((password, context) => {
  const characterCount = [...password].length;

  if (characterCount < 12) {
    context.addIssue({
      code: "custom",
      message: "Password must contain at least 12 characters",
    });
  }

  if (characterCount > 128) {
    context.addIssue({
      code: "custom",
      message: "Password must contain at most 128 characters",
    });
  }
});

export const authenticationCredentialsSchema = z
  .object({
    email: authenticationEmailSchema,
    password: authenticationPasswordSchema,
  })
  .strict();

export const registerRequestSchema = authenticationCredentialsSchema;
export const loginRequestSchema = authenticationCredentialsSchema;

export const normalizedEmailSchema = z
  .email()
  .max(320)
  .refine((email) => email === email.trim().toLowerCase(), {
    message: "Email must already be normalized",
  });

export const publicUserSchema = z
  .object({
    id: z.uuid(),
    email: normalizedEmailSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const authenticationResponseSchema = z
  .object({
    data: publicUserSchema,
  })
  .strict();

export const registerResponseSchema = authenticationResponseSchema;
export const loginResponseSchema = authenticationResponseSchema;
export const currentUserResponseSchema = authenticationResponseSchema;
export const logoutResponseSchema = z.undefined();

export type AuthenticationCredentials = z.infer<typeof authenticationCredentialsSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthenticationResponse = z.infer<typeof authenticationResponseSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
