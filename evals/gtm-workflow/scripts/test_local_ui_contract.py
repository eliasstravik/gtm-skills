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
    nitro = (TEMPLATES / "nitro.config.ts").read_text()
    run_route = (TEMPLATES / "server/api/run/[...workflow].ts").read_text()
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
        == "WORKFLOW_EMBEDDED_DATA_DIR=node_modules/.nitro/workflow WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS=360000 WORKFLOW_LOCAL_BODY_TIMEOUT_MS=360000 nitro dev",
        "Nitro dev must expose its generated graph and keep local queue timeouts above agent timeouts",
    )
    require(
        "workflow:build" not in scripts and "workflow:web" not in scripts,
        "the embedded v5 UI must not require a second build or web process",
    )
    require(
        'workflow: { dirs: ["workflows"] }' in nitro,
        "Nitro must discover definitions from the inner workflows directory",
    )
    require(
        "workflow//./workflows/${workflowPath}//${functionName}" in run_route,
        "the run route must construct IDs from the inner workflows directory",
    )

    for name in ("gitignore", "vercelignore"):
        ignored = (TEMPLATES / name).read_text().splitlines()
        require(".well-known/" in ignored, f"{name} must ignore generated bundles")

    actions = (SKILL_ROOT / "references/flows.md").read_text()
    open_contract = (SKILL_ROOT / "references/open.md").read_text()
    require(
        "http://127.0.0.1:<port>/_workflow" in open_contract,
        "inspect flow must use Nitro's embedded UI route",
    )
    require(
        "fetchWorkflowsManifest" in open_contract,
        "inspect flow must verify actual workflow discovery",
    )
    require(
        "`workflows/<slug>.ts`" in open_contract
        and "`workflows/<suborg-path>/<slug>.ts`" in open_contract,
        "the UI contract must report inner workflows/ definition paths",
    )
    require(
        "`workflows/**/*.ts`" in actions,
        "inspection must scan the canonical definition directory",
    )
    require(
        "WORKFLOW_EMBEDDED_DATA_DIR=node_modules/.nitro/workflow"
        in scripts.get("dev", ""),
        "the dev command must connect the beta UI to Nitro's generated manifest",
    )

    print("Local Workflows UI contract is valid.")


if __name__ == "__main__":
    main()
