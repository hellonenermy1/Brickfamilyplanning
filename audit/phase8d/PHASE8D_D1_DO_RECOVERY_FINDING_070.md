# P8D-070 — beta diagnostic state blocks inherited Durable Object recovery
Recorded before correction on audit/phase8d-d1-qualification; inherited beta source488b34f2.
Severity P1 recovery availability; requirements OPS-003, BE-003; PDF8D.16.
Actual local recovery drill calls the real beta-device.ts /beta/probe, then exportRecoveryState. Export fails with "unknown recovery state key": the probe stores betaDiagnostic, while do-recovery.ts only permits eight production durable keys.
Required: explicitly classify betaDiagnostic as a disposable challenge, exclude it from beta export without deleting live diagnostic state or weakening rejection of any other unknown key. Preserve durable telemetry/revocation, validate challenge shape, exercise restore/restart on actual beta DO.
Original receipt: scripts/test-phase8d-cardfree-recovery.mjs assertion "beta DO snapshot must handle its own diagnostic key" false != true, original error unknown recovery state key. No live cloud/user data touched. No production recovery availability claim.
Status: REPRODUCED; correction/retest pending.
