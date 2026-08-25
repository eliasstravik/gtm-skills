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
    require(
        package.get("dependencies", {}).get("workflow") == "5.0.0-beta.44",
        "the template must pin the tested Workflow v5 beta",
    )
    require(
        "rollup" not in package.get("dependencies", {}),
        "Nitro's Workflow module must own workflow bundling",
    )
    require(
        scripts.get("dev")
        == "WORKFLOW_EMBEDDED_DATA_DIR=node_modules/.nitro/workflow nitro dev",
        "Nitro dev must expose its generated graph to the embedded v5 UI",
    )
    require(
        "workflow:build" not in scripts and "workflow:web" not in scripts,
        "the embedded v5 UI must not require a second build or web process",
    )

    for name in ("gitignore", "vercelignore"):
        ignored = (TEMPLATES / name).read_text().splitlines()
        require(".well-known/" in ignored, f"{name} must ignore generated bundles")

    flows = (SKILL_ROOT / "references/flows.md").read_text()
    contract = (SKILL_ROOT / "references/contract.md").read_text()
    require(
        "http://127.0.0.1:<port>/_workflow" in flows,
        "inspect flow must use Nitro's embedded UI route",
    )
    require(
        "fetchWorkflowsManifest" in flows,
        "inspect flow must verify actual workflow discovery",
    )
    require(
        "WORKFLOW_EMBEDDED_DATA_DIR=node_modules/.nitro/workflow" in contract,
        "contract must connect the beta UI to Nitro's generated manifest",
    )

    print("Local Workflows UI contract is valid.")


if __name__ == "__main__":
    main()
