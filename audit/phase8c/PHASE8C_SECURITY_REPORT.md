# Brick V1 — Phase 8C Android Security Report

**FINAL ACCEPTED SECURITY STATE (2026-11-04): Phase 8C PASS.** Pinned production Android source `2c492efff01095e17f96af3c24ac07ac0b5c3739`, signed APK [41769396317](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769396317), full security/lint/merged-manifest audit [41769474692](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769474692), and 120-test Android 15 post-purge/crypto race suite [41769491366](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41769491366) all PASS. Original 13 findings have final disposition in [closure matrix](PHASE8C_FINDING_CLOSURE_MATRIX_2026-11-04.md). Historic earlier `INCOMPLETE` or `signing secrets missing` passages below were valid during initial discovery but **are no longer the current status**. Signed certificate and current APK SHA are in [final 8C report](PHASE8C_FINAL_ACCEPTANCE_2026-11-04.md). Actual OPPO-specific protections still require Phase 9 physical verification.


**2026-11-04 later source-backed addendum (supersedes historical "secrets missing" statement below):** The permanent original signing keystore was recovered and five GitHub Actions secrets were configured by the owner. A signed, verified V1 RC passed [run 41764906510](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41764906510) at production source commit `42fb05db`, and a more recent signing workflow passed at [41767486372](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41767486372), commit `b05b33fe`. No private signing values were committed here. The public RSA-4096 signing certificate pin is `BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`. Later manifest binary verification explicitly checked backup/cleartext flags false and no debug-only harness in the signed APK.

A separate P8C-008 late privileged/crypto test [41765068718](https://github.com/hellonenermy1/Brickfamilyplanning/actions/runs/41765068718) passed 112 tests, including blocked keystore rematerialization after purge. A further source fix gates location, diagnostics and fall writer termination before private deletion; its latest exact-source CI remains a separate acceptance gate. The original pre-fix report below remains historical evidence. P8C is **not yet a global PASS** from a signed APK alone.


Production freeze: `967e5d5ceb7e485af997eb0f6380e9544cd39e79`

## Release signing and supply-chain identity

Permanent public certificate SHA-256 is pinned as:

`BF:DE:B4:97:14:FE:A7:14:53:6C:47:F8:12:6D:EE:D7:00:F0:0B:2D:D1:13:C5:C0:D4:52:99:2D:7E:D5:F7:90`

Private signing material is not committed. Keystore/private-key patterns are ignored/rejected by the signing evidence workflow. The exact current signed APK is still blocked because the repository's five signing Actions secrets are missing; the permanent identity must not be regenerated.

## Device identity continuity

The paired device identity fails closed if the Android Keystore alias disappears or is replaced. Brick does not silently mint a new key while retaining paired server identity. Instrumentation covers both deletion and replacement failure modes.

## Device Owner policy provenance

Policy Ledger initialization is explicit at the managed-lifecycle boundary. Missing, malformed or uninitialized provenance cannot be interpreted as a clean empty state during ownership release. Active records are protected from history compaction. Android 10 `autoTimeRequired` provenance/reversal was executed with Brick as real Device Owner in run `41665283987`.

## Shizuku boundary

Shizuku is optional. The privileged bridge exposes typed, allowlisted operations rather than a generic shell surface. Runtime health/capability checks and bounded timeouts protect Core from provider failure. The recoverable executor lane replaces a wedged lane after timeout.

## Android attack surface

The release manifest disables backup and cleartext traffic by contract. Privileged/admin components are constrained to required platform entry paths. Debug test harnesses are source-set isolated and release checks reject accidental inclusion.

## Privacy/logging

Phase 8C privacy run `41669979913` completed SUCCESS. The gate executes the existing production privacy audit and an Android production-source scan that rejects ordinary Android Log calls and coordinate-bearing diagnostic values. Boolean position-availability checks are allowed because they do not disclose coordinates.

## Security conclusion

No open source-level P0/P1 Android security finding remains after remediation/retest. Full release-artifact security closure is blocked only by restoration of the existing permanent signing secrets and successful inspection of the current signed RC. Physical/OEM security behavior remains Phase 9 where device-specific.
