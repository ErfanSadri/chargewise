import type { HealthDependencyStatus, HealthResponse } from "@chargewise/shared";

const dependencyCheckTimeoutMilliseconds = 2_500;

export type HealthDependencyName = keyof HealthResponse["data"]["dependencies"];
export type DependencyCheck = () => Promise<void>;

export interface HealthChecks {
  database: DependencyCheck;
  cache: DependencyCheck;
}

export interface HealthCheckFailure {
  dependency: HealthDependencyName;
  error: unknown;
}

export interface HealthCheckResult {
  statusCode: 200 | 503;
  body: HealthResponse;
  failures: readonly HealthCheckFailure[];
}

type DependencyResult =
  | {
      dependency: HealthDependencyName;
      status: "up";
    }
  | {
      dependency: HealthDependencyName;
      status: "down";
      error: unknown;
    };

async function runDependencyCheck(
  dependency: HealthDependencyName,
  check: DependencyCheck,
): Promise<DependencyResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Health check timed out for ${dependency}`));
        }, dependencyCheckTimeoutMilliseconds);
      }),
    ]);

    return {
      dependency,
      status: "up",
    };
  } catch (error: unknown) {
    return {
      dependency,
      status: "down",
      error,
    };
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export async function checkHealth(checks: HealthChecks): Promise<HealthCheckResult> {
  const [databaseResult, cacheResult] = await Promise.all([
    runDependencyCheck("database", checks.database),
    runDependencyCheck("cache", checks.cache),
  ]);

  const dependencies: Record<HealthDependencyName, HealthDependencyStatus> = {
    database: databaseResult.status,
    cache: cacheResult.status,
  };
  const readiness =
    dependencies.database === "up" && dependencies.cache === "up" ? "ready" : "not_ready";
  const failures = [databaseResult, cacheResult].flatMap((result) =>
    result.status === "down"
      ? [
          {
            dependency: result.dependency,
            error: result.error,
          },
        ]
      : [],
  );

  return {
    statusCode: readiness === "ready" ? 200 : 503,
    body: {
      data: {
        process: "up",
        readiness,
        dependencies,
      },
    },
    failures,
  };
}
