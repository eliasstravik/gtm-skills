#!/usr/bin/env python3
"""Regression tests for the shared skill quality runner."""

from __future__ import annotations

import unittest
from dataclasses import replace

from evals.run_quality import (
    MAX_DESCRIPTION_LENGTH,
    lint_description,
    load_cases,
    load_descriptions,
    route,
)


class QualityRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.descriptions, errors = load_descriptions()
        if errors:
            raise AssertionError(errors)

    def test_all_routing_cases_match(self) -> None:
        for case in load_cases():
            with self.subTest(prompt=case["prompt"]):
                self.assertEqual(route(case["prompt"], self.descriptions), case["expected"])

    def test_positive_actions_come_from_description(self) -> None:
        changed = dict(self.descriptions)
        workflow = changed["gtm-workflow"]
        changed["gtm-workflow"] = replace(
            workflow,
            actions=workflow.actions - {"schedule"},
        )
        self.assertEqual(
            route("Schedule the saved pipeline-watch workflow for every weekday.", changed),
            "none",
        )

    def test_exclusions_come_from_description(self) -> None:
        changed = dict(self.descriptions)
        workflow = changed["gtm-workflow"]
        changed["gtm-workflow"] = replace(workflow, exclusion="")
        self.assertEqual(
            route(
                "Create this automation in another workflow engine, outside the saved GTM workflow system.",
                changed,
            ),
            "gtm-workflow",
        )
        self.assertEqual(
            route("Run one provider call. Do not save it as a workflow.", changed),
            "gtm-workflow",
        )

    def test_description_lint_checks_shape_names_and_length(self) -> None:
        errors = lint_description(
            "fixture",
            "Use for UnexpectedName. " + "x" * MAX_DESCRIPTION_LENGTH,
        )
        self.assertTrue(any("positive" in error for error in errors))
        self.assertTrue(any("exclusion" in error for error in errors))
        self.assertTrue(any("product name" in error for error in errors))
        self.assertTrue(any("limit" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
