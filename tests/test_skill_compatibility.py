"""Deterministic regression tests for the skill compatibility checker."""

import tempfile
import unittest
from pathlib import Path

from scripts.check_skill_compatibility import DELETED_TOOL_NAMES, check_deleted_tool_names


class DeletedToolNameTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="gtm-compat-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "gtm-workflow/references").mkdir(parents=True)

    def test_clean_skill_text_passes(self) -> None:
        (self.root / "gtm-workflow/SKILL.md").write_text("Show one card, then push.\n")
        errors: list[str] = []
        check_deleted_tool_names(self.root, errors)
        self.assertEqual(errors, [])

    def test_every_deleted_tool_name_is_reported_with_its_file(self) -> None:
        self.assertTrue(DELETED_TOOL_NAMES)
        for name in DELETED_TOOL_NAMES:
            with self.subTest(name=name):
                path = self.root / "gtm-workflow/references/flow.md"
                path.write_text(f"Call `{name}` to save.\n")
                errors: list[str] = []
                check_deleted_tool_names(self.root, errors)
                self.assertEqual(len(errors), 1)
                self.assertIn(name, errors[0])
                self.assertIn("flow.md", errors[0])


if __name__ == "__main__":
    unittest.main()
