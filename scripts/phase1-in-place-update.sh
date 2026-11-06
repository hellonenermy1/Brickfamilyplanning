#!/usr/bin/env bash
# Brick Phase 1: non-destructive update preflight. Does NOT update unless --apply is explicit.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: bash scripts/phase1-in-place-update.sh <phase1.apk> <adb-device-serial> [--apply]" >&2
  exit 64
fi
APK="$1"
SERIAL="$2"
MODE="${3:-check}"
[[ -f "$APK" && -s "$APK" ]] || { echo "APK missing or empty" >&2; exit 1; }
[[ "$MODE" == "check" || "$MODE" == "--apply" ]] || { echo "Only --apply is supported" >&2; exit 64; }

command -v adb >/dev/null || { echo "adb missing" >&2; exit 1; }
command -v apksigner >/dev/null || { echo "Android SDK apksigner missing" >&2; exit 1; }
command -v aapt2 >/dev/null || { echo "Android SDK aapt2 missing" >&2; exit 1; }
[[ "$(adb -s "$SERIAL" get-state)" == "device" ]] || { echo "Target device not ready" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
normalize() { tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]'; }
cert() {
  apksigner verify --print-certs "$1" |
    awk -F': ' '/Signer #1 certificate SHA-256 digest/{print $2; exit}' | normalize
}
identity() {
  aapt2 dump badging "$1" | grep -m 1 '^package:'
}
parse_code() { sed -n "s/.*versionCode='\\([0-9]*\\)'.*/\\1/p"; }
EXPECTED="bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790"
NEW_ID="$(identity "$APK")"
echo "$NEW_ID" | grep -F "name='com.brick.safety'" >/dev/null || { echo "WRONG PACKAGE. Refusing." >&2; exit 1; }
NEW_CODE="$(echo "$NEW_ID" | parse_code)"
[[ "$NEW_CODE" =~ ^[0-9]+$ ]] || { echo "Cannot read new versionCode" >&2; exit 1; }
NEW_CERT="$(cert "$APK")"
[[ "$NEW_CERT" == "$EXPECTED" ]] || { echo "Candidate not signed by pinned Brick certificate. REFUSING." >&2; exit 1; }

REMOTE="$(adb -s "$SERIAL" shell pm path com.brick.safety | tr -d '\r' | grep -m1 '^package:' | sed 's/^package://')"
[[ -n "$REMOTE" ]] || { echo "Brick is not installed. This is not an update; refusing." >&2; exit 1; }
adb -s "$SERIAL" pull "$REMOTE" "$tmp/installed.apk" >/dev/null ||
  { echo "Cannot inspect installed APK; no change made." >&2; exit 1; }
OLD_ID="$(identity "$tmp/installed.apk")"
OLD_CODE="$(echo "$OLD_ID" | parse_code)"
[[ "$OLD_CODE" =~ ^[0-9]+$ ]] || { echo "Cannot read installed versionCode" >&2; exit 1; }
OLD_CERT="$(cert "$tmp/installed.apk")"
[[ "$OLD_CERT" == "$NEW_CERT" ]] || {
  echo "SIGNING MISMATCH: installed=$OLD_CERT candidate=$NEW_CERT. Do not uninstall or re-provision." >&2
  exit 1
}
(( 10#$NEW_CODE > 10#$OLD_CODE )) || {
  echo "Version must increase: installed=$OLD_CODE candidate=$NEW_CODE. Refusing." >&2
  exit 1
}

OWNERS_BEFORE="$(adb -s "$SERIAL" shell dpm list-owners | tr -d '\r')"
if ! grep -F 'com.brick.safety/.managed.BrickDeviceAdminReceiver' <<< "$OWNERS_BEFORE" >/dev/null; then
  echo "WARNING: Brick Device Owner not confirmed on this phone. No change made automatically." >&2
fi
echo "SAFE UPDATE PREFLIGHT: package=com.brick.safety oldVersion=$OLD_CODE newVersion=$NEW_CODE"
echo "Matching pinned certificate: $NEW_CERT"
echo "Device Owner before:"
echo "$OWNERS_BEFORE"
if [[ "$MODE" != "--apply" ]]; then
  echo "PREVIEW ONLY. To update, rerun with --apply after confirming the device and backups."
  exit 0
fi

# -r retains app data. -t is intentional: this Phase 1 beta retains testOnly to
# preserve the explicitly tested emergency ADB Device Owner escape. Never use -d or -s.
adb -s "$SERIAL" install -r -t "$APK"
OWNERS_AFTER="$(adb -s "$SERIAL" shell dpm list-owners | tr -d '\r')"
[[ "$OWNERS_AFTER" == "$OWNERS_BEFORE" ]] || {
  echo "ERROR: Device Owner state changed after update. Stop, collect diagnostics. Do not wipe." >&2
  exit 1
}
REMOTE_AFTER="$(adb -s "$SERIAL" shell pm path com.brick.safety | tr -d '\r' | grep -m1 '^package:' | sed 's/^package://')"
adb -s "$SERIAL" pull "$REMOTE_AFTER" "$tmp/updated.apk" >/dev/null
[[ "$(cert "$tmp/updated.apk")" == "$NEW_CERT" ]] ||
  { echo "Installed certificate differs after update" >&2; exit 1; }
[[ "$(identity "$tmp/updated.apk" | parse_code)" == "$NEW_CODE" ]] ||
  { echo "Installed version differs after update" >&2; exit 1; }
echo "UPDATED IN PLACE: $OLD_CODE -> $NEW_CODE; certificate and Device Owner verified unchanged."
echo "Next: verify pairing, location upload, SOS and no unexpected foreground-service notification restart."
