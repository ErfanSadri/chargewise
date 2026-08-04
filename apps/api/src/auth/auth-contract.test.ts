import { logoutResponseSchema, publicUserSchema, registerRequestSchema } from "@chargewise/shared";
import { describe, expect, it } from "vitest";

const validUser = {
  id: "efebc3e4-1eac-4d14-9af9-4c8dd137549c",
  email: "driver@example.com",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
};

describe("authentication contracts", () => {
  it("normalizes email without changing the password", () => {
    const password = "  keep this password exact  ";

    expect(
      registerRequestSchema.parse({
        email: " Driver@Example.COM ",
        password,
      }),
    ).toEqual({
      email: "driver@example.com",
      password,
    });
  });

  it("rejects unknown credential fields", () => {
    expect(
      registerRequestSchema.safeParse({
        email: "driver@example.com",
        password: "a-valid-password",
        role: "admin",
      }).success,
    ).toBe(false);
  });

  it("counts Unicode password characters instead of UTF-16 code units", () => {
    expect(
      registerRequestSchema.safeParse({
        email: "driver@example.com",
        password: "🙂".repeat(12),
      }).success,
    ).toBe(true);

    expect(
      registerRequestSchema.safeParse({
        email: "driver@example.com",
        password: "🙂".repeat(11),
      }).success,
    ).toBe(false);
  });

  it("rejects overlong passwords", () => {
    expect(
      registerRequestSchema.safeParse({
        email: "driver@example.com",
        password: "a".repeat(129),
      }).success,
    ).toBe(false);
  });

  it("accepts only normalized public user data", () => {
    expect(publicUserSchema.safeParse(validUser).success).toBe(true);
    expect(publicUserSchema.safeParse({ ...validUser, email: "Driver@example.com" }).success).toBe(
      false,
    );
    expect(publicUserSchema.safeParse({ ...validUser, passwordHash: "private" }).success).toBe(
      false,
    );
  });

  it("models logout as an empty response body", () => {
    expect(logoutResponseSchema.parse(undefined)).toBeUndefined();
    expect(logoutResponseSchema.safeParse({}).success).toBe(false);
  });
});
