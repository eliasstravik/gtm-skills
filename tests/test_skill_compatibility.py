"""Deterministic regression tests for workflow generation prose."""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.check_skill_compatibility import workflow_generation_errors


class WorkflowGenerationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="gtm-generation-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "templates").mkdir()
        (self.root / "references/nested").mkdir(parents=True)
        (self.root / "SKILL.md").write_text("Compare // gtm-lib v<N> with gtm.libVersion.\n")
        self.package = self.root / "templates/package.json"
        self.package.write_text(json.dumps({"gtm": {"libVersion": 20}}))

    def test_stale_targets_in_entrypoint_and_nested_references(self) -> None:
        cases = (
            "Compare every `// gtm-lib v18` header.",
            "Offer the **v19** recopy.",
            "Recopy v17 through update.",
            "Offer a v18 re-scaffold.",
            "Recopy to the `v18` template.",
            "Offer the v18\nrecopy.",
        )
        for relative in ("SKILL.md", "references/nested/upgrade.md"):
            path = self.root / relative
            for prose in cases:
                with self.subTest(path=relative, prose=prose):
                    path.write_text("# Upgrade\n\n" + prose)
                    errors = workflow_generation_errors(self.root)
                    self.assertEqual(len(errors), 1)
                    self.assertIn(f"{relative}:3:", errors[0])
                    self.assertIn("gtm.libVersion is 20", errors[0])
            path.write_text("")

    def test_history_and_symbolic_targets_survive_a_generation_bump(self) -> None:
        (self.root / "references/contract.md").write_text(
            "A v9 project has a defect. A v14 project needs a fix.\n"
            "A v17 project lacks checks. A v19 project can hang.\n"
            "Offer the current-generation recopy. Recopy the current generation.\n"
            "Use // gtm-lib v<N>, with N from template gtm.libVersion.\n"
        )
        # Managed headers and fixture examples are outside the prose check.
        (self.root / "templates/example.md").write_text("// gtm-lib v9")
        for generation in (20, 21):
            self.package.write_text(json.dumps({"gtm": {"libVersion": generation}}))
            self.assertEqual(workflow_generation_errors(self.root), [])

    def test_numeric_targets_are_checked_against_the_template_value(self) -> None:
        (self.root / "SKILL.md").write_text("// gtm-lib v20\nOffer the v20 recopy.\nRecopy v20.")
        self.assertEqual(workflow_generation_errors(self.root), [])
        self.package.write_text(json.dumps({"gtm": {"libVersion": 21}}))
        self.assertEqual(len(workflow_generation_errors(self.root)), 3)


if __name__ == "__main__":
    unittest.main()
