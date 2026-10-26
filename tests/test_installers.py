"""Exercise installer selection and subprocess boundaries without user configuration."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipIf(os.name == 'nt', 'The local Bash installer is checked on Linux/macOS')
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="aikya installers ")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.log = self.base / "commands.jsonl"
        self.env = dict(os.environ, PATH=f"{self.bin}:/usr/bin:/bin", AIKYA_TEST_LOG=str(self.log))
        cli = self.bin / "claude"
        cli.write_text("#!" + sys.executable + "\n" + '''import json, os, sys
with open(os.environ["AIKYA_TEST_LOG"], "a") as stream:
    stream.write(json.dumps(sys.argv[1:]) + "\\n")
stage = os.environ.get("AIKYA_TEST_FAIL", "")
if stage == "marketplace" and sys.argv[1:4] == ["plugin", "marketplace", "add"]:
    sys.exit(17)
if stage == "install" and sys.argv[1:3] == ["plugin", "install"]:
    sys.exit(19)
''')
        cli.chmod(0o755)

    def run_installer(self, *args, input=None, script=None):
        return subprocess.run(["/bin/bash", str(script or ROOT / "install.sh"), *args],
                              input=input, text=True, capture_output=True, env=self.env, cwd=self.base)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def expected(self, scope="user", root=ROOT, mods=("aikya-boxbot",)):
        return [["plugin", "marketplace", "add", str(root), "--scope", scope],
                *[ ["plugin", "install", mod + "@aikya-mods", "--scope", scope] for mod in mods ]]

    def test_list_offers_all_released_mods_without_calling_claude(self):
        result = self.run_installer("--list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("aikya-boxbot", result.stdout)
        self.assertIn("aikya-flow", result.stdout)
        self.assertIn("aikya-usage", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_named_mod_registers_and_installs_at_requested_scope(self):
        result = self.run_installer("aikya-boxbot", "--scope", "project")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected("project"))

    def test_interactive_number_selects_the_mod(self):
        result = self.run_installer(input="1\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Select", result.stdout)
        self.assertEqual(self.calls(), self.expected())

    def test_cancel_never_calls_claude(self):
        result = self.run_installer(input="q\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), [])

    def test_eof_does_not_install(self):
        result = self.run_installer(input="")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_invalid_selection_is_rejected_before_any_install(self):
        for args, input in [(("aikya-boxbot", "unknown"), None), ((), "1 999\n"),
                            (("aikya-unknown",), None), (("--scope", "system", "aikya-boxbot"), None),
                            (("--scope",), None), (("--unknown",), None),
                            (("--all", "aikya-boxbot"), None)]:
            with self.subTest(args=args, input=input):
                result = self.run_installer(*args, input=input)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_dry_run_prints_commands_but_does_not_execute(self):
        result = self.run_installer("--all", "--dry-run", "--scope", "local")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("aikya-boxbot@aikya-mods", result.stdout)
        self.assertIn("local", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_all_installs_each_available_mod_once(self):
        result = self.run_installer("--all")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected(mods=("aikya-boxbot", "aikya-flow", "aikya-usage")))

    def test_duplicate_selection_installs_once(self):
        result = self.run_installer("aikya-boxbot", "aikya-boxbot")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected())

    def test_individual_installer_forwards_scope(self):
        result = self.run_installer("--scope", "local", script=ROOT / "mods/aikya-boxbot/install.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected("local"))

    def test_flow_and_usage_install_individually_and_as_a_menu_selection(self):
        for mod in ("aikya-flow", "aikya-usage"):
            with self.subTest(mod=mod):
                if self.log.exists():
                    self.log.unlink()
                result = self.run_installer("--scope", "project", script=ROOT / "mods" / mod / "install.sh")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.calls(), self.expected("project", mods=(mod,)))
        self.log.unlink(missing_ok=True)
        result = self.run_installer(input="2 3\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected(mods=("aikya-flow", "aikya-usage")))

    def test_repository_paths_with_spaces_are_one_argument(self):
        copied = self.base / "repository with spaces"
        shutil.copytree(ROOT, copied, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        result = self.run_installer("--all", script=copied / "install.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), self.expected(root=copied.resolve(), mods=("aikya-boxbot", "aikya-flow", "aikya-usage")))

    def test_marketplace_failure_prevents_install(self):
        self.env["AIKYA_TEST_FAIL"] = "marketplace"
        result = self.run_installer("--all")
        self.assertEqual(result.returncode, 17, result.stderr)
        self.assertEqual(self.calls(), self.expected()[:1])

    def test_install_failure_is_not_reported_as_success(self):
        self.env["AIKYA_TEST_FAIL"] = "install"
        result = self.run_installer("--all")
        self.assertEqual(result.returncode, 19, result.stderr)
        self.assertNotIn("Installation complete", result.stdout)

    def test_missing_claude_provides_an_actionable_error(self):
        self.env["PATH"] = "/usr/bin:/bin"
        result = self.run_installer("--all")
        self.assertEqual(result.returncode, 127, result.stderr)
        self.assertIn("Claude Code", result.stderr)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
