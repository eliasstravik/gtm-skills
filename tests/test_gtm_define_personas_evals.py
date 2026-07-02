from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class GtmDefinePersonasEvalTests(unittest.TestCase):
    def test_gtm_define_personas_eval_suite_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, "skills/gtm-define-personas/evals/run_evals.py"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
