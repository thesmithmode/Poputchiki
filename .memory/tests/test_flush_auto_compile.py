from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))


class AutoCompileSafetyTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.pop("MEMORY_ENABLE_AUTO_COMPILE", None)
        self.flush = importlib.import_module("flush")

    def test_auto_compile_is_disabled_by_default(self) -> None:
        self.assertFalse(self.flush.auto_compilation_enabled())

        with patch("subprocess.Popen") as popen:
            self.flush.maybe_trigger_compilation()

        popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
