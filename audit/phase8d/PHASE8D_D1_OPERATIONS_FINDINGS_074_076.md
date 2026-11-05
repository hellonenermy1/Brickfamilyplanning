# Phase8D maintenance / retention / recovery continuation — findings before correction
Baseline: bd039bc62ebead0cf10bb611e18565a900d7bd9a (tested executable a51d4d96). Branch audit/phase8d-d1-qualification. No live data, SQL mutation or deployment.

## P8D-074 — D1 retention contradicts existing raw30/trusted90 policy
P1 data retention/truthfulness; requirements SEC-021, OPS-001, BE-010/011;8D.8/.17.
Existing phase4.ts getRetention and its contract test report raw30 days/trusted90. phase5-refined-history.ts defines hypotheses30/refined90, backup-v6.ts defines backups30. The D1 adapter instead physically deletes history by captured wall time after35 days and object classes at14/30/7 days. Actual native D1 tests show40-day trusted history deleted;31-day raw still returned;91-day trusted still returned before cleanup; original raw copy retained; freshly received delayed history deleted; hypotheses/refined/backup prematurely deleted.
Required: preserve original receipt/upload age, separately expire raw30/trusted90, logically scrub expired raw data including duplicate raw fields in stored trusted packets, enforce availability at reads/list while bounded physical cleanup catches up. No inference of physical/PITR erasure. Keep explicit existing14-day raw evidence policy unless a later authority changes it.

## P8D-075 — D1 cleanup deletes refreshed object and scales statements with every chunk
P1 destructive cleanup race;8D.8/.17, OPS-001/SEC-021.
Actual native D1 interleaving: SELECT an old eligible object; replace same key with fresh bytes/metadata; cleanup deletes fresh replacement.60 tiny eligible objects generate247 prepared/execute statements under old delete-per-key path.
Required: re-evaluate age in one atomic DELETE per class, cascade chunks under FK, cap row count and use a receipt-age index for bounded virtual-history cleanup. Test exact race, statement envelope, boundary ages and protected APK/config keys.

## P8D-076 — recovery rejects the setup script's real migration bookkeeping table
P1 recovery availability;8D.1/.8/.16, OPS-002/003.
setup-beta-d1.mjs creates brick_dev_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL). cardfree-recovery.ts inventory allowlist excludes _cf_METADATA/d1_migrations but not this table. Extend the actual local destruction/restore drill with that same table/row: export fails unclassified recovery schema before source destruction.
Required: explicitly validate/classify this exact bookkeeping schema, retain target migration metadata instead of treating it as recoverable family state, still reject unknown or malformed tables. Test recovery with current source/target metadata.

Original receipts: PHASE8D_D1_RETENTION_RED.txt (8 failures), PHASE8D_D1_MIGRATION_RECOVERY_RED.txt. Scheduler deferred-work/lease behavior is being isolated separately; do not treat an unrelated scheduler failure as that finding's reproduction.
