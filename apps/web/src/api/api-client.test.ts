import { afterEach, describe, expect, it, vi } from "vitest";

import { requestJson, requestNoContent } from "./api-client.ts";

const responseSchema = {
  parse(value: unknown) {
    return value as {
      data: {
        success: boolean;
      };
    };
  },
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("sends authenticated JSON requests and parses responses", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          data: {
            success: true,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      requestJson("/example", responseSchema, {
        method: "POST",
        body: {
          value: "test",
        },
      }),
    ).resolves.toEqual({
      data: {
        success: true,
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [path, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(path).toBe("/api/v1/example");
    expect(requestInit).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        value: "test",
      }),
    });

    const headers = new Headers(requestInit?.headers);

    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws a typed API error from the standard envelope", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            code: "CONFLICT",
            message: "The resource already exists",
            details: [],
          },
          requestId: "req_test",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(requestJson("/example", responseSchema)).rejects.toMatchObject({
      name: "ApiError",
      statusCode: 409,
      code: "CONFLICT",
      message: "The resource already exists",
      requestId: "req_test",
    });
  });

  it("uses a safe fallback for malformed error responses", async () => {
    mockFetch(
      new Response("not-json", {
        status: 503,
      }),
    );

    await expect(requestJson("/example", responseSchema)).rejects.toMatchObject({
      statusCode: 503,
      code: "REQUEST_FAILED",
      message: "The request could not be completed",
    });
  });

  it("accepts successful no-content responses", async () => {
    mockFetch(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(
      requestNoContent("/example", {
        method: "DELETE",
      }),
    ).resolves.toBeUndefined();
  });
});
