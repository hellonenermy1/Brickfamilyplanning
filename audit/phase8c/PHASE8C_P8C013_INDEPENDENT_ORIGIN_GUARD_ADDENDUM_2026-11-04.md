# Phase 8C — P8C-013 supplement: entire deprovision preferences file lost

**Recorded:** 2026-11-04 before independent-guard source correction. **State:** P1 open, source-reachable, pending exact reproducer.
**Requirement:** DEPROV-001/004/005; approved checklist forbids misrepresenting missing lifecycle provenance as safe.

The current `DeprovisionManager.stage()` checks `brick_deprovision_v1.stage` and `deprovisionEverStarted` in **the same SharedPreferences XML file**. Loss, truncation, or deletion of the whole XML file deletes both fields; then `getBoolean(KEY_EVER_STARTED, false)` is false and `contains(KEY_STAGE)` is false, yielding `Stage.NONE`. The normal `BrickApplication` then creates diagnostic/key/recovery stores rather than showing recovery-required state. The previous corrupted-string and deleted-stage-only tests do not exercise entire-file deletion.

**Required:** A second independent, minimal, persistent no-backup provenance marker must be durably created *before* the first authorised deprovision transition; it must survive PURGE_BRICK until Android actually uninstalls the app. On stage/prefs-file loss, surviving marker means `Stage.INVALID` (recovery-only), not `NONE`. It must contain only a static format/version marker, no PII. Test full preference-file removal and cold process restart; do not treat total loss of both independent media as distinguishable from fresh installation. Existing staged-upgrade migration should not silently let previous removal progress reset.

This independent file is an **explicit exception** to earlier shorthand saying the stage XML alone remains after purge; the only retained state is non-sensitive removal provenance (stage preference + static no-backup guard). It must be declared in the purge/privacy inventory as intentionally retained, not accidentally omitted.

**No privacy/security acceptance from static code alone.** Preserve original P8C-013 until source patch, emulator test, cold-start test and exact-source CI pass.
