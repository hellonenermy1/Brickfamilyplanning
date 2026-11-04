# P8C-008 — source-level gap in first in-flight signer interlock

**Recorded 2026-11-04 before the second fix.** Existing Phase 8C P1 `P8C-008`; state OPEN pending original scenario execution.

The first signer interlock makes `DeviceKeys.getOrCreate` and `sign` synchronized and acquires `synchronized(DeviceKeys)` **only** for the keystore-alias deletion at the tail of `DeprovisionManager.purgeBrick`. The method had already deleted all Brick preferences before taking that lock. Consequently a `sign` operation admitted before `AUTHORISE_FREEZE` could still be inside `validatePairedKey` (or its migration preference `commit()`) while purge deletes `brick.xml`; when the signing operation completes, its preference write could rematerialize a deleted namespace. Waiting for the signer only at key deletion is too late.

**Required correction:** cover *all* Brick preference deletion through keystore alias deletion and final purge-stage commit with the same signer monitor, after other producer drains. Never release it between preference deletion and durable `PURGE_BRICK` stage. Also serialize `DeviceKeys.initialize` which can otherwise validate/migrate the paired fingerprint outside the signer lock. Test with a held signer monitor across the actual production purge: the test must prove that the private preference remains intact while the signer is held, then is removed and remains absent after release; the keystore alias must be absent. Do not claim this is a full proof against all possible app writers. Do not hold lock while waiting for the Android main thread or WorkManager.

**Unchanged accepted behavior:** already-authorized deprovision fails new signing attempts; paired identity/key continuity never silently regenerates; late operations cannot rewrite purged stores.
