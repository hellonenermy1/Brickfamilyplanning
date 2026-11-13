# Group1 — fresh synthetic recovery run for review

Prepared12 November2026, Singapore. **Not approved or executed.** This replaces no historical result and grants no cloud authority. The original approved run42965057341 sent one create request, stopped UNKNOWN and was not retried. Later two dedicated-token metadata GETs found neither old proposed name at that read. The original response cause remains unknown; the new diagnostics cannot recover it retrospectively.

Sourcea20acc569adcf2124b9a623051e3d50bbad6f193 now retains fixed-field HTTP status, route verification, body/JSON/envelope shape and at most8 unique bounded numeric error codes. The CLI fsyncs header observations before reading the body and completed diagnostics before acknowledging an envelope. A fresh-process local fixture verifies private journal persistence after exit; it is not independent custody or a live provider observation. No raw messages, URLs, headers, SQL results or body text are retained. Diagnostics never authorize continuation, retries or credential/permission changes. Exact qualification is in PHASE8D_GROUP1_RESPONSE_DIAGNOSTICS_EVIDENCE.json.

Exact-source hosted qualification is complete: push43176560542/job131042090110 and PR43176568086/job131042115025 audits33/33 each; portal43176568101/job131042115495 10/10, Phase2 43176568095/job131042114814 14/14. Complete decoded logs show zero errors and62 drill/18 reconciliation/44 metadata/23 inventory summaries plus native populated encrypted41+4/deviceDO recovery success. Mergec8ce1866c26b479e4968316fe5a938b669a2bf23 has expected base141cbf42/sourcea20acc5 parents and identical tree. These are source/native checks only; fresh cloud run/name lookup are not executed. See PHASE8D_GROUP1_RESPONSE_DIAGNOSTICS_EVIDENCE.json.

## Concrete proposed scope

| Item | Proposed operation |
| --- | --- |
| Run identity | `20261112-f28a8d6cb028d0bb` — fresh identity; never re-run the old attempt |
| New primary | `brick-g1-20261112-f28a8d6cb028d0bb-primary` |
| New diagnostics | `brick-g1-20261112-f28a8d6cb028d0bb-diagnostics` |
| Account | Same independently pinned existing account, checked against SHA256f3596e86fd73a8d069151b0e9fd0e08f6bf5a1518fb3066d1db6daf4f4962a83; no account lookup/fallback |
| Credential | Same existing deployment operator secret, used only inside this one bounded manual job. No new key, permission change, runtime credential installation or token in chat |
| Synthetic data | One canary table/two fixed synthetic rows per new unbound database; record both checkpoints before faults |
| Fault/recovery | Change one canary/delete the other, restore both checkpoints and verify exact parity; undo to damaged states and verify; restore checkpoints again and verify |
| Limits | At most2 creates,44 sequential API calls and6 restores.20 seconds per call including body;15-minute admission budget;20-minute job limit. No automatic retry, lookup/reuse by name or resource deletion |
| Criterion | Retain the900-second synthetic pair first-fault-to-first-verified-parity target used in the original approved scope; zero checkpoint canaries lost. Later undo/re-restore must also verify. This is not full-production RTO or time-based RPO |
| Retention | Retain both new unbound candidates after any outcome; no cleanup deletion. Sanitized result/progress artifacts retained14 days. New databases consume account quota; a quota/feature refusal never authorizes a paid plan or billing activation |

Existing beta primary/diagnostics databases, Worker bindings/deployments, device/scheduler DOs, family data, APK/UI, B2 archive transfers and real notifications are outside this operation. Both protected beta database hashes remain refused. PR32 stays draft/unmerged. PR62 registration is already merged; do not ask for its approval again or merge another launcher.

## Exact dispatch and stop rules

After fresh explicit approval, recheck current refs and the qualified source/workflow/policy manifest. Evidence-only descendants do not have a new exact-head CI claim. Record the actual reviewed dispatch head; the workflow requires `approved_source_sha` equal to its actual `GITHUB_SHA`. No mutation may be dispatched against a different unreviewed head.

Inputs on the existing manual workflow: `execute_new_synthetic_d1=true`, `run_id=20261112-f28a8d6cb028d0bb`, `rto_goal_seconds=900`, `approved_source_sha=<actual reviewed dispatch head>`. The write opt-in still defaults false. The source has a separate mutually exclusive GET-only path for exactly the original and this fresh reviewed identity, using only the existing dedicated read token. That prepared lookup path is not evidence of a real lookup or resource existence.

On the first refusal, timeout, uncertain acknowledgement, identity/shape/parity mismatch or failed journal persistence, stop the whole candidate without another write. A non-2xx response now leaves numeric evidence where available, but remains UNKNOWN after a mutation was attempted. An absent response must not acquire an invented status/cause. Retain/isolate the candidate; use only the dedicated-token GET-only path to reconcile exact proposed names when needed. Read-only observations are not authority to resume a stopped operation. Do not expand scopes, change credentials, buy a service or silently alter request payloads to get green.

## Acceptance limit

A real pass would establish only this two-new-D1 current-bookmark synthetic restore/undo subgate and its measured synthetic criterion. Full encrypted41+4-table/deviceDO cloud recovery/interruption, installed complete writer/bootstrap/raw-credential coverage, independent guard/runner/replay/key/context/selection/current-journal custody, restricted B2 schedule/recipient and genuine independent acceptance remain open. Group1 remains `IN_PROGRESS_NOT_READY`; P8D-002 `P1_OPEN`; Phase8D `NOT_PASS`. Canonical525/full acceptance ledger and214/311 mapping are unchanged.
