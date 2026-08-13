#!/usr/bin/env python3
"""Static QC for the gtm-workflow change set."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / "skills/gtm-workflow"
EVALS = ROOT / "evals/gtm-workflow"


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> None:
    failures: list[str] = []
    skill = (SKILL / "SKILL.md").read_text()
    body = skill.split("---", 2)[-1]
    headings = re.findall(r"(?m)^## (.+)$", body)
    required = ["Trigger", "Scope", "Inputs", "Roles", "Procedure", "Outputs", "Exceptions", "QC", "References"]
    require(headings == required, f"SKILL.md sections differ: {headings}", failures)
    require(len(skill.splitlines()) < 500, "SKILL.md exceeds 500 lines", failures)
    require(len(skill.split()) < 5000, "SKILL.md exceeds 5,000 tokens by conservative word count", failures)
    frontmatter = skill.split("---", 2)[1]
    description = next((line.removeprefix("description: ") for line in frontmatter.splitlines() if line.startswith("description: ")), "")
    require(description.startswith("Triggers when"), "description must start in third-person trigger form", failures)
    require(0 < len(description) <= 1024 and "<" not in description, "description length/XML check failed", failures)
    for term in ("set up", "create", "update", "inspect", "delete", "run", "Not for"):
        require(term in description, f"description lacks {term}", failures)
    require("deploy" not in re.sub(r"Not for[^.]+", "", description, flags=re.I).lower(), "description claims deploy territory", failures)
    optimization = json.loads((EVALS / "evidence/final/trigger-optimization.json").read_text())
    require(description == optimization["selection"]["best_description"], "frontmatter description differs from optimizer selection", failures)

    expected_files = {"SKILL.md", "references/contract.md", "references/flows.md", "templates/WORKFLOW.md", "templates/WORKFLOWS.md", "templates/target-clay.md", "templates/target-vercel-workflows.md", "templates/target-local.md"}
    actual_files = {path.relative_to(SKILL).as_posix() for path in SKILL.rglob("*") if path.is_file()}
    require(actual_files == expected_files, f"unexpected skill file set: {sorted(actual_files ^ expected_files)}", failures)
    require(not any(re.search(r"(?:runtime|persistence|adapter)-", path.name) for path in SKILL.rglob("*")), "backend adapter file found", failures)

    contract = (SKILL / "references/contract.md").read_text()
    flows = (SKILL / "references/flows.md").read_text()
    for reference_name, reference in (("contract", contract), ("flows", flows)):
        require(len(reference.splitlines()) <= 100 or "## Contents" in reference, f"{reference_name} exceeds 100 lines without a table of contents", failures)
    for term in ("node-local", "author, run, and inspect", "Target:", "Kind:", "no target-kind field", "saved to history", "state.sqlite", "pilot"):
        require(term.lower() in contract.lower(), f"contract lacks {term}", failures)
    require("script" in contract.lower() and "complete" in contract.lower() and "preview" in contract.lower(), "local script-byte preview is absent", failures)
    for heading in ("Setup", "Create", "Update", "Inspect", "Delete", "Run"):
        require(f"## {heading}" in flows, f"flows lacks {heading}", failures)
    require("## Deploy" not in flows and "## Doctor" not in flows, "forbidden lifecycle flow found", failures)
    require("bare publish" in flows.lower(), "bare publish routing is absent", failures)
    local_template = (SKILL / "templates/target-local.md").read_text().lower()
    for term in (
        "infrastructure or app target",
        "agent-harness scheduler",
        "kind: on-demand",
        "next_action_date",
        "workflows/lib/<connection>.ts",
        "never iterate workflow rows through agent context",
        "uvx datasette <path>/state.sqlite",
        "sqlite-web",
        "never build a custom viewer",
        "mermaid flowchart",
        "run_id",
        "status",
        "error",
        "provider",
        "npx workflow web",
        "inngest's local dev server ui",
    ):
        require(term in local_template, f"local template lacks additive guidance: {term}", failures)
    require("agent-harness scheduler" in flows.lower() and "scheduling stays outside" in flows.lower(), "create flow lacks external-scheduler alternative", failures)
    require("rows, provider calls, retries, and intermediate data" in flows.lower(), "create flow lacks code-owned iteration principle", failures)
    require("runs` table" in flows.lower() and "summarize outcomes and failures by cause and provider" in flows.lower(), "inspect flow lacks local observability summary", failures)
    require("mermaid stage flowchart" in flows.lower() and "route that tracked-byte change through update" in flows.lower(), "inspect flow lacks mutation-safe Mermaid visualization", failures)

    workspace_contract = (ROOT / "skills/gtm-workspace/references/contract.md").read_text()
    workspace_agents = (ROOT / "skills/gtm-workspace/templates/AGENTS.md").read_text()
    for value in (workspace_contract, workspace_agents):
        require("workflows/" in value and "gitignore" in value.lower() and "untracked" in value.lower(), "Part B workflows/untracked contract missing", failures)
    require("gtm-workflow` checks and repairs" in workspace_contract, "Part B doctor ownership statement missing", failures)

    data = json.loads((EVALS / "evals.json").read_text())
    require(data.get("skill_name") == "gtm-workflow", "eval skill_name mismatch", failures)
    require(len(data.get("evals", [])) == 11, "eval suite must contain exactly eleven scenarios", failures)
    require([item["id"] for item in data["evals"]] == list(range(1, 12)), "eval ids must be 1..11", failures)
    for item in data["evals"]:
        fixture = EVALS / "fixtures" / item["name"] / "fixture.json"
        require(fixture.is_file(), f"missing fixture for {item['name']}", failures)
        if fixture.is_file():
            json.loads(fixture.read_text())
        require(len(item.get("assertions", [])) == 4, f"{item['name']} must have four merged assertions", failures)

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)
    print("PASS: gtm-workflow skill, Part B edits, and all eleven eval fixtures satisfy static QC")


if __name__ == "__main__":
    main()
