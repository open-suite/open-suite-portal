import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const baseUrl =
  process.env.BENCHMARK_URL || "https://bridge.demo.opensuite.online";
const username = process.env.BENCHMARK_USER;
const password = process.env.BENCHMARK_PASS;
const samples = Number(process.env.BENCHMARK_SAMPLES || 10);
const pacingMs = Number(process.env.BENCHMARK_PACING_MS || 1000);
const syncDelayMs = Number(process.env.BENCHMARK_CHAT_SYNC_DELAY_MS || 0);
const output = process.env.BENCHMARK_OUTPUT || "chat-benchmark-result.json";
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

if (syncDelayMs > 0) {
  await page.route("**/_matrix/client/v3/sync?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("timeout") === "0") {
      await new Promise((resolve) => setTimeout(resolve, syncDelayMs));
    }
    await route.continue();
  });
}

await page.addInitScript(() => {
  const state = {
    cardMs: null,
    readyMs: null,
    spinnerStarted: null,
    spinnerMs: 0,
  };
  window.__openSuiteChatBenchmark = state;

  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
  };
  const findChatCard = () =>
    [...document.querySelectorAll(".ant-card")].find((card) =>
      card.querySelector('a[href*="element."]'),
    );

  const sample = () => {
    const now = performance.now();
    const card = findChatCard();
    if (card && state.cardMs === null) state.cardMs = now;

    const spinner = card?.querySelector(".widget-loading .ant-spin");
    if (visible(spinner) && state.spinnerStarted === null) {
      state.spinnerStarted = now;
    }
    if (!visible(spinner) && state.spinnerStarted !== null) {
      state.spinnerMs += now - state.spinnerStarted;
      state.spinnerStarted = null;
    }

    const content = card?.querySelector(
      ".ant-empty, .ant-list, .ant-card-body button",
    );
    if (state.readyMs === null && visible(content) && !visible(spinner)) {
      state.readyMs = now;
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
await dashboard.waitFor({ state: "visible", timeout: 30_000 });

const matrixSession = await page.evaluate(() =>
  localStorage.getItem("matrix_session"),
);
if (!matrixSession) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const connected = await page
      .evaluate(() => localStorage.getItem("matrix_session") !== null)
      .catch(() => false);
    if (connected) break;
    await page.waitForTimeout(100);
  }
  const connected = await page.evaluate(
    () => localStorage.getItem("matrix_session") !== null,
  );
  if (!connected)
    throw new Error("Chat did not establish Matrix SSO automatically");
  await dashboard.waitFor({ state: "visible", timeout: 30_000 });
}

const initialSync = (timeout = 30_000) =>
  page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/_matrix/client/v3/sync" &&
        url.searchParams.get("timeout") === "0"
      );
    },
    { timeout },
  );

// Warm the authenticated portal, Matrix session and server caches before the
// measured reloads. The Matrix sync itself remains a real network request.
{
  const sync = initialSync();
  await page.reload({ waitUntil: "domcontentloaded" });
  await sync;
  await page.waitForFunction(
    () => Number.isFinite(window.__openSuiteChatBenchmark?.readyMs),
    null,
    { timeout: 30_000 },
  );
}

const runs = [];
let attempts = 0;
const maxAttempts = samples + 5;
while (runs.length < samples && attempts < maxAttempts) {
  attempts += 1;
  try {
    const startedAt = Date.now();
    const sync = initialSync();
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await sync;
    const syncResponseMs = Date.now() - startedAt;
    await page.waitForFunction(
      () => Number.isFinite(window.__openSuiteChatBenchmark?.readyMs),
      null,
      { timeout: 30_000 },
    );

    const metrics = await page.evaluate((measuredSyncMs) => {
      const state = window.__openSuiteChatBenchmark;
      const now = performance.now();
      return {
        chat_card_ms: state.cardMs,
        chat_ready_ms: state.readyMs,
        chat_spinner_ms:
          state.spinnerMs +
          (state.spinnerStarted === null ? 0 : now - state.spinnerStarted),
        matrix_initial_sync_ms: measuredSyncMs,
      };
    }, syncResponseMs);
    runs.push({
      index: runs.length + 1,
      metrics,
      matrixStatus: response.status(),
    });
    console.log(
      `sample ${runs.length}/${samples}: ready=${Math.round(metrics.chat_ready_ms)}ms spinner=${Math.round(metrics.chat_spinner_ms)}ms sync=${metrics.matrix_initial_sync_ms}ms`,
    );
  } catch (error) {
    console.warn(
      `discarded attempt ${attempts}: ${error.message.split("\n")[0]}`,
    );
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    continue;
  }
  if (runs.length < samples && pacingMs > 0) {
    await page.waitForTimeout(pacingMs);
  }
}

if (runs.length < samples) {
  throw new Error(
    `Only collected ${runs.length}/${samples} samples after ${attempts} attempts`,
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
    cache: "warm browser, portal session, Matrix session and server caches",
  },
  samples,
  pacingMs,
  syncDelayMs,
  discardedAttempts: attempts - runs.length,
  summary: summarize(runs),
  runs,
};

await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
await browser.close();
