from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class HelperScriptTests(unittest.TestCase):
    def test_metadata_validator_accepts_valid_skill(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            _write_taxonomy(repo)
            _write_skill(
                repo,
                "gtm-sample",
                """
---
name: gtm-sample
description: Use when a GTM operator needs a sample workflow.
metadata:
  function_tags: [sales]
  role_tags: [sdr]
  requires_context: [context]
  composes: []
  output_mode: ephemeral
  supports: [one-off]
---

# Sample
""",
            )

            result = _run("scripts/validate_skill_metadata.py", "--repo", str(repo))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_metadata_validator_rejects_invalid_tag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            _write_taxonomy(repo)
            _write_skill(
                repo,
                "gtm-sample",
                """
---
name: gtm-sample
description: Use when a GTM operator needs a sample workflow.
metadata:
  function_tags: [not-a-function]
  role_tags: [sdr]
  requires_context: [context]
  composes: []
  output_mode: ephemeral
  supports: [one-off]
---

# Sample
""",
            )

            result = _run("scripts/validate_skill_metadata.py", "--repo", str(repo))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not-a-function", result.stderr)

    def test_scaffold_checker_accepts_valid_context_repository(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            _write_context_repo(repo)

            result = _run("scripts/check_gtm_scaffold.py", str(repo))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_scaffold_checker_rejects_missing_gitignore_rule(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            _write_context_repo(repo)
            gitignore = repo / ".gitignore"
            gitignore.write_text(gitignore.read_text(encoding="utf-8").replace("*.key\n", ""), encoding="utf-8")

            result = _run("scripts/check_gtm_scaffold.py", str(repo))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("*.key", result.stderr)

    def test_scaffold_checker_rejects_null_optional_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            _write_context_repo(repo)
            gtm_yaml = repo / "gtm.yaml"
            gtm_yaml.write_text(
                gtm_yaml.read_text(encoding="utf-8").replace("display_name: Acme", "display_name: Acme\n  website: null"),
                encoding="utf-8",
            )

            result = _run("scripts/check_gtm_scaffold.py", str(repo))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("contains null", result.stderr)


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *args],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def _write_taxonomy(repo: Path) -> None:
    target = repo / "docs" / "taxonomy.yaml"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(REPO_ROOT / "docs" / "taxonomy.yaml", target)


def _write_skill(repo: Path, name: str, body: str) -> None:
    skill_dir = repo / "skills" / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(body.lstrip(), encoding="utf-8")


def _write_context_repo(repo: Path) -> None:
    for relative in ["business-units", "teams", "people", "workspaces/default"]:
        (repo / relative).mkdir(parents=True, exist_ok=True)
    (repo / "AGENTS.md").write_text("# Agent Instructions\n", encoding="utf-8")
    (repo / "CLAUDE.md").write_text("@AGENTS.md\n", encoding="utf-8")
    (repo / "organization.md").write_text("# Acme\n", encoding="utf-8")
    (repo / "people" / "jane-doe.md").write_text("# Jane Doe\n", encoding="utf-8")
    (repo / "workspaces" / "default" / "context.md").write_text("# Default workspace\n", encoding="utf-8")
    (repo / ".gitignore").write_text(
        """
# Local GTM state
.gtm.local.json
.gtm.local.yaml
.local/
CLAUDE.local.md

# Secrets
.env
.env.*
*.pem
*.key

# Ephemeral outputs
outputs/
research/
tmp/
*.tmp
*.log

# OS/editor noise
.DS_Store
""".lstrip(),
        encoding="utf-8",
    )
    (repo / "gtm.yaml").write_text(
        """
version: 1

organization:
  id: acme
  display_name: Acme

default_workspace: default

business_units: {}
teams: {}

people:
  jane-doe:
    display_name: Jane Doe
    role: SDR
    default_workspace: default
    path: people/jane-doe.md

workspaces:
  default:
    display_name: Default GTM Workspace
    path: workspaces/default
""".lstrip(),
        encoding="utf-8",
    )


if __name__ == "__main__":
    unittest.main()
