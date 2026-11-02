# Brick V1 — Phase 8 Test Evidence

Do not write `PASS` here from source inspection alone. Each entry must record the exact fault/input, expected result, actual result, run/commit, and status.

## Baseline

- Android baseline: `8843bdae902050c8c1fd7e67ed7ac80662d0da93`.
- Cloud baseline: `820fb8974ae185d74b4963b31b18a7fa0eafedf6`.

## Evidence queue

| Test | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Phase 8 build/lint/R8 | clean | pending | pending CI | IMPLEMENTING |
| Full retained instrumentation | all retained tests green | pending | pending CI | IMPLEMENTING |
| Retirement Stage 1 persistence | durable DISARMED before cleanup | pending | pending CI/emulator | IMPLEMENTING |
| Retirement repeated invocation | never returns to ACTIVE | pending | pending CI | IMPLEMENTING |
| Boot after DISARMED | no tracking/recovery resurrection | pending | pending emulator | IMPLEMENTING |
| Device Owner release verification | owner=false and admin=false | pending | pending emulator | IMPLEMENTING |
| Stable-signature A->B upgrade | update succeeds, identity/data retained | pending | stable signing not yet pinned | OPEN BLOCKER |
| One-shot Location command | one command does not continuously re-enforce | pending | pending tests | IMPLEMENTING |
| SOS starvation | SOS jumps synthetic ordinary backlog | pending | pending | IMPLEMENTING |
| 14-day offline backlog | no corruption/loss, bounded drain | pending | pending | IMPLEMENTING |
| Backup destructive restore | restored records/config compare correctly | pending | pending | IMPLEMENTING |

Physical OPPO/ColorOS qualification is not a Phase 8 PASS criterion; it is explicitly handed to Phase 9.
