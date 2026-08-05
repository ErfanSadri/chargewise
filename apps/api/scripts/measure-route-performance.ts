import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { createClient } from "redis";

import { summarizeLatencies, type LatencySummary } from "../src/performance/latency-summary.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const apiOrigin = "http://127.0.0.1:3200";
const webOrigin = "http://127.0.0.1:4273";
const defaultDatabaseUrl =
  "postgresql://chargewise:chargewise@127.0.0.1:5433/chargewise_performance";
const defaultRedisUrl = "redis://127.0.0.1:6379/14";
const sampleCount = 30;
const cachedTargetP95Ms = 750;
const uncachedTargetP95Ms = 3000;

interface RouteRequest {
  origin: string;
  destination: string;
  vehicleId: string;
  corridorMeters: number;
  filters: {
    compatibleOnly: boolean;
    networks: string[];
    chargingLevels: ["DC_FAST"];
    publicOnly: boolean;
    operatingOnly: boolean;
  };
}

interface PerformanceEvidence {
  generatedAt: string;
  methodology: {
    providerMode: "fixture";
    requestMode: "sequential";
    sampleCountPerPath: number;
    apiOrigin: string;
    database: string;
    redisDatabase: number | null;
  };
  runtime: {
    node: string;
    platform: string;
    architecture: string;
    cpu: string;
  };
  targets: {
    cachedP95Ms: number;
    uncachedP95Ms: number;
  };
  results: {
    uncached: LatencySummary;
    cached: LatencySummary;
  };
  rawSamplesMs: {
    uncached: number[];
    cached: number[];
  };
}

function getDatabaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/u, ""));
}

function getRedisDatabase(redisUrl: string): number | null {
  const pathName = new URL(redisUrl).pathname.replace(/^\/+/u, "");

  if (pathName === "") {
    return 0;
  }

  const database = Number(pathName);

  return Number.isInteger(database) ? database : null;
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const targetUrl = new URL(databaseUrl);
  const databaseName = getDatabaseName(databaseUrl);

  if (!/^[A-Za-z0-9_-]+$/u.test(databaseName)) {
    throw new Error("Performance database name contains unsupported characters");
  }

  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();

    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [databaseName],
    );

    if (!result.rows[0]?.exists) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}

function runMigrations(databaseUrl: string): void {
  const result = spawnSync("pnpm", ["--filter", "@chargewise/database", "db:migrate"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Performance database migration failed with exit code ${String(result.status)}`,
    );
  }
}

async function resetDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(
      "TRUNCATE TABLE charging_sessions, favorites, vehicles, users, stations RESTART IDENTITY CASCADE",
    );
  } finally {
    await client.end();
  }
}

async function resetRedis(redisUrl: string): Promise<void> {
  const client = createClient({ url: redisUrl });

  client.on("error", (error) => {
    process.stderr.write(`Performance Redis client error: ${error.name}\n`);
  });

  try {
    await client.connect();
    await client.flushDb();
  } finally {
    if (client.isOpen) {
      await client.close();
    }
  }
}

async function prepareInfrastructure(databaseUrl: string, redisUrl: string): Promise<void> {
  await ensureDatabaseExists(databaseUrl);
  runMigrations(databaseUrl);
  await resetDatabase(databaseUrl);
  await resetRedis(redisUrl);
}

function startApi(
  databaseUrl: string,
  redisUrl: string,
): {
  process: ChildProcess;
  readOutput: () => string;
} {
  const child = spawn("pnpm", ["--filter", "@chargewise/api", "exec", "tsx", "src/server.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      API_PORT: "3200",
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
      REDIS_URL: redisUrl,
      ROUTE_PROVIDER_MODE: "fixture",
      SESSION_SECRET: "chargewise_performance_session_secret_at_least_32_characters",
      TRUST_PROXY_HOPS: "0",
      WEB_ORIGIN: webOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  return {
    process: child,
    readOutput: () => output,
  };
}

async function waitForApi(child: ChildProcess, readOutput: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Performance API stopped before becoming ready:\n${readOutput()}`);
    }

    try {
      const response = await fetch(`${apiOrigin}/api/v1/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The API process may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Performance API did not become ready:\n${readOutput()}`);
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, 5_000);

  timeout.unref();

  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeout);
  }
}

function createHeaders(cookie?: string): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: webOrigin,
  });

  if (cookie !== undefined) {
    headers.set("Cookie", cookie);
  }

  return headers;
}

async function requireSuccessfulResponse(
  response: Response,
  description: string,
): Promise<unknown> {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${description} failed with ${response.status}: ${body.slice(0, 500)}`);
  }

  return body === "" ? undefined : (JSON.parse(body) as unknown);
}

async function createAuthenticatedVehicle(): Promise<{
  cookie: string;
  vehicleId: string;
}> {
  const email = `performance-${Date.now()}@example.com`;
  const password = "ChargeWise-Performance-Password-2026";

  const registration = await fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: "POST",
    headers: createHeaders(),
    body: JSON.stringify({ email, password }),
  });

  await requireSuccessfulResponse(registration, "Registration");

  const setCookie = registration.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0];

  if (cookie === undefined || cookie === "") {
    throw new Error("Registration did not return a session cookie");
  }

  const vehicleResponse = await fetch(`${apiOrigin}/api/v1/vehicles`, {
    method: "POST",
    headers: createHeaders(cookie),
    body: JSON.stringify({
      nickname: "Performance i5",
      make: "BMW",
      model: "i5 eDrive40",
      year: 2025,
      batteryCapacityKwh: "81.20",
      efficiencyMiPerKwh: "3.10",
      connectorTypes: ["CCS"],
      preferredNetworks: ["Electrify America"],
      isDefault: true,
    }),
  });

  const vehiclePayload = await requireSuccessfulResponse(vehicleResponse, "Vehicle creation");

  if (
    typeof vehiclePayload !== "object" ||
    vehiclePayload === null ||
    !("data" in vehiclePayload) ||
    typeof vehiclePayload.data !== "object" ||
    vehiclePayload.data === null ||
    !("id" in vehiclePayload.data) ||
    typeof vehiclePayload.data.id !== "string"
  ) {
    throw new Error("Vehicle response did not contain an ID");
  }

  return {
    cookie,
    vehicleId: vehiclePayload.data.id,
  };
}

function createRouteRequest(vehicleId: string, suffix: string): RouteRequest {
  return {
    origin: `Woodland Hills, CA ${suffix}`,
    destination: `UC San Diego, La Jolla, CA ${suffix}`,
    vehicleId,
    corridorMeters: 8046.72,
    filters: {
      compatibleOnly: true,
      networks: [],
      chargingLevels: ["DC_FAST"],
      publicOnly: true,
      operatingOnly: true,
    },
  };
}

async function measureRouteSearch(cookie: string, request: RouteRequest): Promise<number> {
  const startedAt = performance.now();

  const response = await fetch(`${apiOrigin}/api/v1/routes/search`, {
    method: "POST",
    headers: createHeaders(cookie),
    body: JSON.stringify(request),
  });

  const durationMs = performance.now() - startedAt;
  const payload = await requireSuccessfulResponse(response, "Route search");

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("meta" in payload) ||
    typeof payload.meta !== "object" ||
    payload.meta === null ||
    !("stationCount" in payload.meta) ||
    payload.meta.stationCount !== 1
  ) {
    throw new Error("Route search did not return the expected fixture station");
  }

  return Number(durationMs.toFixed(3));
}

function getTargetResult(p95Ms: number, targetMs: number): string {
  return p95Ms < targetMs ? "below" : "not below";
}

function createMarkdown(evidence: PerformanceEvidence): string {
  const { uncached, cached } = evidence.results;
  const p95Difference = Number((uncached.p95Ms - cached.p95Ms).toFixed(3));
  const direction =
    p95Difference >= 0 ? `${p95Difference} ms slower` : `${Math.abs(p95Difference)} ms faster`;

  return `# Route-search performance measurement

Ticket: CHG-062  
Generated: ${evidence.generatedAt}

## Methodology

This is a controlled local measurement of the real HTTP API, PostgreSQL
persistence, Redis session/cache infrastructure, route-search service, and
response serialization. Requests were sequential. External providers were
replaced with the deterministic fixture adapters introduced for browser tests.

Each path used ${evidence.methodology.sampleCountPerPath} measured requests after
warm-up:

- **Uncached:** every request used a unique normalized location pair, forcing a
  provider-discovery cache miss.
- **Cached:** one request primed a fixed location pair, followed by repeated
  requests for the same cache key.

Raw machine-specific samples are written to
\`artifacts/performance/route-search-local.json\` and are intentionally ignored
by Git.

## Environment

- Node: ${evidence.runtime.node}
- Platform: ${evidence.runtime.platform} (${evidence.runtime.architecture})
- CPU: ${evidence.runtime.cpu}
- Provider mode: fixture
- Database: ${evidence.methodology.database}
- Redis database: ${String(evidence.methodology.redisDatabase)}

## Results

| Path | Samples | Min | Mean | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Uncached route search | ${uncached.sampleCount} | ${uncached.minimumMs} ms | ${uncached.meanMs} ms | ${uncached.p50Ms} ms | ${uncached.p95Ms} ms | ${uncached.maximumMs} ms |
| Cached route search | ${cached.sampleCount} | ${cached.minimumMs} ms | ${cached.meanMs} ms | ${cached.p50Ms} ms | ${cached.p95Ms} ms | ${cached.maximumMs} ms |

The uncached path was ${direction} than the cached path at p95 in this run.

## Target comparison

The product requirements target a cached p95 below
${evidence.targets.cachedP95Ms} ms and an uncached p95 below
${evidence.targets.uncachedP95Ms} ms. This controlled local fixture run was
${getTargetResult(cached.p95Ms, evidence.targets.cachedP95Ms)} the cached target
and ${getTargetResult(uncached.p95Ms, evidence.targets.uncachedP95Ms)} the
uncached target.

These results do **not** prove production performance. Fixture providers avoid
real upstream latency, provider rate limits, public-network variance, and
deployment-region latency. Production measurements must be repeated after
CHG-063 using the deployed API and carefully rate-limited live-provider
requests.

## Cache policy

The Redis entry contains only regenerable route discovery data: normalized
geocoding choices, route geometry/summary, and normalized station-provider
records. The key includes normalized origin, destination, and corridor distance.
Vehicle compatibility, request filters, persisted station IDs, and user
favorites are applied after the cache read, so user-specific state is not shared
through Redis.

The configured default TTL remains 900 seconds. Fifteen minutes limits stale
provider data while allowing repeated route refinements and revisits to avoid
duplicate external discovery work. Favorites and charging sessions remain
uncached sources of truth.

## Interpretation and follow-up

Structured route-search logs now record cache status, service duration, and
discovered/returned station counts. The controlled benchmark distinguishes the
cache-hit and cache-miss paths, but it cannot identify which live provider is
the production bottleneck because fixture adapters return in-memory data.

After deployment:

1. measure the same route with production infrastructure;
2. keep requests sequential and within provider limits;
3. record cache-hit and cache-miss p50/p95 separately;
4. use structured logs to correlate slow requests;
5. change the TTL only when measurements or provider freshness behavior justify
   it.
`;
}

async function writeEvidence(evidence: PerformanceEvidence): Promise<void> {
  const artifactsDirectory = path.join(repositoryRoot, "artifacts", "performance");
  const documentationPath = path.join(repositoryRoot, "docs", "10-performance-measurement.md");

  await mkdir(artifactsDirectory, { recursive: true });

  await writeFile(
    path.join(artifactsDirectory, "route-search-local.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await writeFile(documentationPath, createMarkdown(evidence));
}

async function main(): Promise<void> {
  const databaseUrl = process.env.PERFORMANCE_DATABASE_URL ?? defaultDatabaseUrl;
  const redisUrl = process.env.PERFORMANCE_REDIS_URL ?? defaultRedisUrl;

  process.stdout.write("Preparing isolated performance infrastructure...\n");
  await prepareInfrastructure(databaseUrl, redisUrl);

  const api = startApi(databaseUrl, redisUrl);

  try {
    await waitForApi(api.process, api.readOutput);

    const { cookie, vehicleId } = await createAuthenticatedVehicle();

    for (let index = 0; index < 3; index += 1) {
      await measureRouteSearch(cookie, createRouteRequest(vehicleId, `warmup-${index}`));
    }

    const uncachedSamples: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      uncachedSamples.push(
        await measureRouteSearch(cookie, createRouteRequest(vehicleId, `uncached-${index}`)),
      );
    }

    const cachedRequest = createRouteRequest(vehicleId, "cached");
    await measureRouteSearch(cookie, cachedRequest);

    const cachedSamples: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      cachedSamples.push(await measureRouteSearch(cookie, cachedRequest));
    }

    const evidence: PerformanceEvidence = {
      generatedAt: new Date().toISOString(),
      methodology: {
        providerMode: "fixture",
        requestMode: "sequential",
        sampleCountPerPath: sampleCount,
        apiOrigin,
        database: getDatabaseName(databaseUrl),
        redisDatabase: getRedisDatabase(redisUrl),
      },
      runtime: {
        node: process.version,
        platform: os.platform(),
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model ?? "unknown",
      },
      targets: {
        cachedP95Ms: cachedTargetP95Ms,
        uncachedP95Ms: uncachedTargetP95Ms,
      },
      results: {
        uncached: summarizeLatencies(uncachedSamples),
        cached: summarizeLatencies(cachedSamples),
      },
      rawSamplesMs: {
        uncached: uncachedSamples,
        cached: cachedSamples,
      },
    };

    await writeEvidence(evidence);

    process.stdout.write(`Uncached p95: ${evidence.results.uncached.p95Ms} ms\n`);
    process.stdout.write(`Cached p95: ${evidence.results.cached.p95Ms} ms\n`);
    process.stdout.write("Wrote docs/10-performance-measurement.md and local raw evidence.\n");
  } finally {
    await stopApi(api.process);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`Route-search performance measurement failed: ${message}\n`);
  process.exitCode = 1;
});
