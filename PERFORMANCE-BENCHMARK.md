# Open Suite portal performance benchmark

This document is the versioned performance ledger for the portal. The latest
summary always describes the release currently under evaluation. Every merged
optimization appends its measured result to the history so regressions and
improvements remain visible in Git history.

## Latest summary

**Release:** `c5cd5ae` (`ghcr.io/open-suite/portal-{frontend,api}:sha-c5cd5ae`)  
**Change:** Baseline before the July 2026 performance pass  
**Target:** `https://bridge.demo.opensuite.online`  
**Captured:** 2026-07-11  
**Result:** Baseline; no performance change

| KPI                          |      p50 |      p75 |      p95 |     Initial target |
| ---------------------------- | -------: | -------: | -------: | -----------------: |
| Portal shell                 |   143 ms |   146 ms |   199 ms |      <= 100 ms p75 |
| Dashboard visible            |   519 ms |   525 ms |   555 ms |      <= 500 ms p75 |
| Config response -> dashboard |   369 ms |   371 ms |   375 ms |      <= 100 ms p75 |
| First widget data            | 2,012 ms | 2,062 ms | 2,100 ms |      <= 500 ms p75 |
| All widgets settled          | 2,337 ms | 2,446 ms | 2,506 ms |    <= 1,000 ms p75 |
| Global spinner exposure      |   377 ms |   389 ms |   396 ms |               0 ms |
| Widget spinner exposure      | 1,845 ms | 1,932 ms | 1,987 ms |      0 ms blocking |
| `/config`                    |    63 ms |    63 ms |    76 ms |      <= 250 ms p95 |
| Calendar                     | 1,498 ms | 1,528 ms | 1,576 ms |    <= 1,000 ms p95 |
| Docs                         | 1,526 ms | 1,574 ms | 1,633 ms | <= 250 ms p95 warm |
| Meet                         | 1,552 ms | 1,580 ms | 1,631 ms | <= 250 ms p95 warm |
| Files                        | 1,837 ms | 1,933 ms | 1,993 ms |    <= 1,000 ms p95 |

### Current interpretation

- The portal deliberately shows a global spinner while `/config` completes,
  then spends another roughly 370 ms before the dashboard appears.
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
