# Open Suite portal performance benchmark

This document is the versioned performance ledger for the portal. The latest
summary always describes the release currently under evaluation. Every merged
optimization appends its measured result to the history so regressions and
improvements remain visible in Git history.

## Latest summary

**Current accepted build:** `1063474`
(`ghcr.io/open-suite/portal-{frontend,api}:sha-1063474`)

**Latest experiment:** Distribution header preconnect candidate `63976a6`

**Target:** `https://bridge.demo.opensuite.online`

**Captured:** 2026-07-11

**Result:** Preconnect rejected; current accepted portal KPIs unchanged

| KPI                          |      p50 |      p75 |      p95 |     Initial target |
| ---------------------------- | -------: | -------: | -------: | -----------------: |
| Portal shell                 |   203 ms |   213 ms |   260 ms |      <= 100 ms p75 |
| Dashboard visible            |   567 ms |   586 ms |   735 ms |      <= 500 ms p75 |
| Config response -> dashboard |   382 ms |   385 ms |   390 ms |      <= 100 ms p75 |
| First widget data            |   641 ms |   679 ms |   864 ms |      <= 500 ms p75 |
| All widgets settled          | 1,030 ms | 1,100 ms | 1,403 ms |    <= 1,000 ms p75 |
| Global spinner exposure      |     0 ms |     0 ms |     0 ms |               0 ms |
| Widget spinner exposure      |   454 ms |   495 ms |   821 ms |      0 ms blocking |
| `/config`                    |    62 ms |    69 ms |    95 ms |      <= 250 ms p95 |
| Calendar                     |    67 ms |    77 ms |   815 ms |    <= 1,000 ms p95 |
| Docs                         |   125 ms |   133 ms |   139 ms | <= 250 ms p95 warm |
| Meet                         |   122 ms |   130 ms |   164 ms | <= 250 ms p95 warm |
| Files                        |   447 ms |   467 ms |   502 ms |    <= 1,000 ms p95 |

### Latest app-switch result

The shared-header preconnect candidate was measured separately because it
cannot affect a same-origin dashboard reload.

| KPI                        |     Baseline p50/p75/p95 |    Candidate p50/p75/p95 | Result          |
| -------------------------- | -----------------------: | -----------------------: | --------------- |
| Office -> Documents target | 3,480 / 4,066 / 4,720 ms | 2,879 / 4,053 / 4,319 ms | p75 flat        |
| First Nextcloud connection |       110 / 116 / 118 ms |       111 / 117 / 132 ms | no reuse        |
| TLS                        |          57 / 59 / 66 ms |          59 / 61 / 79 ms | no reuse        |
| Preconnect hint present    |               0 / 0 / 0% |         100 / 100 / 100% | mechanism fired |

### Current interpretation

- A Calendar cache miss reached 3.54 seconds in this run, but concurrent Docs
  and Meet maximums stayed below 267 ms and Files below 632 ms. This directly
  confirms that the event loop is no longer held by synchronous CalDAV I/O.
- Against the previous accepted build, p95 improved 78% for Docs, 75% for Meet,
  48% for Files, 16% for widget-spinner exposure and 9% for all widgets. Calendar
  itself is intentionally not made faster by thread offloading.
- Median and p75 dashboard timings moved by roughly normal shared-demo variance.
  Acceptance is based on isolating the tail, not claiming those as gains.
- One navigation attempt timed out and was discarded before collecting the 20
  successful samples. The harness now reports discarded attempts explicitly
  instead of failing late or silently shortening the sample set.
- The shared-header preconnect hint was present before every candidate click,
  but connection and TLS costs did not fall. Page p75 moved by only 13 ms inside
  a roughly two-second baseline range. The speculative runtime work was reverted.

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

Cold app switching uses `performance/app-switch.mjs`:

```bash
BENCHMARK_USER=johndoe \
BENCHMARK_PASS='<demo password>' \
BENCHMARK_SAMPLES=10 \
BENCHMARK_LABEL='<release-or-candidate>' \
BENCHMARK_OUTPUT=/tmp/open-suite-app-switch.json \
npm run benchmark:app-switch
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
- The app-switch journey creates a fresh browser context per sample with the
  same established portal/Keycloak SSO state, opens the visible shared Office
  menu, gives Documents 200 ms of hover intent, and waits for Nextcloud
  Documents `DOMContentLoaded`. It reports the first Nextcloud TCP/TLS timing.

## History

### 5. Rejected: shared-header hover preconnect - `63976a6` - 2026-07-11

| KPI                        | Baseline p75 | Candidate p75 |         Change |
| -------------------------- | -----------: | ------------: | -------------: |
| Office -> Documents target |     4,066 ms |      4,053 ms |             0% |
| First Nextcloud connection |       116 ms |        117 ms |            +1% |
| TLS                        |        59 ms |         61 ms |            +3% |
| Preconnect hint present    |           0% |          100% | mechanism only |

Rejected. Ten fresh-context journeys showed no socket reuse or meaningful page
p75 change. A five-sample credentialed-hint variant also retained 109 ms p75
connection and 57 ms TLS work. The runtime change was reverted in the
distribution PR rather than adding speculative authenticated connections.

### 4. Accepted: offload blocking CalDAV I/O - `1063474` - 2026-07-11

| KPI                 | Previous p95 | Candidate p95 | Change |
| ------------------- | -----------: | ------------: | -----: |
| Portal shell        |       227 ms |        260 ms |   +15% |
| Dashboard visible   |       583 ms |        735 ms |   +26% |
| Config -> dashboard |       383 ms |        390 ms |    +2% |
| First widget data   |     1,170 ms |        864 ms |   -26% |
| All widgets settled |     1,538 ms |      1,403 ms |    -9% |
| Global spinner      |         0 ms |          0 ms |     0% |
| Widget spinner      |       983 ms |        821 ms |   -16% |
| Config              |        71 ms |         95 ms |   +34% |
| Calendar            |       593 ms |        815 ms |   +37% |
| Docs                |       641 ms |        139 ms |   -78% |
| Meet                |       660 ms |        164 ms |   -75% |
| Files               |       971 ms |        502 ms |   -48% |

Accepted. The candidate isolates unrelated request latency during a Calendar
miss. Its 3.54-second Calendar maximum did not propagate to Docs, Meet or Files.

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
