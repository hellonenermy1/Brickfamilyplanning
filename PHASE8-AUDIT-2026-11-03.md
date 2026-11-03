# Brick V1 — Phase 8 Independent Audit — 2026-11-03

Status: **REQUALIFICATION RUNNING**.

This audit does not inherit the previous closure verdict. It re-checks Phase 8 against `PHASE8-CONTRACT.md` and `PHASE8-REQUIREMENTS.md` and records only executed evidence.

Audit changes in the current Android candidate include:

- durable Core upload transport boundary with exact single/batch ACK enforcement;
- persistent bounded exponential upload retry backoff under DNS/TLS/timeout/429/5xx/ACK failures;
- deterministic Android network-chaos instrumentation;
- deterministic low-storage SQLite fault injection for the Core journal and safety outbox;
- fail-closed safety-outbox reads when storage is unavailable;
- Device Owner retirement hardening retained from the prior candidate;
- durable command future/expiry/lifetime validation as defense in depth;
- permanent signing secrets scoped only to the exact build/sign steps that require them;
- permanent signing/private-key material ignored/refused from Git tracking;
- pinned OSV vulnerability scanning of the resolved Android Gradle lockfile.

The final audit verdict will be written only after current-head CI, OSV, upgrade, Device Owner, recovery and cross-branch checks complete. Persistent signing, live Cloudflare deployment/resource measurements, real destructive Cloudflare restore rehearsal, and physical OPPO resource/endurance measurements remain separate evidence items until actually executed.
