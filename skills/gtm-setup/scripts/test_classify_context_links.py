#!/usr/bin/env python3
"""Regression tests for the GTM setup source-link classifier."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify_context_links import classify_link


class ClassifyContextLinksTests(unittest.TestCase):
    def test_public_link_is_saved_after_confirmation(self) -> None:
        result = classify_link("https://example.com/acme")

        self.assertEqual(result.classification, "public")
        self.assertEqual(result.commit_behavior, "save_after_confirmation")
        self.assertIsNone(result.safe_label)

    def test_tokenized_link_is_never_committed(self) -> None:
        result = classify_link("https://app.hubspot.com/contacts/123?token=secret")

        self.assertEqual(result.classification, "unsafe")
        self.assertEqual(result.commit_behavior, "never_commit")
        self.assertEqual(result.reason, "secret-bearing or tokenized query parameter")
        self.assertEqual(
            result.safe_label,
            "Sensitive source used during setup. Link not committed.",
        )

    def test_localhost_link_is_never_committed(self) -> None:
        result = classify_link("http://localhost:3000/debug")

        self.assertEqual(result.classification, "unsafe")
        self.assertEqual(result.commit_behavior, "never_commit")
        self.assertEqual(result.reason, "local-only URL")
        self.assertEqual(
            result.safe_label,
            "Local-only source used during setup. Link not committed.",
        )

    def test_private_tunnel_link_is_never_committed(self) -> None:
        result = classify_link("https://foo.ngrok.app/path")

        self.assertEqual(result.classification, "unsafe")
        self.assertEqual(result.commit_behavior, "never_commit")
        self.assertEqual(result.reason, "private-tunnel URL")
        self.assertEqual(
            result.safe_label,
            "Private tunnel source used during setup. Link not committed.",
        )


if __name__ == "__main__":
    unittest.main()
