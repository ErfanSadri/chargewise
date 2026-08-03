import { createApp } from "./app.js";
import { loadLocalEnvironment, parseEnvironment } from "./config/environment.js";
import { createInfrastructureHealthChecks } from "./health/infrastructure-health-checks.js";
import { createLogger } from "./logging/logger.js";

const shutdownTimeoutMilliseconds = 5_000;

loadLocalEnvironment();

const environment = parseEnvironment();
const logger = createLogger(environment.NODE_ENV);
const infrastructureHealthChecks = createInfrastructureHealthChecks({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
  onBackgroundError: (dependency, error) => {
    logger.warn(
      {
        dependency,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Health dependency client error",
    );
  },
});
const app = createApp({
  healthChecks: infrastructureHealthChecks.checks,
  logger,
  webOrigin: environment.WEB_ORIGIN,
});

const server = app.listen(environment.API_PORT, () => {
  logger.info(
    {
      port: environment.API_PORT,
    },
    "ChargeWise API started",
  );
});

let infrastructureClosePromise: Promise<void> | undefined;

function closeInfrastructure(): Promise<void> {
  infrastructureClosePromise ??= infrastructureHealthChecks.close();
  return infrastructureClosePromise;
}

async function handleServerError(error: Error): Promise<void> {
  logger.fatal(
    {
      errorType: error.name,
    },
    "ChargeWise API failed to start",
  );
  process.exitCode = 1;

  try {
    await closeInfrastructure();
  } catch (closeError: unknown) {
    logger.error(
      {
        errorType: closeError instanceof Error ? closeError.name : typeof closeError,
      },
      "ChargeWise infrastructure cleanup failed",
    );
  }
}

server.on("error", (error: Error) => {
  void handleServerError(error);
});

let isShuttingDown = false;

async function closeHttpServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let hasSettled = false;

    const settle = (error?: Error): void => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      clearTimeout(timeout);

      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    };

    const timeout = setTimeout(() => {
      logger.warn(
        { timeoutMilliseconds: shutdownTimeoutMilliseconds },
        "ChargeWise API shutdown timed out; closing active connections",
      );
      server.closeAllConnections();
      settle(new Error("HTTP server shutdown timed out"));
    }, shutdownTimeoutMilliseconds);
    timeout.unref();

    server.close((error) => {
      settle(error);
    });
  });
}

async function shutDown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  process.off("SIGINT", handleSigint);
  process.off("SIGTERM", handleSigterm);
  logger.info({ signal }, "ChargeWise API shutting down");

  let shutdownFailed = false;

  try {
    await closeHttpServer();
  } catch (error: unknown) {
    shutdownFailed = true;
    logger.error(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "ChargeWise HTTP server shutdown failed",
    );
  }

  try {
    await closeInfrastructure();
  } catch (error: unknown) {
    shutdownFailed = true;
    logger.error(
      {
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "ChargeWise infrastructure shutdown failed",
    );
  }

  if (shutdownFailed) {
    process.exitCode = 1;
    return;
  }

  logger.info("ChargeWise API stopped");
}

function handleSigint(): void {
  void shutDown("SIGINT");
}

function handleSigterm(): void {
  void shutDown("SIGTERM");
}

process.once("SIGINT", handleSigint);
process.once("SIGTERM", handleSigterm);
