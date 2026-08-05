import { expect, test, type Page, type TestInfo } from "@playwright/test";

const password = "ChargeWise-E2E-Password-2026";
const vehicleNickname = "E2E i5";
const stationName = "Westfield Topanga";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/u, async (route) => {
    await route.abort("blockedbyclient");
  });
});

function createTestEmail(testInfo: TestInfo, journey: string): string {
  const runId = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;

  return `chargewise-e2e-${journey}-${runId}@example.com`;
}

async function registerAndCreateVehicle(
  page: Page,
  testInfo: TestInfo,
  journey: string,
): Promise<string> {
  const email = createTestEmail(testInfo, journey);

  await page.goto("/register");

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/vehicles$/u);
  await expect(page.getByRole("heading", { name: "Manage your vehicles." })).toBeVisible();

  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();

  await page.getByLabel("Nickname").fill(vehicleNickname);
  await page.getByLabel("Make").fill("BMW");
  await page.getByLabel("Model").fill("i5 eDrive40");
  await page.getByLabel("Year").fill("2025");
  await page.getByLabel("Battery capacity").fill("81.20");
  await page.getByLabel("Efficiency").fill("3.10");
  await page.getByLabel("CCS", { exact: true }).check();
  await page.getByLabel("Preferred charging networks").fill("Electrify America");
  await page.getByLabel("Use this as my default vehicle").check();
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();

  await expect(page.getByRole("heading", { name: vehicleNickname })).toBeVisible();
  await expect(page.getByText("Default", { exact: true })).toBeVisible();

  return email;
}

async function signOutAndBackIn(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/vehicles$/u);
  await expect(page.getByRole("heading", { name: vehicleNickname })).toBeVisible();
}

async function searchFixtureRoute(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Plan route" }).click();

  await expect(
    page.getByRole("heading", { name: "Find charging stations along your drive." }),
  ).toBeVisible();

  await page.getByLabel("Origin").fill("Woodland Hills, CA");
  await page.getByLabel("Destination").fill("UC San Diego, La Jolla, CA");
  await page.getByRole("button", { name: "Search route" }).click();

  await expect(page.getByText("Route ready", { exact: true })).toBeVisible();
  await expect(page.getByText("136.4 mi", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Select ${stationName}` })).toBeVisible();
}

async function openFixtureStation(page: Page) {
  await page.getByRole("button", { name: `Select ${stationName}` }).click();

  const details = page.getByRole("region", {
    name: `Station details for ${stationName}`,
  });

  await expect(details).toBeVisible();
  await expect(details.getByText("Compatible with selected vehicle")).toBeVisible();

  return details;
}

test("journey A: a new driver signs in, creates a vehicle, and completes a route search", async ({
  page,
}, testInfo) => {
  const email = await registerAndCreateVehicle(page, testInfo, "route");

  await signOutAndBackIn(page, email);
  await searchFixtureRoute(page);

  const details = await openFixtureStation(page);

  await expect(details.getByText("Electrify America", { exact: true })).toBeVisible();
  await expect(details.getByText("10 DC fast", { exact: true })).toBeVisible();
});

test("journey B: a saved station remains a favorite after refresh and route revisit", async ({
  page,
}, testInfo) => {
  await registerAndCreateVehicle(page, testInfo, "favorite");
  await searchFixtureRoute(page);

  let details = await openFixtureStation(page);

  await details
    .getByRole("button", {
      name: `Add ${stationName} to favorites`,
    })
    .click();

  await expect(details.getByText("Saved to favorites", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("button", {
      name: `Remove ${stationName} from favorites`,
    }),
  ).toBeVisible();

  await page.reload();
  await searchFixtureRoute(page);
  details = await openFixtureStation(page);

  await expect(details.getByText("Saved to favorites", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("button", {
      name: `Remove ${stationName} from favorites`,
    }),
  ).toBeVisible();
});

test("journey C: a logged session appears in history and updates analytics", async ({
  page,
}, testInfo) => {
  await registerAndCreateVehicle(page, testInfo, "analytics");
  await searchFixtureRoute(page);

  const details = await openFixtureStation(page);

  await details.getByRole("link", { name: "Log charging session" }).click();

  await expect(page.getByRole("heading", { name: "Log a charging session" })).toBeVisible();
  await expect(page.getByLabel("Charging station")).toHaveValue(/.+/u);

  await page.getByLabel("Energy added").fill("42.700");
  await page.getByLabel("Total cost").fill("18.35");
  await page.getByLabel("Notes").fill("Critical Playwright journey");
  await page.getByRole("button", { name: "Log session" }).click();

  const historyCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: stationName }),
  });

  await expect(historyCard).toBeVisible();
  await expect(historyCard.getByText("42.700 kWh", { exact: true })).toBeVisible();
  await expect(historyCard.getByText("$18.35", { exact: true })).toBeVisible();
  await expect(historyCard.getByText("Critical Playwright journey", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByRole("heading", { name: "Your charging dashboard." })).toBeVisible();

  const overview = page.getByRole("region", { name: "Key charging metrics" });

  await expect(overview).toBeVisible();
  await expect(overview.getByText("Sessions", { exact: true })).toBeVisible();
  await expect(overview.getByText("1", { exact: true })).toBeVisible();
  await expect(overview.getByText("42.700 kWh", { exact: true })).toBeVisible();
  await expect(overview.getByText("$18.35", { exact: true })).toBeVisible();

  await expect(page.getByRole("table", { name: "Most-used stations" })).toContainText(stationName);
});
