#!/usr/bin/env python3
"""Deterministic tests for the canonical GTM workspace hierarchy."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from grade_evals import (
    canonical_member_paths,
    canonical_org_tree,
    canonical_workspace,
    legacy_migration_targets,
)


def write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)


class WorkspaceContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name) / "acme"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_root_organization_and_member_are_canonical(self) -> None:
        write(self.repo / "ORG.md", "# Acme\n")
        write(self.repo / "members/alex-rivera/MEMBER.md", "# Alex Rivera\n\n- Email: alex@example.com\n")

        self.assertTrue(canonical_org_tree(self.repo))
        self.assertTrue(canonical_member_paths(self.repo))
        self.assertTrue(canonical_workspace(self.repo))

    def test_direct_suborganization_and_member_are_canonical(self) -> None:
        write(self.repo / "ORG.md", "# Acme\n")
        write(self.repo / "suborgs/europe/ORG.md", "# Acme Europe\n")
        write(self.repo / "suborgs/europe/members/sam-lee/MEMBER.md", "# Sam Lee\n\n- Email: sam@example.com\n")

        self.assertTrue(canonical_workspace(self.repo))

    def test_recursive_suborganization_and_member_are_canonical(self) -> None:
        write(self.repo / "ORG.md", "# Acme\n")
        write(self.repo / "suborgs/europe/ORG.md", "# Acme Europe\n")
        write(self.repo / "suborgs/europe/suborgs/nordics/ORG.md", "# Acme Nordics\n")
        write(
            self.repo / "suborgs/europe/suborgs/nordics/members/ida-lind/MEMBER.md",
            "# Ida Lind\n\n- Email: ida@example.com\n",
        )

        self.assertTrue(canonical_workspace(self.repo))

    def test_suborganization_without_org_file_is_rejected(self) -> None:
        write(self.repo / "ORG.md", "# Acme\n")
        write(self.repo / "suborgs/europe/members/sam-lee/MEMBER.md", "# Sam Lee\n\n- Email: sam@example.com\n")

        self.assertFalse(canonical_org_tree(self.repo))
        self.assertFalse(canonical_workspace(self.repo))

    def test_legacy_shapes_are_rejected_and_map_in_place(self) -> None:
        write(self.repo / "ORG.md", "# Acme\n")
        legacy_org = self.repo / "suborgs/europe/org.md"
        legacy_member = self.repo / "suborgs/europe/people/sam-lee/PERSON.md"
        write(legacy_org, "# Acme Europe\n")
        write(legacy_member, "# Sam Lee\n\n- Email: sam@example.com\n")

        self.assertFalse(canonical_workspace(self.repo))
        self.assertEqual(
            legacy_migration_targets(self.repo),
            {
                legacy_org: self.repo / "suborgs/europe/ORG.md",
                legacy_member: self.repo / "suborgs/europe/members/sam-lee/MEMBER.md",
            },
        )


if __name__ == "__main__":
    unittest.main()
