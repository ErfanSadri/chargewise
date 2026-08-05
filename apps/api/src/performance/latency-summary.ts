export interface LatencySummary {
  sampleCount: number;
  minimumMs: number;
  maximumMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
}

function roundMilliseconds(value: number): number {
  return Number(value.toFixed(3));
}

function nearestRank(sortedSamples: readonly number[], percentile: number): number {
  const rank = Math.max(1, Math.ceil(percentile * sortedSamples.length));
  const value = sortedSamples[rank - 1];

  if (value === undefined) {
    throw new Error("Latency percentile could not be calculated");
  }

  return value;
}

export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError("Latency samples must be finite, nonnegative, and nonempty");
  }

  const sortedSamples = [...samples].sort((left, right) => left - right);
  const total = sortedSamples.reduce((sum, sample) => sum + sample, 0);

  return {
    sampleCount: sortedSamples.length,
    minimumMs: roundMilliseconds(sortedSamples[0] ?? 0),
    maximumMs: roundMilliseconds(sortedSamples.at(-1) ?? 0),
    meanMs: roundMilliseconds(total / sortedSamples.length),
    p50Ms: roundMilliseconds(nearestRank(sortedSamples, 0.5)),
    p95Ms: roundMilliseconds(nearestRank(sortedSamples, 0.95)),
  };
}
