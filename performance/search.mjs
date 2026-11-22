// Serve the production frontend export on localhost before running this fixture.
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = new URL(process.argv[2] || "http://127.0.0.1:4187");
if (base.hostname !== "127.0.0.1") throw new Error("Expected a local export");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const cdp = await browser.newBrowserCDPSession();
let targetId;
try {
  ({ targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    background: true,
    focus: false,
  }));
  let page;
  const deadline = Date.now() + 10000;
  while (!page && Date.now() < deadline) {
    for (const candidate of context.pages()) {
      const session = await context.newCDPSession(candidate);
      const { targetInfo } = await session.send("Target.getTargetInfo");
      await session.detach();
      if (targetInfo.targetId === targetId) page = candidate;
    }
    if (!page) await delay(50);
  }
  if (!page) throw new Error("Fixture tab unavailable");
  const requests = { Files: 0, Wiki: 0 };
  await page.route(base.origin + "/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let json;
    if (url.pathname.endsWith("/config")) {
      json = {
        applications: ["ocs", "docs"].map((id) => ({
          id,
          url: "https://" + id + ".invalid",
        })),
        redirect_to_account_page: "/account",
      };
    } else if (url.pathname.endsWith("/auth/profile")) {
      json = { name: "Fixture" };
    } else {
      const files = url.pathname.endsWith("/ocs/search");
      if (!files && !url.pathname.endsWith("/docs/documents"))
        throw new Error(url.pathname);
      requests[files ? "Files" : "Wiki"]++;
      const term = url.searchParams.get(files ? "term" : "title");
      const group = term.split(" ")[0];
      const names = ["proposal", "notes"]
        .map((word) => group + " " + word)
        .filter((name) => name.includes(term));
      // Alternate which service is slow.
      const even = Number(group.slice(1)) % 2 === 0;
      await delay(files === even ? 450 : 90);
      json = {
        results: names.map((name) =>
          files
            ? {
                files: [
                  {
                    name,
                    link: "https://ocs.invalid/" + encodeURIComponent(name),
                  },
                ],
              }
            : {
                title: name,
                url: "https://docs.invalid/" + encodeURIComponent(name),
              },
        ),
      };
    }
    await route.fulfill({ json });
  });
  await page.goto(new URL("/search.html", base).href);
  const input = page.locator(".suite-hero input");
  await input.waitFor({ state: "visible" });
  const samples = [];
  for (let i = 0; i < 21; i++) {
    for (const refinement of [false, true]) {
      const term = "g" + i + (refinement ? " proposal" : "");
      const count = refinement ? 2 : 4;
      await page.evaluate(
        ({ term, count }) => {
          const input = document.querySelector(".suite-hero input");
          const result = (window.searchSample = {});
          input.addEventListener(
            "input",
            () => {
              const start = performance.now();
              const observer = new MutationObserver(inspect);
              function inspect() {
                const anchors = [
                  ...document.querySelectorAll("a.suite-result[href]"),
                ];
                const matches = anchors.filter(
                  (a) =>
                    a.querySelector("strong").textContent.includes(term) &&
                    ["ocs.invalid", "docs.invalid"].includes(a.hostname) &&
                    decodeURIComponent(a.pathname.slice(1)) ===
                      a.querySelector("strong").textContent &&
                    a.getBoundingClientRect().height,
                );
                if (
                  matches.length &&
                  matches.length === anchors.length &&
                  result.first === undefined
                )
                  result.first = performance.now() - start;
                if (
                  matches.length === count &&
                  new Set(matches.map((a) => a.href)).size === count &&
                  document
                    .querySelector(".suite-results")
                    .textContent.includes(
                      count + " results shown for “" + term + "”",
                    )
                ) {
                  result.complete = performance.now() - start;
                  observer.disconnect();
                }
              }
              observer.observe(document.querySelector(".suite-results"), {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
              });
              inspect();
            },
            { once: true },
          );
        },
        { term, count },
      );
      await input.fill(term);
      await input.press("Enter");
      await page.waitForFunction(
        () => window.searchSample.complete !== undefined,
        null,
        { timeout: 5000 },
      );
      if (i)
        samples.push({
          refinement,
          ...(await page.evaluate(() => window.searchSample)),
        });
    }
  }
  if (requests.Files !== 42 || requests.Wiki !== 42)
    throw new Error("Unexpected request count");
  console.log(
    JSON.stringify({ browser: browser.version(), requests, samples }, null, 2),
  );
} finally {
  if (targetId) await cdp.send("Target.closeTarget", { targetId });
  await browser.close();
}
