#!/usr/bin/env python3
"""Recompute gtm.libHashes for the workflow templates from the headered files."""
import hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / "skills/gtm-workflow/templates"
FIXED = ["scripts/gtm.ts", "scripts/migrate-cloud.ts", "scripts/verify-migrations.ts", "drizzle.config.ts", "nitro.config.ts"]

def headered_files():
    files = []
    for folder in ("lib", "server/api", "server/routes"):
        base = ROOT / folder
        if base.exists():
            files += [p for p in base.rglob("*.ts")]
    files += [ROOT / f for f in FIXED]
    return sorted(files, key=lambda p: str(p.relative_to(ROOT)))

def main() -> int:
    package_path = ROOT / "package.json"
    package = json.loads(package_path.read_text())
    version = package["gtm"]["libVersion"]
    hashes = {}
    for path in headered_files():
        text = path.read_text()
        first = text.split("\n", 1)[0]
        expected = f"// gtm-lib v{version}"
        if first != expected:
            print(f"{path.relative_to(ROOT)}: header is {first!r}, expected {expected!r}", file=sys.stderr)
            return 1
        hashes[str(path.relative_to(ROOT))] = hashlib.sha256(text.encode()).hexdigest()
    package["gtm"]["libHashes"] = hashes
    package_path.write_text(json.dumps(package, indent=2) + "\n")
    print(f"refreshed {len(hashes)} hashes for gtm-lib v{version}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
