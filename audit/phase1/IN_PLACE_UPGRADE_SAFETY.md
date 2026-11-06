# Phase 1 — in-place upgrade safety (draft, 6 November 2026)

**Do not uninstall the installed Brick application.** A standard Android APK update preserves app data and Device Owner only if Android accepts a compatible signed package; don't assume the connected phone has the project signing certificate just because CI does.

- Repository package remains `com.brick.safety`; Device Admin receiver remains `com.brick.safety/.managed.BrickDeviceAdminReceiver`.
- Phase 1 candidate version code is **12**, newer than the last known beta source (11). This is **not** a downgrade path for a phone already on 12+.
- Pinned permanent SHA-256 signer: `bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790`.
- This is deliberately a **test-only Device Owner beta** preserving the emergency ADB removal escape. Normal tapping of this test-only APK is not the safe installation path. Use `adb install -r -t` only after the non-destructive preflight.
- The script `scripts/phase1-in-place-update.sh` checks the **actual phone** with `adb pull`, `apksigner`, `aapt2` and `dpm list-owners`, refuses mismatched certificates, and does not install until the separate `--apply` option. If `adb pull` is blocked, STOP; do not bypass the proof by guessing.
- No factory reset, `adb uninstall`, `pm clear`, key regeneration or Device Owner release is part of upgrading.
- Recheck local pairing, active tracking, durable upload/ACK, SOS and required foreground notification after the update. A build or emulator test is not proof that the OPPO tracks on ColorOS.
- Cloudflare/parent portal implementation is **Phase 2**. This phase does not change D1, device records, credentials, deployment or access policies.
- The beta workflow is expected to produce a signed `1.0.0-beta.2` APK using existing GitHub secrets; **do not distribute an artifact until the workflow passes all release gates**. The actual installed signing certificate must still be verified before use.

### Commands (Chromebook Linux / computer with Android platform/build tools)

```bash
bash scripts/phase1-in-place-update.sh /path/to/Brick-Phase1.apk YOUR_ADB_DEVICE_SERIAL
# Inspect the output and explicitly confirm the connected phone.
bash scripts/phase1-in-place-update.sh /path/to/Brick-Phase1.apk YOUR_ADB_DEVICE_SERIAL --apply
```

The script is NOT a guarantee that location uploads or notifications work; those need the phone and backend real-world checks.
