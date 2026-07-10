import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const baseUrl =
  process.env.BENCHMARK_URL || "https://bridge.demo.opensuite.online";
const username = process.env.BENCHMARK_USER;
const password = process.env.BENCHMARK_PASS;
const samples = Number(process.env.BENCHMARK_SAMPLES || 20);
const output = process.env.BENCHMARK_OUTPUT || "benchmark-result.json";
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezoneId: "Europe/Amsterdam",
});
const page = await context.newPage();

await page.addInitScript(() => {
  const state = {
    marks: {},
    globalSpinnerStarted: null,
    globalSpinnerMs: 0,
    widgetSpinnerStarted: null,
    widgetSpinnerMs: 0,
  };
  window.__openSuiteBenchmark = state;

  const visible = (selector) =>
    [...document.querySelectorAll(selector)].some((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    });

  const sample = () => {
    const now = performance.now();
    if (
      !state.marks.shell &&
      visible("#ko-portal-header, .ant-layout-header, header")
    ) {
      state.marks.shell = now;
    }
    if (!state.marks.dashboard && visible(".dashboard-grid"))
      state.marks.dashboard = now;
    if (!state.marks.firstWidgetData && visible(".custom-list-item")) {
      state.marks.firstWidgetData = now;
    }

    const globalSpinner = visible(".loading-space-up .ant-spin");
    if (globalSpinner && state.globalSpinnerStarted === null)
      state.globalSpinnerStarted = now;
    if (!globalSpinner && state.globalSpinnerStarted !== null) {
      state.globalSpinnerMs += now - state.globalSpinnerStarted;
      state.globalSpinnerStarted = null;
    }

    const widgetSpinner = visible(
      ".custom-list-loading .ant-spin, .widget-loading .ant-spin",
    );
    if (widgetSpinner && state.widgetSpinnerStarted === null)
      state.widgetSpinnerStarted = now;
    if (!widgetSpinner && state.widgetSpinnerStarted !== null) {
      state.widgetSpinnerMs += now - state.widgetSpinnerStarted;
      state.widgetSpinnerStarted = null;
    }
    requestAnimationFrame(sample);
  };
  addEventListener("DOMContentLoaded", () => requestAnimationFrame(sample), {
    once: true,
  });
});

const dashboard = page.locator(".dashboard-grid");

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
if (new URL(page.url()).hostname.startsWith("id.")) {
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}
await page.waitForURL(`${baseUrl}/**`, { timeout: 30_000 });

const loginButton = page.getByText("Log in", { exact: true });
if (await loginButton.isVisible().catch(() => false)) await loginButton.click();
await dashboard.waitFor({ state: "visible", timeout: 30_000 });

const requiredApiFragments = [
  "/api/v1/config",
  "/api/v1/caldav/calendars/",
  "/api/v1/docs/documents",
  "/api/v1/meet/rooms",
  "/api/v1/ocs/activities",
];

// Authenticate and warm browser/server caches before collecting the declared
// warm sample set. The bootstrap navigation is deliberately not mixed into it.
await page.reload({ waitUntil: "domcontentloaded" });
await dashboard.waitFor({ state: "visible", timeout: 30_000 });
await page.waitForFunction(
  (fragments) => {
    const names = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name);
    return fragments.every((fragment) =>
      names.some((name) => name.includes(fragment)),
    );
  },
  requiredApiFragments,
  { timeout: 30_000 },
);

const runs = [];
for (let index = 0; index < samples; index += 1) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await dashboard.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    (fragments) => {
      const names = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name);
      return fragments.every((fragment) =>
        names.some((name) => name.includes(fragment)),
      );
    },
    requiredApiFragments,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => !document.querySelector(".custom-list-loading .ant-spin"),
    null,
    { timeout: 30_000 },
  );

  const measured = await page.evaluate((fragments) => {
    const state = window.__openSuiteBenchmark;
    const now = performance.now();
    const globalSpinnerMs =
      state.globalSpinnerMs +
      (state.globalSpinnerStarted === null
        ? 0
        : now - state.globalSpinnerStarted);
    const widgetSpinnerMs =
      state.widgetSpinnerMs +
      (state.widgetSpinnerStarted === null
        ? 0
        : now - state.widgetSpinnerStarted);
    const resources = performance.getEntriesByType("resource");
    const durationFor = (fragment) => {
      const entry = resources.find((resource) =>
        resource.name.includes(fragment),
      );
      return entry?.duration;
    };
    const responseEndFor = (fragment) => {
      const entry = resources.find((resource) =>
        resource.name.includes(fragment),
      );
      return entry?.responseEnd;
    };
    const ends = fragments.map(responseEndFor).filter(Number.isFinite);
    const configResponseEnd = responseEndFor("/api/v1/config");
    return {
      metrics: {
        shell_ms: state.marks.shell,
        dashboard_ms: state.marks.dashboard,
        config_to_dashboard_ms:
          Number.isFinite(configResponseEnd) &&
          Number.isFinite(state.marks.dashboard)
            ? state.marks.dashboard - configResponseEnd
            : undefined,
        first_widget_data_ms: state.marks.firstWidgetData,
        all_widgets_ms: ends.length ? Math.max(...ends) : undefined,
        global_spinner_ms: globalSpinnerMs,
        widget_spinner_ms: widgetSpinnerMs,
        config_ms: durationFor("/api/v1/config"),
        calendar_ms: durationFor("/api/v1/caldav/calendars/"),
        docs_ms: durationFor("/api/v1/docs/documents"),
        meet_ms: durationFor("/api/v1/meet/rooms"),
        files_ms: durationFor("/api/v1/ocs/activities"),
      },
      resources: resources
        .filter((resource) => resource.name.includes("/api/v1/"))
        .map(({ name, startTime, duration, responseEnd, transferSize }) => ({
          name: new URL(name).pathname,
          startTime,
          duration,
          responseEnd,
          transferSize,
        })),
    };
  }, requiredApiFragments);
  runs.push({ index: index + 1, ...measured });
  console.log(
    `sample ${index + 1}/${samples}: calendar=${Math.round(measured.metrics.calendar_ms)}ms dashboard=${Math.round(measured.metrics.dashboard_ms)}ms`,
  );
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
    cache: "warm browser and server caches after authenticated bootstrap",
  },
  samples,
  summary: summarize(runs),
  runs,
};

await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
await browser.close();
