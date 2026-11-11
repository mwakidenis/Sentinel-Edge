# Changelog

All notable changes to SentinelEdge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-11

### Added

- Native WHATWG Web Streams telemetry generator with NDJSON output
- Z-Score anomaly evaluator with NORMAL/WARNING/CRITICAL classification
- Remediation state machine (NORMAL → DEGRADED → REMEDIATING → STABILIZED)
- Autonomous remediation actions: throttle CPU, rebalance stream, trip circuit
- Append-only ring buffer capped at 1,000 events
- High-density enterprise dark-mode Next.js dashboard
- Neon cyan (`#00F0FF`) and neon emerald (`#10B981`) accent palette
- Live Canvas telemetry stream graph with anomaly markers
- Autonomous action audit log with confidence scores
- Control box for anomaly injection and manual override/reset
- Standalone browser demo (`public/index.html`) with no build step
- 30 unit tests covering pipeline, evaluator, and state machine
- TypeScript `strict: true` with `@/*` absolute import aliases

### Security

- No external cloud API calls — fully local-first
- Zero external stream libraries
- No secrets or keys stored in the repository

## [Unreleased]

### Planned

- Cloudflare Pages deployment integration
- WebSocket telemetry ingestion
- Multi-node clustering support
- Prometheus metrics exporter
- Grafana dashboard import
