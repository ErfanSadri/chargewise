import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((file) => file !== "");

const failures = [];

const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u;

const browserSecretNamePattern =
  /\b(?:DATABASE_URL|REDIS_URL|SESSION_SECRET|OPENROUTESERVICE_API_KEY|NLR_API_KEY)\b/u;

for (const file of trackedFiles) {
  const basename = path.basename(file);

  if ((basename === ".env" || basename.startsWith(".env.")) && basename !== ".env.example") {
    failures.push(`${file}: tracked environment file`);
    continue;
  }

  let content;

  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (privateKeyPattern.test(content)) {
    failures.push(`${file}: private-key material`);
  }

  if (file.startsWith("apps/web/") && browserSecretNamePattern.test(content)) {
    failures.push(`${file}: server-only secret name referenced by browser code`);
  }
}

if (failures.length > 0) {
  process.stderr.write("Tracked secret-boundary check failed:\n");

  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }

  process.exitCode = 1;
} else {
  process.stdout.write(
    `Tracked secret-boundary check passed (${trackedFiles.length} files inspected).\n`,
  );
}
