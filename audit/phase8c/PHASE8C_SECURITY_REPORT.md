# Brick V1 — Phase 8C Android Security Report

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
