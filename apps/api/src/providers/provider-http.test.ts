import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseProviderPayload, requestProviderJson, type ProviderFetch } from "./provider-http.js";

const provider = "OPENROUTESERVICE_ROUTING" as const;

describe("provider HTTP boundary", () => {
  it("maps an upstream 429 to a rate-limit error", async () => {
    const fetchFn: ProviderFetch = async () => new Response("limited", { status: 429 });

    await expect(
      requestProviderJson({ provider, url: "https://example.test", fetchFn }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      provider,
      code: "PROVIDER_RATE_LIMITED",
      statusCode: 429,
    });
  });

  it("maps network failures without exposing the original error", async () => {
    const fetchFn: ProviderFetch = async () => {
      throw new Error("secret upstream detail");
    };

    await expect(
      requestProviderJson({ provider, url: "https://example.test", fetchFn }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("aborts requests that exceed the configured timeout", async () => {
    const fetchFn: ProviderFetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });

    await expect(
      requestProviderJson({
        provider,
        url: "https://example.test",
        fetchFn,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("rejects JSON that does not match the runtime schema", () => {
    expect(() =>
      parseProviderPayload(z.object({ value: z.number() }), { value: "not-a-number" }, provider),
    ).toThrowError(
      expect.objectContaining({
        code: "PROVIDER_INVALID_RESPONSE",
      }),
    );
  });
});
