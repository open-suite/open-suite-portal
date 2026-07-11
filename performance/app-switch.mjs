import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

import { chromium } from "playwright";

const baseUrl =
  process.env.BENCHMARK_URL || "https://bridge.demo.opensuite.online";
const username = process.env.BENCHMARK_USER;
const password = process.env.BENCHMARK_PASS;
const samples = Number(process.env.BENCHMARK_SAMPLES || 10);
const hoverLeadMs = Number(process.env.BENCHMARK_HOVER_MS || 200);
const output = process.env.BENCHMARK_OUTPUT || "app-switch-result.json";
const label = process.env.BENCHMARK_LABEL || "unlabelled";

if (!username || !password) {
  console.error("Set BENCHMARK_USER and BENCHMARK_PASS");
  process.exit(2);
}

const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.ceil(fraction * sorted.length) - 1];
};

const summarize = (runs) => {
  const keys = [...new Set(runs.flatMap((run) => Object.keys(run.metrics)))];
  return Object.fromEntries(
    keys.map((key) => {
      const values = runs
        .map((run) => run.metrics[key])
        .filter(Number.isFinite);
      return [
        key,
        {
          n: values.length,
          p50: percentile(values, 0.5),
          p75: percentile(values, 0.75),
          p95: percentile(values, 0.95),
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
        },
      ];
    }),
  );
};

const browser = await chromium.launch({ headless: true });
const bootstrapContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezoneId: "Europe/Amsterdam",
});
const bootstrapPage = await bootstrapContext.newPage();
await bootstrapPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
if (new URL(bootstrapPage.url()).hostname.startsWith("id.")) {
  await bootstrapPage.locator("#username").fill(username);
  await bootstrapPage.locator("#password").fill(password);
  await bootstrapPage.locator("#kc-login").click();
}
await bootstrapPage.waitForURL(`${baseUrl}/**`, { timeout: 30_000 });
const loginButton = bootstrapPage.getByText("Log in", { exact: true });
if (await loginButton.isVisible().catch(() => false)) await loginButton.click();
await bootstrapPage
  .locator(".dashboard-grid")
  .waitFor({ state: "visible", timeout: 30_000 });
const storageState = await bootstrapContext.storageState();
await bootstrapContext.close();

const runs = [];
for (let index = 0; index < samples; index += 1) {
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Amsterdam",
  });
  const nextcloudRequests = [];
  context.on("request", (request) => {
    if (new URL(request.url()).hostname.startsWith("nextcloud.")) {
      nextcloudRequests.push(request);
    }
  });

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page
    .locator(".dashboard-grid")
    .waitFor({ state: "visible", timeout: 30_000 });

  const suiteHeader = page.locator("#ko-portal-header");
  await suiteHeader.waitFor({ state: "visible", timeout: 5_000 });
  const office = suiteHeader
    .locator(".ko-item > .ko-link")
    .filter({ hasText: "Office" });
  const officeCount = await office.count();
  if (officeCount !== 1) {
    throw new Error(
      `Expected one Office menu item, found ${officeCount}: ${await suiteHeader.innerText()}`,
    );
  }
  await office.hover();
  await office.click();
  const documents = suiteHeader.getByRole("link", {
    name: "Documents",
    exact: true,
  });
  if ((await documents.count()) !== 1)
    throw new Error("Expected one Documents link");
  await documents.hover();
  const preconnectPresent = await page.evaluate(() =>
    Boolean(
      document.head.querySelector(
        'link[rel="preconnect"][data-opensuite-preconnect]',
      ),
    ),
  );
  await page.waitForTimeout(hoverLeadMs);

  const clickedAt = performance.now();
  await documents.click();
  await page.waitForURL(/https:\/\/nextcloud\..*\/apps\/office\/documents/, {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  const targetReadyMs = performance.now() - clickedAt;

  const firstNextcloud = nextcloudRequests[0];
  const timing = firstNextcloud?.timing();
  const connectMs =
    timing &&
    timing.connectStart >= 0 &&
    timing.connectEnd >= timing.connectStart
      ? timing.connectEnd - timing.connectStart
      : 0;
  const tlsMs =
    timing &&
    timing.secureConnectionStart >= 0 &&
    timing.connectEnd >= timing.secureConnectionStart
      ? timing.connectEnd - timing.secureConnectionStart
      : 0;

  const metrics = {
    target_ready_ms: targetReadyMs,
    first_nextcloud_connect_ms: connectMs,
    first_nextcloud_tls_ms: tlsMs,
    preconnect_present: preconnectPresent ? 1 : 0,
  };
  runs.push({ index: index + 1, metrics });
  console.log(
    `sample ${index + 1}/${samples}: target=${Math.round(targetReadyMs)}ms connect=${Math.round(connectMs)}ms preconnect=${preconnectPresent}`,
  );
  await context.close();
}

const result = {
  schemaVersion: 1,
  label,
  capturedAt: new Date().toISOString(),
  target: baseUrl,
  browser: await browser.version(),
  profile: {
    viewport: "1440x900",
    locale: "en-US",
    timezone: "Europe/Amsterdam",
    context:
      "fresh browser context per sample with established portal/Keycloak SSO cookies",
    journey:
      "hover and open Office, hover Documents for 200ms, click, wait for Nextcloud Documents DOMContentLoaded",
  },
  samples,
  hoverLeadMs,
  summary: summarize(runs),
  runs,
};

await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
await browser.close();
