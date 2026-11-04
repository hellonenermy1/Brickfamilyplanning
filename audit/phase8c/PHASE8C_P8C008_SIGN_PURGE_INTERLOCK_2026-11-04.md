# Phase 8C P8C-008 — In-flight signature vs keystore purge interlock

**Recorded 2026-11-04, before source correction.** Existing P1 post-purge concurrent writer finding; requires test evidence.

`DeviceKeys.getOrCreate()` now checks deprovision state at entry and rejects any new request after deprovision begins, but its check and Android Keystore operations are not atomic against `DeprovisionManager.purgeBrick()` deletion. A request admitted immediately before AUTHORISE_FREEZE could still access/create/use the key while PURGE deletes the alias. `DeviceKeys.sign()` continues signature construction after `getOrCreate()` returns; a purge can run concurrently. The prior test's ten *post-purge-started* calls does not cover an already-in-flight crypto operation.

**Correction criterion:** Gate `getOrCreate` and `sign` through the same in-process monitor as deprovision's signer-alias deletion, and require the normal deprovision stage to be NONE at every *new* signing operation. Purge must wait for any pre-existing signer operation to exit before deleting the keystore aliases. This is independent of worker/lifecycle drain and Shizuku fences. Direct instrumentation must hold the signer monitor across a real production purge, demonstrate no early successful PURGE and verify the signing alias and Brick preference removal after the held operation exits.

**Scope:** A process-local fence cannot prevent malicious external apps or Android OS corruption; it does prevent in-process Brick signing tasks from racing its own deletion. Do not mark the whole P8C-008 closed without latest-source emulator/CI.
