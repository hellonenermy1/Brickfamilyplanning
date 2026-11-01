# Brick V1 Phase 5B — Current Continuation Checkpoint

Date: 2026-11-01

If work resumes after interruption, **do not restart Phase 5B and do not fall back to older Phase 5/5B SHAs**.

## Exact candidate

- Android branch `v1-p5b-closure-android`
- Android SHA `a09a273bf19e37e70d37077e3ac0ede6a69b2332`
- Cloud/CI branch `v1-p5b-closure-cloud`
- Cloud/CI SHA `507b17c262e9eb2c135b79b7b5cdf6ffc317b634`
- Draft PR #14
- Current exact-pair workflow run `41295112045`
- Instrumentation job `124815081222`

## State at checkpoint creation

- cumulative Phase 2-5 Cloud job: PASS;
- exact Android dependency lock/build/instrumentation-APK/lint/source guards: PASS;
- full cumulative Android instrumentation: RUNNING on the final exact Android SHA.

## Required resume action

1. Fetch run `41295112045` first.
2. If instrumentation PASS: update audit/PR status to hosted automated closure PASS, keep physical OPPO/deployed integration gates separate, and do not merge merely because CI passed.
3. If instrumentation FAIL: fetch job `124815081222` logs, repair only the real failure, add/strengthen regression coverage without weakening uncertainty/trust/privacy, repin the workflow to the new exact Android SHA and rerun the whole cumulative gate.
4. Ignore old results except as historical diagnostic evidence. Only the newest exact pair may close 5B.

## Important completed 5B source work

- reliable Android emulator/ADB/AVD CI plumbing;
- coarse-IP last-resort area;
- historical radio-route reranking without coordinate movement;
- durable fusion-hypothesis frames through Phase 2 journal/ACK path;
- separate refined-history/backward-smoothing production wiring;
- learned-place semantic-selection fix;
- Witness/Ground/ranging/future-ranging closure and tests;
- four failures from the prior 117-test run repaired without weakening design;
- refreshed Phase 5 matrix, closure report and remaining physical-device gate list.
