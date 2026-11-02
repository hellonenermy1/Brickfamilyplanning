# Brick V1 — Phase 8 Supply-Chain Pins

Phase 8 Android workflows use immutable Git commit SHAs for third-party GitHub Actions. Human-readable tag/version comments are retained only as update context.

Resolved on 2026-11-02:

- `actions/checkout` v5 -> `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/setup-java` v5 -> `b6effb05e454b25005698d916606bdc6ffcbf961`
- `gradle/actions/setup-gradle` v6.4.1 -> `8da46b539cd8fe6ab27ca75128919a18d757604c` (annotated v6 tag verified by GitHub)
- `actions/upload-artifact` v4 -> `ea165f8d65b6e75b540449e92b4886f43607fa02`

Android dependencies remain locked through `app/gradle.lockfile`; Phase 8 CI fails if regenerating locks changes the file, if a dynamic `+`/wildcard dependency is introduced, or if known advertising/analytics SDK families appear in the lockfile.

These pins apply to the Phase 8 workflows only. Older retained historical workflows are evidence from earlier phases and are not silently rewritten.
