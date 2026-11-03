# Brick V1 — Phase 8A Closure

## Final status

# **PHASE 8A — DONE / PASS**

Phase 8A objective:

> Prove that Brick V1 has one complete, internally consistent, source-traceable contract before auditing implementation quality.

That objective is satisfied.

Closure date: **2026-11-03**

Audit branch: `v1-p8a-contract-audit`

Contract/evidence content was finalized through commit `65cdab2344e2ad1f7924e2ea89a511529519d2a3` before this closure record was added.

---

## 1. Source reconstruction result

Recovered and reconciled sources include:

- latest approved nine-phase Brick V1 master plan/amendments;
- 146-page `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf`;
- older Phase 1 `V1_REQUIREMENTS.md`;
- original Brick V1 specification / New Brick Chapter;
- architecture/program records;
- historical Phase 7/Phase 8 implementation evidence;
- current Phase 8A–8F audit contract;
- explicit Phase 8A 23R engineering contract amendment.

Pinned final-checklist PDF SHA-256:

`863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`

The checklist was machine-verified at exactly:

- 469 unique audit IDs;
- 1,876 independent pass criteria;
- 429 mandatory;
- 24 forbidden;
- 14 optional-if-supported;
- 2 future-interface.

The older 456-row Phase 1 ledger is preserved as historical traceability but is not mistaken for the final whole-product contract.

---

## 2. Final current requirement contract

Normalization produced:

- baseline checklist IDs: **469**;
- fully superseded historical baseline rows: **3**;
- current baseline rows after supersession: **466**;
- amended existing current IDs: **14**;
- genuinely additive current requirements: **59**;
- **final current unique V1 requirements: 525**.

Current classes:

- MANDATORY: **485**
- FORBIDDEN: **24**
- OPTIONAL-IF-SUPPORTED: **14**
- FUTURE-INTERFACE: **2**

Historical superseded rows retained for traceability:

- `DPM-003`
- `SHZ-007`
- `SHZ-020`

Total normalized working rows including those historical entries: **528**.

---

## 3. Major contract corrections found by 8A

Phase 8A prevented several stale/incorrect assumptions from becoming release requirements.

### Persistent Location enforcement removed

Current V1 parent Location control is one-shot. Completed commands do not create a permanent desired Location state, normal V1 does not apply `DISALLOW_CONFIG_LOCATION`, and a later deliberate child/user toggle wins.

### Standalone GPS-on notification removed

Brick uses the minimum compliant consolidated foreground-service/location status where Android requires it. Ordinary successful one-shot commands do not create a second standalone GPS-on notification.

### Scheduled Wi-Fi added

Local one-shot bedtime/morning scheduling, child override, reboot/offline/time-zone durability, stale-trigger suppression, SOS/HIGH-fall deferral and actual-state confirmation are now explicit requirements.

### Active measured-position reacquisition added

The contract now explicitly prevents intentional stationary cadence from becoming false degradation, prevents old fallback results from overwriting newer measured fixes, and requires bounded subscription/fresh-fix reacquisition before fallback becomes authoritative.

### Maintenance / Deep Off / deprovisioning added

Current V1 now explicitly requires:

- hidden local Maintenance & Recovery Console;
- truthful System State Timeline;
- privacy-reduced diagnostic export;
- provenance-aware durable Deep Off;
- reboot/day-long power-off persistence;
- no automatic reactivation;
- five-stage deprovisioner;
- Policy Ledger;
- policy reversal before Device Owner release;
- tested escape/uninstall path.

### Fast Live Path frozen

Current live position has a dedicated path independent of slower history/Atlas/geocode/backlog work, with stage instrumentation and durable-history preservation.

### Singapore map / OneMap boundary frozen

MapLibre remains the renderer. OneMap is the primary current Singapore high-detail provider where supported, Brick overlays stay provider-independent, an approved fallback preserves the tracking map, authenticated provider credentials remain backend-owned and reverse geocoding stays asynchronous/coalesced.

### Exact queue priority added

`SOS > Critical safety > Location > Health > Evidence learning > Diagnostics`

---

## 4. 23R source ambiguity resolution

No historical approved source containing numeric 23R P95 values could be recovered.

Phase 8A therefore resolved the ambiguity transparently with `PHASE8A_23R_LATENCY_AMENDMENT.md` rather than pretending historical numbers existed.

Current V1 release budgets under representative healthy validated connectivity:

1. accepted current fix -> corresponding visible parent marker: **P95 <= 1.5 s**;
2. authoritative backend current-state update -> corresponding visible parent marker: **P95 <= 500 ms**;
3. authenticated parent Live Track activation -> phone fast-mode confirmation or explicit failure/degraded result: **P95 <= 2.0 s**.

The first two start after location acceptance and do not include waiting for the next physical GNSS/fused fix.

Degraded/offline network conditions are evaluated on truthful state, local durability, safety priority, automatic reconnection/current-state-first recovery, gap reconciliation and zero routine manual intervention rather than the healthy-network latency SLA.

---

## 5. Completeness checks

### Baseline classification

469 / 469 baseline IDs classified: **PASS**

### Current ID uniqueness

525 current IDs / 525 unique: **PASS**

Duplicate current IDs: **0**

### Requirement-text duplication

Exact duplicate current requirement texts: **0**

Semantic-overlap screening found only the expected separate Location-OFF Shizuku Wi-Fi and BLE capability tests; they are intentionally distinct.

### Latest-plan coverage

Unmapped numbered Phase 1–9 subsections/exit gates: **0**

### Contract conflicts

Identified: **11**

Resolved: **11**

Open: **0**

### Source gaps

Identified: **4**

Resolved: **4**

Open: **0**

### Owner/dependency/evidence mapping

Current requirements missing owner mapping: **0**

Current requirements missing dependency mapping: **0**

Current requirements missing expected-test/evidence mapping: **0**

### Forbidden requirements

24 / 24 preserved and mapped: **PASS**

None was accidentally re-enabled by Witness, maintenance, emergency evidence, OneMap or other later work.

### Optional/future requirements

14 / 14 optional-if-supported mapped: **PASS**

2 / 2 future-interface mapped: **PASS**

No mandatory capability was silently downgraded to optional merely because implementation might be difficult.

---

## 6. Acceptance matrices frozen

`PHASE8A_ACCEPTANCE_MATRICES.md` preserves mandatory scenario matrices for:

- all child/parent screen states;
- Singapore map/provider behavior;
- backlog/storage priority;
- full authenticated browser behavior;
- reversible Location/Wi-Fi control;
- Fast Live 23R latency;
- notification/disclosure behavior;
- Witness Mesh;
- Ground Network;
- zero-manual-intervention recovery.

These matrices must be consumed by later audit/qualification phases and cannot be discarded as optional examples.

---

## 7. Final normalized-ledger validation

Regenerated after resolving 23R:

- rows including superseded history: **528**;
- current requirements: **525**;
- unique current IDs: **525**;
- class totals: 485 mandatory / 24 forbidden / 14 optional / 2 future;
- open gap rows: **0**;
- missing required mapping fields: **0**;
- exact duplicate current texts: **0**.

Normalized ledger SHA-256:

`8683b85f8b61aa3769b338048e7deb17d1fff3bc7773b6d454c7a61bce013bbd`

---

## 8. Phase 8A exit gate

Requirement sources frozen: **PASS**

Every current requirement has stable identity: **PASS**

Every requirement mapped to current semantics: **PASS**

Contradictions resolved: **PASS**

Unknown requirements: **0**

Unexplained removals identified: **0**

Unmapped requirements: **0**

Open source gaps: **0**

Final unique count frozen: **525**

# **PHASE 8A EXIT GATE: PASS**

---

## 9. What this does NOT mean

Phase 8A does not claim all 525 requirements are implemented.

It does not claim Android is correct.

It does not claim Cloudflare is correct.

It does not claim the Parent Portal is correct.

It does not claim production qualification.

Those claims require later evidence.

---

## 10. Handoff to Phase 8B

Phase 8B receives the frozen 525-requirement contract and must answer:

> Does every required Brick function actually exist in production implementation, is it wired/reachable/configured, and is every forbidden function actually absent?

Phase 8B must create requirement-to-code and code-to-requirement traceability and classify each current requirement as appropriate, including:

- IMPLEMENTED;
- IMPLEMENTED — UNVERIFIED;
- PARTIAL;
- MISSING;
- BROKEN;
- UNREACHABLE;
- VERIFIED UNSUPPORTED where the contract permits it;
- INTENTIONALLY REMOVED — VERIFIED where applicable.

No implementation receives credit merely because a class, route, table, UI card, test stub or comment exists.

# **PHASE 8A CLOSED. NEXT: PHASE 8B.**
