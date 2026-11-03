# Brick V1 — Phase 8A Contract Amendment 23R — Fast Live Path Latency Budget

## Why this amendment exists

The recovered approved Brick sources require a `23R P95 latency budget` but do not contain the numeric threshold(s). Exhaustive Phase 8A source/history search recovered only earlier assistant engineering proposals, not a separately user-approved numeric value.

The user delegated Phase 8A completion and instructed the audit to continue closely without leaving routine work incomplete. Therefore Phase 8A resolves the ambiguity as a **new engineering contract amendment**, rather than falsely claiming these numbers were present in the historical source.

These values are the current Brick V1 requirement unless explicitly changed by a later approved contract amendment.

## Measurement boundary

Fast Live transport latency begins only after Brick has produced an **accepted current position**.

It does **not** include the time spent waiting for Android/GNSS/Fused Location Provider to generate the next physical location fix. Sampling cadence is governed separately by activity/SOS/Live Track requirements.

Canonical path:

`accepted fix -> local durable persistence -> realtime packet -> authoritative Durable Object current state -> WebSocket -> parent browser marker render`

## 23R release budgets

### 23R-A — Accepted fix to visible parent marker

Under a healthy validated Internet connection with Cloudflare reachable:

**P95 <= 1.5 seconds**

Measured from the monotonic timestamp when Brick accepts the position as current/trusted enough for live use to the browser timestamp when the corresponding current-state marker has been rendered.

This is the primary end-to-end Fast Live SLA.

### 23R-B — Backend current state to visible parent marker

Under the same healthy connected conditions:

**P95 <= 500 milliseconds**

Measured from completion of authoritative current-state update in the device Durable Object/current-state component to browser rendering of that state.

This budget covers WebSocket delivery + browser handling/render and gives a useful boundary for separating phone/network latency from server/browser latency.

### 23R-C — Live Track activation control path

When the parent enables Live Track while the phone is online and reachable:

**P95 <= 2.0 seconds**

Measured from the authenticated parent Live Track action being accepted by Brick's backend/control path to the phone confirming entry into the intended fast tracking mode (or reporting an explicit failure/degraded reason).

This does not promise that a new physical GNSS/fused fix will exist within two seconds in every RF/environmental condition; it proves the control path switched modes promptly.

## Test conditions

The numeric latency SLA is evaluated on both target OPPO profiles under representative healthy connectivity:

- validated Wi-Fi; and
- validated normal mobile data.

Use the exact release candidate Android APK/backend/portal/schema/protocol combination.

Collect enough events for a meaningful P95 distribution rather than timing a handful of hand-picked successes.

At minimum, record per event:

- source/accepted-fix monotonic timestamp;
- local persistence completion;
- phone send start/complete or enqueue-to-send timing;
- backend ingest/current-state completion;
- WebSocket enqueue/delivery timing where observable;
- browser receive time;
- browser marker render completion.

Clock-domain differences must be handled explicitly. Prefer monotonic durations within each device/process and a trace/event ID that lets the stages be correlated; do not subtract unsynchronised clocks blindly.

## Background-work isolation

The following may not cause the Fast Live path to miss its SLA through avoidable head-of-line blocking:

- history batching;
- Atlas learning;
- reverse geocoding;
- R2/history large-object writes;
- route simplification;
- offline backlog catch-up;
- non-critical diagnostics.

Durable history is still preserved. Obsolete intermediate **live renders** may be coalesced when a newer current state already exists, but required durable history points may not be discarded merely to make the live chart look fast.

## Degraded network rule

The 1.5 s / 500 ms healthy-network budgets are **not** falsely applied while the Internet path is genuinely degraded, disconnected, captive, or Cloudflare is unavailable.

In those conditions Brick is judged on:

- truthful degraded/offline state;
- local durability;
- safety priority;
- automatic reconnect;
- current-state-first recovery;
- gap reconciliation;
- zero routine manual intervention.

Once healthy validated connectivity returns, the Fast Live path must recover automatically and return to the normal latency target.

## Failure classification

A release fails `LIVE-005` if, under the defined healthy test profile:

- accepted-fix -> visible-marker P95 exceeds 1.5 s;
- backend-current-state -> visible-marker P95 exceeds 500 ms;
- Live Track activation -> phone fast-mode confirmation P95 exceeds 2.0 s;
- heavy background work measurably head-of-line blocks live current state;
- instrumentation cannot distinguish the major latency stages;
- measured results are built from mixed APK/backend/portal versions.

## Relationship to sampling cadence

These budgets do not replace the existing tracking-cadence rules.

Examples:

- Parent Live Track target cadence remains roughly 2 seconds where appropriate.
- Fast vehicle/bicycle and walking/running cadence remain governed by their own activity/power rules.
- SOS remains more aggressive when technically feasible.

A 2-second sampling cadence plus <=1.5-second post-acceptance transport/render SLA are separate measurements and must not be conflated.

## Provenance status

`PHASE 8A ENGINEERING CONTRACT AMENDMENT — 2026-11-03`

Historical numeric source: **none recovered**.

Current numeric contract established here:

- accepted fix -> visible marker P95 <= **1.5 s**;
- backend current state -> visible marker P95 <= **500 ms**;
- Live Track activation -> fast-mode confirmation P95 <= **2.0 s**.
