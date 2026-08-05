import process from "node:process";

const retryIntervalMilliseconds = 5_000;
const readinessDeadlineMilliseconds = 180_000;
const requestTimeoutMilliseconds = 15_000;

function requireDeploymentOrigin(value) {
  if (value === undefined || value.trim() === "") {
    throw new Error("DEPLOYMENT_URL is required");
  }

  const url = new globalThis.URL(value.trim());

  if (url.protocol !== "https:") {
    throw new Error("DEPLOYMENT_URL must use HTTPS");
  }

  if (url.origin !== value.trim().replace(/\/$/u, "")) {
    throw new Error("DEPLOYMENT_URL must contain only the deployment origin");
  }

  return url.origin;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

async function fetchWithTimeout(url, init = {}) {
  return globalThis.fetch(url, {
    ...init,
    signal: globalThis.AbortSignal.timeout(requestTimeoutMilliseconds),
  });
}

async function waitForReadiness(origin) {
  const deadline = Date.now() + readinessDeadlineMilliseconds;
  let lastStatus = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${origin}/api/v1/health`, {
        headers: {
          Accept: "application/json",
        },
      });
      const body = await response.json();

      if (
        response.status === 200 &&
        body?.data?.readiness === "ready" &&
        body?.data?.dependencies?.database === "up" &&
        body?.data?.dependencies?.cache === "up"
      ) {
        return;
      }

      lastStatus = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.name : typeof error;
    }

    await sleep(retryIntervalMilliseconds);
  }

  throw new Error(`Deployment did not become ready: ${lastStatus}`);
}

async function verifyDocument(origin, path) {
  const response = await fetchWithTimeout(`${origin}${path}`, {
    headers: {
      Accept: "text/html",
    },
  });
  const body = await response.text();

  if (!response.ok || !body.includes('id="root"')) {
    throw new Error(`${path} did not return the ChargeWise application shell`);
  }

  return response;
}

async function verifyUnknownApiRoute(origin) {
  const response = await fetchWithTimeout(`${origin}/api/v1/deployment-smoke-missing`, {
    headers: {
      Accept: "application/json",
    },
  });
  const body = await response.json();

  if (response.status !== 404 || body?.error?.code !== "NOT_FOUND") {
    throw new Error("Unknown API routes do not preserve the JSON error contract");
  }
}

async function main() {
  const origin = requireDeploymentOrigin(process.env.DEPLOYMENT_URL);

  process.stdout.write(`Checking ChargeWise deployment at ${origin}...\n`);

  await waitForReadiness(origin);

  const homeResponse = await verifyDocument(origin, "/");
  await verifyDocument(origin, "/login");
  await verifyUnknownApiRoute(origin);

  const contentSecurityPolicy = homeResponse.headers.get("content-security-policy") ?? "";

  if (!contentSecurityPolicy.includes("https://*.tile.openstreetmap.org")) {
    throw new Error("Production CSP does not permit the configured map tile origin");
  }

  process.stdout.write("ChargeWise deployment smoke checks passed.\n");
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`ChargeWise deployment smoke check failed: ${message}\n`);
  process.exitCode = 1;
});
