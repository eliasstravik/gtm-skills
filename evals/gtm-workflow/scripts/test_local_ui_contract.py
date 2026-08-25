#!/usr/bin/env python3
"""Check the gtm-workflow template's local observability contract."""

from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_ROOT = REPO_ROOT / "skills/gtm-workflow"
TEMPLATES = SKILL_ROOT / "templates"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    package = json.loads((TEMPLATES / "package.json").read_text())
    scripts = package.get("scripts", {})
    require(scripts.get("dev") == "nitro dev", "Nitro development must remain native")
    require(
        scripts.get("workflow:build") == "workflow build",
        "workflow:build must create the CLI-discoverable graph manifest",
    )
    require(
        scripts.get("workflow:web") == "npm run workflow:build && workflow web",
        "workflow:web must refresh the manifest before the native UI",
    )

    for name in ("gitignore", "vercelignore"):
        ignored = (TEMPLATES / name).read_text().splitlines()
        require(".well-known/" in ignored, f"{name} must ignore generated bundles")

    flows = (SKILL_ROOT / "references/flows.md").read_text()
    contract = (SKILL_ROOT / "references/contract.md").read_text()
    require(
        "npm run workflow:web -- --noBrowser" in flows,
        "inspect flow must launch the native UI script",
    )
    require(
        "fetchWorkflowsManifest" in flows,
        "inspect flow must verify actual workflow discovery",
    )
    require(
        ".well-known/workflow/v1/manifest.json" in contract,
        "contract must name the graph manifest",
    )

    print("Local Workflows UI contract is valid.")


if __name__ == "__main__":
    main()
