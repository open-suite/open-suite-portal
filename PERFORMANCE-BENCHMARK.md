# Open Suite portal performance benchmark

This document is the versioned performance ledger for the portal. The latest
summary always describes the release currently under evaluation. Every merged
optimization appends its measured result to the history so regressions and
improvements remain visible in Git history.

## Latest summary

**Candidate:** `961a122` (`ghcr.io/open-suite/portal-{frontend,api}:sha-961a122`)

**Change:** Replace the config bootstrap spinner with a stable shell

**Target:** `https://bridge.demo.opensuite.online`

**Captured:** 2026-07-11

**Result:** Accepted; global spinner exposure eliminated

| KPI                          |      p50 |      p75 |      p95 |     Initial target |
| ---------------------------- | -------: | -------: | -------: | -----------------: |
| Portal shell                 |   205 ms |   211 ms |   227 ms |      <= 100 ms p75 |
| Dashboard visible            |   554 ms |   559 ms |   583 ms |      <= 500 ms p75 |
| Config response -> dashboard |   365 ms |   373 ms |   383 ms |      <= 100 ms p75 |
| First widget data            |   625 ms |   645 ms | 1,170 ms |      <= 500 ms p75 |
| All widgets settled          | 1,012 ms | 1,038 ms | 1,538 ms |    <= 1,000 ms p75 |
| Global spinner exposure      |     0 ms |     0 ms |     0 ms |               0 ms |
| Widget spinner exposure      |   465 ms |   496 ms |   983 ms |      0 ms blocking |
| `/config`                    |    63 ms |    65 ms |    71 ms |      <= 250 ms p95 |
| Calendar                     |    66 ms |    68 ms |   593 ms |    <= 1,000 ms p95 |
| Docs                         |   120 ms |   131 ms |   641 ms | <= 250 ms p95 warm |
| Meet                         |   120 ms |   133 ms |   660 ms | <= 250 ms p95 warm |
| Files                        |   466 ms |   491 ms |   971 ms |    <= 1,000 ms p95 |

### Current interpretation

- The config request still validates the active portal session before mounting
  dashboard controls. Logged-out users retain the immediate 401 redirect path.
- The wait state is now a fixed, noninteractive Open Suite shell. Global spinner
  exposure fell from 387 ms p75 to zero without weakening authentication.
- Compared with the previous accepted build, shell p75 improved 7%, dashboard
  7%, first widget data 13%, Docs 10%, Meet 10% and all widgets 6%. These smaller
  timing changes may include normal shared-demo variance; the zero-spinner
  result is the deterministic acceptance signal.
- Cache-expiry misses remain visible at p95. Calendar's synchronous I/O still
  needs to move off the event loop so expiry cannot stall unrelated work.

## Method

The reproducible harness is in `performance/benchmark.mjs`.

```bash
cd performance
npm ci
npx playwright install chromium
BENCHMARK_USER=johndoe \
BENCHMARK_PASS='<demo password>' \
BENCHMARK_SAMPLES=20 \
BENCHMARK_LABEL='<release-or-candidate>' \
BENCHMARK_OUTPUT=/tmp/open-suite-benchmark.json \
npm run benchmark
```

Protocol:

- Chromium 140.0.7339.186, headless, 1440x900 viewport.
- Runner in the Netherlands against the shared Hetzner demo.
- One fresh browser context and authenticated session per benchmark invocation.
- One unmeasured reload warms browser and server caches.
- Twenty measured warm reloads with one second of pacing between samples. The
  pacing avoids turning the browser test into an unrealistic reload flood and
  deliberately lets short server caches expire during a run.
- Resource Timing measures browser-observed API duration, including time queued
  behind other portal work. This intentionally represents user experience, not
  isolated handler execution time.
- Results report p50, p75 and p95. Raw JSON is a local/CI artifact and is not
  committed because it contains request paths and high-volume sample detail.
- The shared demo can experience unrelated load. A claimed improvement should
  be large relative to observed variance and repeat across run groups.

## History

### 3. Accepted: stable config bootstrap shell - `961a122` - 2026-07-11

| KPI                 | Previous p75 | Candidate p75 | Change |
| ------------------- | -----------: | ------------: | -----: |
| Portal shell        |       226 ms |        211 ms |    -7% |
| Dashboard visible   |       599 ms |        559 ms |    -7% |
| Config -> dashboard |       373 ms |        373 ms |     0% |
| First widget data   |       740 ms |        645 ms |   -13% |
| All widgets settled |     1,109 ms |      1,038 ms |    -6% |
| Global spinner      |       387 ms |          0 ms |  -100% |
| Widget spinner      |       510 ms |        496 ms |    -3% |
| Config              |        65 ms |         65 ms |     0% |
| Calendar            |        85 ms |         68 ms |   -20% |
| Docs                |       146 ms |        131 ms |   -10% |
| Meet                |       148 ms |        133 ms |   -10% |
| Files               |       503 ms |        491 ms |    -2% |

Accepted. The stable shell removes the blocking spinner while preserving the
same authenticated bootstrap and redirect behavior.

### 2. Accepted: cache final Calendar results - `b13896c` - 2026-07-11

| KPI                 | Baseline p75 | Candidate p75 | Change |
| ------------------- | -----------: | ------------: | -----: |
| Portal shell        |       146 ms |        226 ms |   +55% |
| Dashboard visible   |       525 ms |        599 ms |   +14% |
| Config -> dashboard |       371 ms |        373 ms |    +1% |
| First widget data   |     2,062 ms |        740 ms |   -64% |
| All widgets settled |     2,446 ms |      1,109 ms |   -55% |
| Global spinner      |       389 ms |        387 ms |     0% |
| Widget spinner      |     1,932 ms |        510 ms |   -74% |
| Config              |        63 ms |         65 ms |    +3% |
| Calendar            |     1,528 ms |         85 ms |   -94% |
| Docs                |     1,574 ms |        146 ms |   -91% |
| Meet                |     1,580 ms |        148 ms |   -91% |
| Files               |     1,933 ms |        503 ms |   -74% |

Accepted. This is the first candidate to produce a large improvement outside
normal run variance. Calendar p95 remains 660 ms because cache expiry is part
of the paced sample set.

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
