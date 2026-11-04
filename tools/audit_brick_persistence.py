#!/usr/bin/env python3
"""Phase 8C fail-closed sweep of Android-owned persistent namespaces.

This is a guardrail, not a full proof of filesystem completeness. Audit sources and dynamic
storage paths manually; new literal Brick stores must appear in DeprovisionManager's purge list.
"""
from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "src" / "main" / "java"
DEPROVISION = SOURCE / "com" / "brick" / "safety" / "maintenance" / "DeprovisionManager.kt"


def declarations(source: str) -> dict[str, str]:
    """Find named simple String constants used in getSharedPreferences/Keystore/file calls."""
    return dict(re.findall(r'\b(?:const\s+)?val\s+([A-Za-z_]\w*)\s*=\s*"([^"]+)"', source))


def purge_list(source: str, key: str) -> set[str]:
    match = re.search(rf'\bprivate\s+val\s+{re.escape(key)}\s*=\s*listOf\s*\((.*?)\n\s*\)', source, re.S)
    if match is None:
        raise ValueError(f"cannot find canonical purge list {key}")
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def main() -> int:
    if not SOURCE.is_dir() or not DEPROVISION.is_file():
        print("ERROR: expected Android production tree missing", file=sys.stderr)
        return 2

    deprov = DEPROVISION.read_text(encoding="utf-8")
    try:
        prefs_expected = purge_list(deprov, "brickPreferences")
        db_expected = purge_list(deprov, "brickDatabases")
        files_expected = purge_list(deprov, "brickFiles")
        aliases_expected = purge_list(deprov, "brickKeyAliases")
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    found_prefs: dict[str, set[str]] = {}
    found_db: dict[str, set[str]] = {}
    found_files: dict[str, set[str]] = {}
    found_aliases: dict[str, set[str]] = {}
    unresolved: list[str] = []

    def put(mapping: dict[str, set[str]], name: str, rel: str) -> None:
        if name.startswith("brick"):
            mapping.setdefault(name, set()).add(rel)

    paths = sorted(SOURCE.rglob("*.kt")) + sorted(SOURCE.rglob("*.java"))
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        raw = path.read_text(encoding="utf-8")
        const = declarations(raw)

        for name in re.findall(r'\bgetSharedPreferences\s*\(\s*"([^"]+)"', raw):
            put(found_prefs, name, rel)
        for name in re.findall(r'\bgetSharedPreferences\s*\(\s*([A-Za-z_]\w*)\s*,', raw):
            if name in const:
                put(found_prefs, const[name], rel)
            elif path.name != "DeprovisionManager.kt":
                unresolved.append(f"{rel}: dynamic SharedPreferences namespace '{name}'")

        # Literal SQLite names and resolved declarations in production storage classes.
        for name in re.findall(r'"(brick[\w.-]+\.db)"', raw):
            if path.name != "DeprovisionManager.kt":
                put(found_db, name, rel)
        for name in re.findall(r'"(brick[\w.-]+\.(?:bin|json))"', raw):
            if path.name != "DeprovisionManager.kt":
                put(found_files, name, rel)

        if "AndroidKeyStore" in raw and "KeyGenParameterSpec.Builder" in raw:
            for name in re.findall(r'\bKeyGenParameterSpec\.Builder\s*\(\s*([A-Za-z_]\w*)', raw):
                if name in const:
                    put(found_aliases, const[name], rel)
                else:
                    unresolved.append(f"{rel}: unresolved AndroidKeyStore alias '{name}'")

    # The deprovision stage/origin marker intentionally remains until the uninstall handoff.
    found_prefs.pop("brick_deprovision_v1", None)

    missing = []
    for label, seen, expected in (
        ("SharedPreferences", found_prefs, prefs_expected),
        ("SQLite", found_db, db_expected),
        ("file", found_files, files_expected),
        ("Keystore", found_aliases, aliases_expected),
    ):
        for name in sorted(set(seen) - expected):
            missing.append(f"{label} {name} not in DeprovisionManager: {', '.join(sorted(seen[name]))}")
        print(f"{label}: discovered {len(seen)}, registered {len(expected)}")

    # AtomicFile may leave .new or .bak. Prevent reverting to base-file-only purge.
    if 'for (suffix in listOf("", ".new", ".bak"))' not in deprov:
        missing.append("AtomicFile purge no longer covers base/.new/.bak paths")
    if "brick_ble_anchors" not in prefs_expected:
        missing.append("BLE anchor configuration omitted from purge")

    print(f"Files inspected: {len(paths)}")
    for failure in missing + unresolved:
        print(f"BLOCKER: {failure}", file=sys.stderr)
    return 1 if missing or unresolved else 0


if __name__ == "__main__":
    sys.exit(main())
