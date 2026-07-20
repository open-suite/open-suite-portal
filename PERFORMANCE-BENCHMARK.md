# Open Suite portal performance benchmark

This document is the versioned performance ledger for the portal. The latest
summary always describes the release currently under evaluation. Every merged
optimization appends its measured result to the history so regressions and
improvements remain visible in Git history.

## Latest summary

**Current accepted build:** `aeb6371`
(`ghcr.io/open-suite/portal-{frontend,api}:sha-aeb6371`)

**Latest experiment:** Non-blocking Chat sync `aeb6371`

**Target:** `https://bridge.demo.opensuite.online`

**Captured:** 2026-07-11

**Result:** Accepted; Chat no longer blocks on Matrix `/sync`

| KPI                          |      p50 |      p75 |      p95 |     Initial target |
| ---------------------------- | -------: | -------: | -------: | -----------------: |
| Portal shell                 |   197 ms |   216 ms |   228 ms |      <= 100 ms p75 |
| Dashboard visible            |   572 ms |   579 ms |   584 ms |      <= 500 ms p75 |
| Config response -> dashboard |   379 ms |   384 ms |   388 ms |      <= 100 ms p75 |
| First widget data            |   649 ms |   655 ms |   682 ms |      <= 500 ms p75 |
| All widgets settled          | 1,008 ms | 1,025 ms | 1,323 ms |    <= 1,000 ms p75 |
| Global spinner exposure      |     0 ms |     0 ms |     0 ms |               0 ms |
| Widget spinner exposure      |   440 ms |   457 ms |   761 ms |      0 ms blocking |
| `/config`                    |    62 ms |    65 ms |    75 ms |      <= 250 ms p95 |
| Calendar                     |    67 ms |    78 ms |   757 ms |    <= 1,000 ms p95 |
| Docs                         |   125 ms |   130 ms |   143 ms | <= 250 ms p95 warm |
| Meet                         |   126 ms |   134 ms |   144 ms | <= 250 ms p95 warm |
| Files                        |   437 ms |   455 ms |   501 ms |    <= 1,000 ms p95 |

### Latest Chat result

The controlled-delay profile adds three seconds before each initial Matrix
sync. It verifies that Chat remains usable while the real request is pending.

| KPI                     | Baseline p75 | Candidate p75 | Change |
| ----------------------- | -----------: | ------------: | -----: |
| Chat ready, normal      |       644 ms |        576 ms |   -11% |
| Chat spinner, normal    |        61 ms |          0 ms |  -100% |
| Matrix sync, normal     |       643 ms |        673 ms |    +5% |
| Chat ready, 3 s delay   |     4,842 ms |      1,857 ms |   -62% |
| Chat spinner, 3 s delay |     3,068 ms |          0 ms |  -100% |
| Matrix sync, 3 s delay  |     4,834 ms |      4,927 ms |    +2% |

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

- Chat readiness now equals card-render time and remains independent of Matrix
  latency. Cached unread counts are scoped to the Matrix user and refreshed in
  the background; retryable failures retain the last known content.
- The normal Matrix request did not get faster (643 -> 673 ms p75). The accepted
  gain is eliminating that request from the rendering critical path, not moving
  work out of the measurement window.
- The full suite remained within shared-demo variance. Aggregate widget-spinner
  exposure improved 6% at p75 because the benchmark user has not connected Chat;
  the dedicated Chat journey is the authoritative measurement for this change.
- The 20-sample run discarded one navigation after its explicit 30-second
  timeout. A later 2.39-second Calendar miss was retained and did not propagate
  to Docs, Meet or Files.

## Pending experiment: single-pass Files activities - 2026-07-20

This experiment is intentionally separate from the authenticated shared-demo
ledger above. The production ledger identifies the target; a controlled local
profile isolates the candidate's effect. An authenticated candidate run remains
pending deployment by the parent release workflow.

### Why Files is the target

In the latest 20-sample production run, Files is the largest stable required
API at p50/p75. Calendar has a larger p95 because two cache misses are included,
but its p75 is 78 ms and it is not the normal-path bottleneck.

| Production KPI              |      p50 |      p75 |      p95 |
| --------------------------- | -------: | -------: | -------: |
| Config -> dashboard         |   379 ms |   384 ms |   388 ms |
| Calendar                    |    67 ms |    78 ms |   757 ms |
| Docs                        |   125 ms |   130 ms |   143 ms |
| Meet                        |   126 ms |   134 ms |   144 ms |
| Files                       |   437 ms |   455 ms |   501 ms |
| All required widgets settle | 1,008 ms | 1,025 ms | 1,323 ms |

Code inspection found that a successful Files activity load fetched the same
Nextcloud URL twice: once to detect 204/304 and again to parse a 200 response.
The candidate parses the already-fetched 200 response. It retains the existing
204/304 empty result, the second attempt after a non-success response, response
validation, cursor header, authenticated token and UI loading/error behavior.

### Controlled local browser result

Thirty warm Chromium reloads were collected per variant. Values are exact
p50/p75/p95 distributions from the raw Resource Timing samples; timings are not
mixed with the production table above.

| Controlled KPI                  |     Baseline p50/p75/p95 |    Candidate p50/p75/p95 | p75 change |
| ------------------------------- | -----------------------: | -----------------------: | ---------: |
| React bootstrap effect starts   |    52.0 / 67.9 / 89.2 ms |    52.8 / 59.8 / 78.3 ms |       -12% |
| `/config`                       |       4.0 / 4.3 / 5.6 ms |       4.0 / 4.3 / 5.0 ms |         0% |
| Config response -> dashboard    | 391.9 / 406.6 / 429.6 ms | 388.5 / 394.1 / 413.1 ms |        -3% |
| Config response -> widget start | 365.3 / 374.4 / 398.7 ms | 364.2 / 369.0 / 391.6 ms |        -1% |
| Files API                       | 228.0 / 240.6 / 249.2 ms | 116.2 / 126.3 / 136.2 ms |       -48% |
| Dashboard usable                | 672.2 / 695.7 / 715.4 ms | 557.6 / 572.3 / 595.4 ms |       -18% |
| All API requests settled        | 658.9 / 681.5 / 703.1 ms | 542.6 / 560.2 / 583.5 ms |       -18% |
| OCS calls per Files request     |          2.0 / 2.0 / 2.0 |          1.0 / 1.0 / 1.0 |       -50% |

The unchanged bootstrap, config and fan-out intervals show that the usable-time
gain comes from the eliminated downstream round trip, not from moving work
outside the sample. The controlled profile contained four portal API requests
per reload (config, profile, logout prefetch and Files), one widget request and
a maximum API concurrency of two in every sample.

Protocol:

- Baseline: `main` at `80d7e2f`; candidate: this experiment branch.
- Chromium 140.0.7339.186, headless, 1440x900, `en-US`, Europe/Amsterdam.
- Production static export served over loopback; one warm navigation followed
  by 30 reloads with 100 ms pacing. Playwright screenshots, DOM snapshots and
  network events were captured for every measured reload.
- The real FastAPI route, OCS client, Pydantic models and shared HTTP client were
  used. Authentication was replaced by one deterministic user-scoped auth state
  and only Files was enabled; no auth or cache timing is claimed by this profile.
- The fake OCS endpoint returned the production-shaped non-empty activity body
  and repeated a deterministic 90/110/130/100/120 ms delay schedule. The fixed
  schedule makes the cost of one versus two downstream requests reproducible.
- The controlled run used a local Files-only driver with the same marks and
  Resource Timing calculations as `performance/benchmark.mjs`, plus fake-OCS
  request counting. That driver is not committed; the committed harness supports
  an equivalent Files-only gate with
  `BENCHMARK_REQUIRED_API_FRAGMENTS=/api/v1/config,/api/v1/ocs/activities`.
- Raw JSON and trace ZIPs remain benchmark artifacts rather than Git inputs;
  they contain high-volume request and DOM detail plus authenticated session
  headers and must be treated as sensitive.

### Cold process startup

No container runtime was available in the benchmark orb, so no container-start
claim is made. Backend process startup was measured instead with 20 alternating
baseline/candidate launches, from process spawn to the first `/startup` 204,
with Redis reachable.

| Process startup |       Baseline p50/p75/p95 |      Candidate p50/p75/p95 |
| --------------- | -------------------------: | -------------------------: |
| Uvicorn ready   | 931.4 / 951.0 / 1,048.0 ms | 921.8 / 940.1 / 1,048.6 ms |

The p95 is flat (+0.6 ms); this request-path-only change has no material startup
effect. Frontend static export startup is owned by nginx in the production image
and was not approximated with the development server.

### Guards and remaining bottlenecks

- Client tests assert exactly one downstream request for successful 200 and
  empty 204/304 activity responses, and retain the prior second attempt plus
  error mapping after a non-success response.
- The browser harness now reports bootstrap-effect start, widget fan-out delay,
  API request counts and maximum concurrency. `BENCHMARK_TRACE` records a trace
  only after login and warm-up, so login fields are not captured. Session
  headers, cookies and authenticated DOM remain present and sensitive.
- The remaining normal-path bottleneck is the roughly 369 ms p75 interval from
  config response to widget request start. A previous early-render experiment
  did not improve it and risked flashing removed widgets, so this PR does not
  reintroduce that rejected behavior.
- Shared-demo candidate confirmation is pending parent rollout validation. The
  local controlled percentage must not be projected directly onto production
  because real Nextcloud latency, auth and the larger widget fan-out differ.

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
BENCHMARK_TRACE=/tmp/open-suite-benchmark-trace.zip \
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

Chat uses `performance/chat.mjs`, which establishes Matrix SSO in the same
browser context before measuring authenticated reloads:

```bash
BENCHMARK_USER=johndoe \
BENCHMARK_PASS='<demo password>' \
BENCHMARK_SAMPLES=10 \
BENCHMARK_LABEL='<release-or-candidate>' \
BENCHMARK_OUTPUT=/tmp/open-suite-chat.json \
npm run benchmark:chat

# Repeat with a deterministic slow initial sync.
BENCHMARK_CHAT_SYNC_DELAY_MS=3000 npm run benchmark:chat
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
- The harness reports the first config request as the observable upper bound for
  JavaScript load/hydration becoming effect-ready, config-to-widget fan-out,
  portal API request counts and maximum request concurrency.
- When `BENCHMARK_TRACE` is set, tracing starts only after authentication and the
  unmeasured warm-up, then captures all measured samples without username or
  password fields. The trace still contains authenticated headers, cookies and
  DOM snapshots and must be handled as a sensitive artifact.
- Results report p50, p75 and p95. Raw JSON is a local/CI artifact and is not
  committed because it contains request paths and high-volume sample detail.
- The shared demo can experience unrelated load. A claimed improvement should
  be large relative to observed variance and repeat across run groups.
- The app-switch journey creates a fresh browser context per sample with the
  same established portal/Keycloak SSO state, opens the visible shared Office
  menu, gives Documents 200 ms of hover intent, and waits for Nextcloud
  Documents `DOMContentLoaded`. It reports the first Nextcloud TCP/TLS timing.
- The Chat journey establishes a Matrix access token through the real SSO flow,
  warms the session, then reports card render, useful content, visible spinner
  exposure and initial `/sync` response time. Its optional delay is applied only
  to the initial sync request and makes blocking behavior deterministic.

## History

### 7. Accepted: non-blocking Chat sync - `aeb6371` - 2026-07-11

| KPI                     | Baseline p75 | Candidate p75 | Change |
| ----------------------- | -----------: | ------------: | -----: |
| Chat ready, normal      |       644 ms |        576 ms |   -11% |
| Chat spinner, normal    |        61 ms |          0 ms |  -100% |
| Matrix sync, normal     |       643 ms |        673 ms |    +5% |
| Chat ready, 3 s delay   |     4,842 ms |      1,857 ms |   -62% |
| Chat spinner, 3 s delay |     3,068 ms |          0 ms |  -100% |
| Matrix sync, 3 s delay  |     4,834 ms |      4,927 ms |    +2% |

Accepted. Chat renders user-scoped cached unread state, or a stable empty state
on first connection, while `/sync` continues in the background. The callback
also uses a stable connection status instead of a spinner. The accompanying
20-sample portal run measured 579 ms dashboard p75, 1,025 ms all-widgets p75,
457 ms aggregate widget-spinner p75 and one explicitly discarded navigation.

### 6. Final deployed release - `30748ee` - 2026-07-11

| KPI                 |      p50 |      p75 |      p95 |
| ------------------- | -------: | -------: | -------: |
| Portal shell        |   190 ms |   209 ms |   212 ms |
| Dashboard visible   |   565 ms |   568 ms |   571 ms |
| Config -> dashboard |   379 ms |   380 ms |   382 ms |
| First widget data   |   641 ms |   645 ms |   704 ms |
| All widgets settled | 1,020 ms | 1,034 ms | 1,295 ms |
| Global spinner      |     0 ms |     0 ms |     0 ms |
| Widget spinner      |   475 ms |   484 ms |   736 ms |
| Config              |    61 ms |    62 ms |    68 ms |
| Calendar            |    67 ms |    68 ms |   731 ms |
| Docs                |   121 ms |   128 ms |   131 ms |
| Meet                |   125 ms |   138 ms |   144 ms |
| Files               |   466 ms |   474 ms |   534 ms |

This is the final accepted portal image deployed on the demo. The run collected
20 paced warm samples with no discarded attempts and crossed the Calendar cache
TTL twice.

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
