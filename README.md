# SentinelEdge

Autonomous, local-first industrial anomaly detection and self-healing stream engine with a high-density, enterprise dark-mode web control plane.

## Architecture Blueprint

```
╔═════════════════════════════════════════════════════════════════════════════╗
║                        SENTINEL EDGE - SYSTEM ARCHITECTURE                   ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  [ INDUSTRIAL SENSORS ]                                                     ║
║      vibration_hz  temperature_c  power_load_kw  clock_drift_ms             ║
║            │              │              │              │                   ║
║            ▼              ▼              ▼              ▼                   ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │  TELEMETRY STREAM GENERATOR  (@/lib/stream/generator.ts)            │   ║
║  │  • Native WHATWG ReadableStream                                      │   ║
║  │  • NDJSON metrics @ 100ms interval                                   │   ║
║  │  • Configurable anomaly injection (thermal/vibration)                │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                            │                                                 ║
║                            ▼                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │  NATIVE WEB STREAM PIPELINE  (@/lib/stream/pipeline.ts)             │   ║
║  │  • TransformStream: parse + 50-item sliding window                   │   ║
║  │  • Rolling statistics: mean, std_dev, min, max per metric            │   ║
║  │  • Per-node_id window isolation                                      │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                            │                                                 ║
║                            ▼                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │  ANOMALY EVALUATOR  (@/lib/engine/evaluator.ts)                     │   ║
║  │  • Z-Score = |x - mean| / std_dev                                    │   ║
║  │  • NORMAL (Z ≤ 2.5)  WARNING (2.5 < Z ≤ 3.2)  CRITICAL (Z > 3.2)   │   ║
║  │  • Anomaly type detection: THERMAL_SPIKE / VIBRATION_SPIKE / NONE   │   ║
║  │  • Confidence score (0.0 - 1.0)                                      │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                            │                                                 ║
║                            ▼                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │  REMEDIATION STATE MACHINE  (@/lib/engine/state-machine.ts)         │   ║
║  │  • NORMAL → DEGRADED → REMEDIATING → STABILIZED → NORMAL            │   ║
║  │  • Autonomous actions:                                               │   ║
║  │    - ACTION_THROTTLE_CPU                                             │   ║
║  │    - ACTION_REBALANCE_STREAM                                         │   ║
║  │    - ACTION_TRIP_CIRCUIT                                             │   ║
║  │  • Append-only ring buffer (1,000 events)                            │   ║
║  │  • Manual override / reset                                           │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                            │                                                 ║
║                            ▼                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────┐   ║
║  │  DARK-MODE DASHBOARD  (@/app/page.tsx)                              │   ║
║  │  • #090D16 background · #00F0FF cyan · #10B981 emerald accents     │   ║
║  │  • Live Canvas telemetry stream graph with anomaly markers           │   ║
║  │  • Metric cards: health, anomalies, latency, window                  │   ║
║  │  • Autonomous action audit log                                       │   ║
║  │  • Control box: inject anomalies, manual reset                       │   ║
║  └─────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  PROPERTIES:  Zero external stream libraries  ·  Local-first  ·  Offline     ║
║               Native WHATWG Web Streams  ·  <1ms eval latency  ·  TypeScript ║
║               strict  ·  @/* absolute imports  ·  No purple anywhere         ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

## Quick Start

```bash
# 1. Navigate to project directory
cd sentinel-edge

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open the dashboard
# http://localhost:3000
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js development server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit test suite (30 tests) |

### Test Suite

```bash
npm test
```

**30 tests covering:**
- `computeStats` — rolling statistics (single value, multiple values, empty array)
- `zScore` — Z-Score calculation (zero std_dev, count < 2, correct calculation)
- `classify` — NORMAL/WARNING/CRITICAL thresholds
- `evaluateMetric` — full evaluation (NORMAL, WARNING, CRITICAL, thermal/vibration detection, confidence, z-scores)
- `RemediationStateMachine` — state transitions, remediation actions, ring buffer (cap 1,000), manual reset
- Pipeline — TransformStream creation, sliding window, per-node window isolation

## Technical Breakdown

### Zero-External-Stream Libraries

All streaming uses native WHATWG Web Streams (`ReadableStream`, `TransformStream`, `WritableStream`) with zero polyfills. The code runs identically on Node.js 18+, Bun, and browser runtimes.

- **Telemetry Generator**: `ReadableStream` emitting NDJSON metrics at 100ms intervals
- **Pipeline**: `TransformStream` parsing chunks, computing 50-item sliding window statistics
- No dependencies on `rxjs`, `xstream`, `most`, or any external streaming library

### Local-First Architecture

All metric evaluation, state updates, and autonomous remediation logic executes locally. Zero calls to external cloud APIs.

- No network requests for detection or remediation
- Ring buffer persists locally (1,000 events)
- Manual override works fully offline
- Dashboard renders entirely client-side after initial load

### Enterprise UI Palette

| Property | Value |
|----------|-------|
| Background | `#090D16` (deep space dark) |
| Grid lines | `#1E293B` (slate) |
| Primary accent | `#00F0FF` (neon cyan) |
| Secondary accent | `#10B981` (neon emerald) |
| Warning accent | `#F59E0B` (amber) |
| Forbidden color | Purple (explicitly avoided) |

### Performance

- **Evaluation latency**: < 1ms per metric (Z-Score + classification)
- **Stream throughput**: 100ms interval (~10 metrics/second per node)
- **Ring buffer**: O(1) append, capped at 1,000 events
- **Sliding window**: O(1) push with array slice

### Code Standards

- TypeScript `strict: true`
- Absolute import aliases (`@/*`)
- Modular file separation (`/lib/stream`, `/lib/engine`, `/lib/types`)
- No comments in code (per project standard)

## File Structure

```
sentinel-edge/
├── app/
│   ├── globals.css       # Enterprise dark palette CSS
│   ├── layout.tsx        # Root layout with metadata & fonts
│   └── page.tsx          # Dark-mode dashboard (client component)
├── lib/
│   ├── types/
│   │   └── index.ts      # Shared TypeScript interfaces
│   ├── stream/
│   │   ├── generator.ts  # NDJSON ReadableStream + anomaly injection
│   │   └── pipeline.ts   # TransformStream + sliding window stats
│   └── engine/
│       ├── evaluator.ts  # Z-Score anomaly classification
│       └── state-machine.ts  # Remediation FSM + 1K ring buffer
├── tests/
│   └── run-tests.js      # 30 unit tests (Node test runner)
├── tsconfig.json         # Strict TypeScript with @/* aliases
├── tsconfig.build.json   # Lib compilation config
└── package.json          # Scripts & dependencies
```

## Demo Script (3-Minute Hackathon Pitch)

### 0:00–0:30 — The Problem
"Industrial equipment fails without warning. Thermal runaway, vibration spikes, power surges — by the time a human notices, it's too late. Existing solutions require cloud streaming, external dependencies, and complex infra."

### 0:30–1:30 — Live Demo: Anomaly Injection
[Click "Inject Thermal Spike" on NODE-01]

"Watch temperature_c climb from 60°C to 110°C. The Z-Score evaluator detects the deviation in under 1ms. Classification escalates from NORMAL → WARNING → CRITICAL."

[Watch the anomaly marker appear on the Canvas stream graph]

"The state machine autonomously transitions NORMAL → DEGRADED → REMEDIATING and executes ACTION_THROTTLE_CPU on NODE-01. All logic runs locally — zero cloud calls."

### 1:30–2:15 — Self-Healing
[Click "Inject Vibration Noise" on NODE-02]

"Vibration_hz spikes. The evaluator detects VIBRATION_SPIKE. The machine executes ACTION_REBALANCE_STREAM. Watch the audit log populate with timestamped, confidence-scored remediation actions."

[Click "Manual Override / Reset"]

"Human override resets the system from REMEDIATING back to NORMAL instantly."

### 2:15–3:00 — Architecture Strengths
"Three technical differentiators:

**1. Zero external stream libraries** — Native WHATWG Web Streams only. Runs on Node, Bun, and browser with zero polyfills.

**2. Local-first & offline** — All detection, state, and remediation execute locally. No cloud API calls. Works in air-gapped industrial environments.

**3. Sub-millisecond edge performance** — Z-Score evaluation completes in <1ms per metric. Ring buffer handles 1,000 events with O(1) append.

Built with Next.js App Router, TypeScript strict mode, Tailwind CSS, and Lucide Icons. Enterprise dark mode — #090D16 baseline, #00F0FF cyan, #10B981 emerald. Zero purple.

SentinelEdge: Autonomous anomaly detection, self-healing streams, edge-native."

## License

MIT
