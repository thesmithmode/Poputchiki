from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import llm_backend


class CodexBackendSecurityTests(unittest.TestCase):
    def test_codex_command_does_not_ignore_repository_rules(self):
        command = llm_backend._codex_command(Path("/tmp/work"), "read-only", Path("/tmp/out.md"))

        self.assertNotIn("--ignore-rules", command)

    def test_codex_execution_fails_closed_without_explicit_tool_opt_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(llm_backend.os.environ, {}, clear=True):
                with self.assertRaises(llm_backend.UntrustedCodexToolingError):
                    llm_backend._run_codex("untrusted transcript", Path(tmp), "read-only")

    def test_codex_execution_can_be_explicitly_enabled_for_manual_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            captured = {}

            def fake_run(command, **kwargs):
                captured["command"] = command
                output_path = Path(command[command.index("-o") + 1])
                output_path.write_text("ok", encoding="utf-8")

                class Result:
                    returncode = 0
                    stdout = ""
                    stderr = ""

                return Result()

            with patch.dict(
                llm_backend.os.environ,
                {"WIKI_ALLOW_CODEX_TOOLS": "1", "CODEX_CLI_PATH": "/missing/codex"},
                clear=True,
            ):
                with patch.object(llm_backend, "find_codex_cli", return_value="codex"):
                    with patch.object(llm_backend.subprocess, "run", side_effect=fake_run):
                        self.assertEqual(llm_backend._run_codex("trusted", Path(tmp), "read-only"), "ok")

            self.assertEqual(captured["command"][0:2], ["codex", "exec"])
            self.assertNotIn("--ignore-rules", captured["command"])


if __name__ == "__main__":
    unittest.main()
