# Open Suite portal performance benchmark

This document is the versioned performance ledger for the portal. The latest
summary always describes the release currently under evaluation. Every merged
optimization appends its measured result to the history so regressions and
improvements remain visible in Git history.

## Latest summary

**Candidate:** `3274aa2` (`ghcr.io/open-suite/portal-{frontend,api}:sha-3274aa2`)

**Change:** Render default dashboard before stored preferences hydrate

**Target:** `https://bridge.demo.opensuite.online`

**Captured:** 2026-07-11

**Result:** Rejected; no KPI improved and the candidate was not shipped

| KPI                          |      p50 |      p75 |      p95 |     Initial target |
| ---------------------------- | -------: | -------: | -------: | -----------------: |
| Portal shell                 |   161 ms |   226 ms |   267 ms |      <= 100 ms p75 |
| Dashboard visible            |   554 ms |   566 ms |   605 ms |      <= 500 ms p75 |
| Config response -> dashboard |   369 ms |   374 ms |   382 ms |      <= 100 ms p75 |
| First widget data            | 2,075 ms | 2,124 ms | 2,179 ms |      <= 500 ms p75 |
| All widgets settled          | 2,374 ms | 2,470 ms | 2,522 ms |    <= 1,000 ms p75 |
| Global spinner exposure      |   377 ms |   399 ms |   420 ms |               0 ms |
| Widget spinner exposure      | 1,858 ms | 1,924 ms | 1,981 ms |      0 ms blocking |
| `/config`                    |    80 ms |    90 ms |   122 ms |      <= 250 ms p95 |
| Calendar                     | 1,536 ms | 1,561 ms | 1,599 ms |    <= 1,000 ms p95 |
| Docs                         | 1,551 ms | 1,598 ms | 1,641 ms | <= 250 ms p95 warm |
| Meet                         | 1,550 ms | 1,617 ms | 1,666 ms | <= 250 ms p95 warm |
| Files                        | 1,860 ms | 1,924 ms | 1,984 ms |    <= 1,000 ms p95 |

### Current interpretation

- Rendering the default dashboard before reading stored preferences did not
  change the roughly 370 ms config-to-dashboard gap. The parent `AppProvider`
  does not mount the dashboard until `/config` completes, so the changed state
  was not on the visible critical path.
- Candidate p75 dashboard time regressed from 525 ms to 566 ms and shell timing
  became noisier. It also risked briefly showing widgets a user had removed.
  The runtime change was reverted before merge; the deployed release remains
  the baseline behavior.
- Calendar performs synchronous CalDAV I/O from an `async` route. Calendar,
  Docs and Meet durations cluster together even though earlier isolated backend
  measurements put warm Docs and Meet around 130-140 ms. The likely mechanism
  is Calendar blocking the portal event loop while concurrent widget requests
  wait. This must be confirmed by changing one variable and rerunning the same
  benchmark.
- The dashboard misses the warm 500 ms p75 target narrowly, while useful widget
  data and all-widgets-ready miss by more than one second.

## Method

The reproducible harness is in `performance/benchmark.mjs`.

```bash
cd performance
npm ci
npx playwright install chromium
BENCHMARK_USER=johndoe \
BENCHMARK_PASS='<demo password>' \
BENCHMARK_SAMPLES=20 \
BENCHMARK_LABEL=baseline-c5cd5ae \
BENCHMARK_OUTPUT=/tmp/open-suite-benchmark.json \
npm run benchmark
```

Protocol:

- Chromium 140.0.7339.186, headless, 1440x900 viewport.
- Runner in the Netherlands against the shared Hetzner demo.
- One fresh browser context and authenticated session per benchmark invocation.
- One unmeasured reload warms browser and server caches.
- Twenty measured warm reloads.
- Resource Timing measures browser-observed API duration, including time queued
  behind other portal work. This intentionally represents user experience, not
  isolated handler execution time.
- Results report p50, p75 and p95. Raw JSON is a local/CI artifact and is not
  committed because it contains request paths and high-volume sample detail.
- The shared demo can experience unrelated load. A claimed improvement should
  be large relative to observed variance and repeat across run groups.

## History

### 1. Rejected: render dashboard defaults early - `3274aa2` - 2026-07-11

| KPI                 | Baseline p75 | Candidate p75 | Change |
| ------------------- | -----------: | ------------: | -----: |
| Portal shell        |       146 ms |        226 ms |   +55% |
| Dashboard visible   |       525 ms |        566 ms |    +8% |
| Config -> dashboard |       371 ms |        374 ms |    +1% |
| First widget data   |     2,062 ms |      2,124 ms |    +3% |
| All widgets settled |     2,446 ms |      2,470 ms |    +1% |
| Global spinner      |       389 ms |        399 ms |    +3% |
| Widget spinner      |     1,932 ms |      1,924 ms |     0% |
| Config              |        63 ms |         90 ms |   +42% |
| Calendar            |     1,528 ms |      1,561 ms |    +2% |
| Docs                |     1,574 ms |      1,598 ms |    +2% |
| Meet                |     1,580 ms |      1,617 ms |    +2% |
| Files               |     1,933 ms |      1,924 ms |     0% |

The candidate did not improve a target KPI. The change was reverted rather
than shipping a preference flash for an unmeasurable benefit.

### 0. Baseline - `c5cd5ae` - 2026-07-11

| KPI                 |      p50 |      p75 |      p95 |
| ------------------- | -------: | -------: | -------: |
| Portal shell        |   143 ms |   146 ms |   199 ms |
| Dashboard visible   |   519 ms |   525 ms |   555 ms |
| Config -> dashboard |   369 ms |   371 ms |   375 ms |
| First widget data   | 2,012 ms | 2,062 ms | 2,100 ms |
| All widgets settled | 2,337 ms | 2,446 ms | 2,506 ms |
| Global spinner      |   377 ms |   389 ms |   396 ms |
| Widget spinner      | 1,845 ms | 1,932 ms | 1,987 ms |
| Config              |    63 ms |    63 ms |    76 ms |
| Calendar            | 1,498 ms | 1,528 ms | 1,576 ms |
| Docs                | 1,526 ms | 1,574 ms | 1,633 ms |
| Meet                | 1,552 ms | 1,580 ms | 1,631 ms |
| Files               | 1,837 ms | 1,933 ms | 1,993 ms |

This is the first controlled baseline. Previous timings in the distribution's
`PERFORMANCE.md` are historical diagnostic observations, not comparable runs.
