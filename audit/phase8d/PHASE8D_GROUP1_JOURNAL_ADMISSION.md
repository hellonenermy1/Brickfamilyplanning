# Lifecycle journal admission — 12 November 2026

Source `cb372f92cd2a890d52ed713660c1b34aa583ed7c`, tree `0859106302ded67fa94936b76581cba2e1bde41f`. Group1 NOT READY; P8D-002 P1 OPEN; Phase8D NOT PASS.

## Reproduced fault

Before correction, both lifecycle stores used `name NOT LIKE 'sqlite_%'`. The underscore wildcard hid application objects such as `sqliteXignore`, and schema was checked only at open. On native private SQLite, a BEFORE UPDATE/RAISE(IGNORE) trigger permitted two local capture callbacks while the backup journal remained NEW. An AFTER UPDATE trigger restored OLD body/digest in the monitor: two synthetic send callbacks occurred while delivery remained PENDING. No actual provider or notification was invoked. The immutable predecessor source is ae4ebc9a1b40e6038b00ede67728213483514bad; reproduction was recorded before editing. A separate immutable old/current comparison reuses the same two trigger-bearing SQLite files: old callbacks repeat twice per file, current reopen refuses both, and journal bytes remain identical.

## Correction

Both stores use the literal reserved-prefix exclusion `NOT GLOB 'sqlite_*'` and verify the exact permitted table/name/definition on every read. A transition requires exactly one changed row, exact serialized-body readback inside its transaction, then another schema/body readback after COMMIT before returning admission. Unexpected schema is preserved and refused, never dropped or repaired. A lost COMMIT acknowledgement preserves STARTED ownership and does not trigger another callback. Late schema drift during capture/upload/send leaves the attempt uncertain and blocks progression or repetition. These checks strengthen local admission; they do not prove that older external work stopped.

## Verification

39 new native cases cover six hidden-prefix object types in both stores at reopen/after-open, false row counts, actual TEMP AFTER UPDATE reset despite changes=1, post-COMMIT drift, lost commit acknowledgement, late callback drift and normal ANALYZE/reopen compatibility. Existing run47, monitor50, alert-receipt54 and inventory23 regressions pass. Existing storage/config/receipt formats remain supported. Exact source cb372f92: push43187825695/job131079342711 and PR43187832945/job131079368104 audits33/33 each; portal43187832890/job131079367609 10/10 and Phase2 43187832929/job131079366851 14/14. Complete decoded logs have zero errors; both audits contain39 new journal cases,47run/50monitor/54receipt and native populated encrypted41+4/deviceDO recovery success. Mergee742df3a569ef01961146033fd07942a84ad35e4 has expected base141cbf42/sourcecb372 parents and identical source tree. These remain source/native qualification, not a live recovery or deployment. Full job/log/graph records are in the companion JSON; focused local checks are not a full local-workflow campaign.

## Remaining scope

This is local private-SQLite integrity/admission evidence, not hostile-host protection, external anti-rollback/current-journal custody, power-loss, installed schedule, real alert delivery or cloud recovery acceptance. Runtime90-file graph/hash8082dc0c556bce0056484bdf9007a143a3d7e72d311de650be12a649af154980 is unchanged and UNWIRED; four direct beta mutators remain UNFENCED. External inventory335 files/84 marker candidates/97 classifications/149 dynamic expressions reflects the new test only.

The fresh reviewed cloud run20261112-f28a8d6cb028d0bb remains unapproved/unexecuted. The original live-attempt JSON is unchanged; no repeated metadata GET, B2 transfer, create/retry, credential/permission change, notification, deployment/merge, R2/card/billing or APK/UI operation occurred. Canonical525/full ledger and214/311 mapping remain unchanged. Full writer installation, independent guard/runner and custody, restricted B2 schedule/recipient, full isolated cloud recovery/interruption and genuine acceptance roles remain open.
