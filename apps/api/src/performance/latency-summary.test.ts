import { describe, expect, it } from "vitest";

import { summarizeLatencies } from "./latency-summary.js";

describe("summarizeLatencies", () => {
  it("calculates deterministic nearest-rank latency statistics", () => {
    expect(summarizeLatencies([40, 10, 20, 30, 50])).toEqual({
      sampleCount: 5,
      minimumMs: 10,
      maximumMs: 50,
      meanMs: 30,
      p50Ms: 30,
      p95Ms: 50,
    });
  });

  it("does not mutate the source samples", () => {
    const samples = [30, 10, 20];

    summarizeLatencies(samples);

    expect(samples).toEqual([30, 10, 20]);
  });

  const invalidCases: readonly {
    samples: readonly number[];
  }[] = [
    { samples: [] },
    { samples: [-1] },
    { samples: [Number.NaN] },
    { samples: [Number.POSITIVE_INFINITY] },
  ];

  it.each(invalidCases)("rejects invalid samples: $samples", ({ samples }) => {
    expect(() => summarizeLatencies(samples)).toThrow(
      "Latency samples must be finite, nonnegative, and nonempty",
    );
  });
});
