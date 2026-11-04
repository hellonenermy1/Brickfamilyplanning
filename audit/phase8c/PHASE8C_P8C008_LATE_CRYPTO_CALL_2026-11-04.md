# P8C-008 — Late signing call could regenerate identity after purge

**Date:** 2026-11-04; source-reachable *before* fix. **Severity:** P1 (existing post-purge lifecycle finding); emulator fault-injection still required.

The current `DeviceKeys.getOrCreate()` reads AndroidKeyStore `brick-device-signing-v1` and, when no key exists and `brick` paired device ID is absent, creates a fresh key. Production `PURGE_BRICK` intentionally deletes that alias and the `brick` preferences. A late/in-flight network callback that invokes `DeviceKeys.sign` after purge can therefore recreate the key. If a paired ID persists during the race but key is missing, `recordIdentityFault()` may instead recreate `brick.xml` by writing a failure marker. Both violate the post-purge no-rematerialization guarantee.

**Repair contract:** fail closed at the signing/key-creation entry point whenever durable deprovision state is anything other than `NONE`. The guard must execute before reading/creating identity key or writing fault preferences. Independently assert that after staged PURGE and deleting key/prefs, both `sign` and `publicSpkiBase64` fail, no keystore alias is created, and no `brick.xml` appears. Do not substitute static source review for the running emulator test.

**Status:** OPEN / pre-remediation evidence; verification pending.
