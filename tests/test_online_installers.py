"""Run online installers with only Git/Claude's external boundary replaced."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PWSH = os.environ.get('AIKYA_TEST_PWSH') or shutil.which('pwsh')
REPO = 'https://github.com/jlema0590/aikya-mods.git'
MODS = ('aikya-boxbot', 'aikya-flow', 'aikya-usage')


class OnlineCases:
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='aikya online ')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.source = self.base / 'source with spaces'
        self.source.mkdir()
        shutil.copy2(ROOT / 'install.sh', self.source / 'install.sh')
        shutil.copytree(ROOT / '.claude-plugin', self.source / '.claude-plugin')
        self.log = self.base / 'calls.jsonl'
        helper = self.base / 'boundary.py'
        helper.write_text('''import json, os, pathlib, shutil, sys
tool, args = sys.argv[1], sys.argv[2:]
with open(os.environ['AIKYA_TEST_LOG'], 'a') as stream:
    stream.write(json.dumps({'tool': tool, 'args': args, 'cwd': os.getcwd()}) + '\\n')
stage = os.environ.get('AIKYA_TEST_FAIL', '')
if tool == 'git':
    if args[0] == 'clone':
        if stage == 'clone': sys.exit(23)
        shutil.copytree(os.environ['AIKYA_TEST_SOURCE'], args[-1])
        pathlib.Path(args[-1], '.git').mkdir()
    elif 'get-url' in args:
        print(os.environ.get('AIKYA_TEST_ORIGIN', 'https://github.com/jlema0590/aikya-mods.git'))
    elif 'diff' in args and stage == 'dirty': sys.exit(1)
    elif 'fetch' in args and stage == 'fetch': sys.exit(23)
elif tool == 'claude':
    if args[:3] == ['plugin', 'marketplace', 'add'] and stage == 'marketplace': sys.exit(17)
    if args[:2] == ['plugin', 'install'] and stage == 'install': sys.exit(19)
''')
        for tool in ('git', 'claude'):
            command = self.bin / (tool + ('.cmd' if os.name == 'nt' else ''))
            if os.name == 'nt':
                command.write_text(f'@"{sys.executable}" "{helper}" {tool} %*\r\n')
            else:
                command.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(helper))} {tool} "$@"\n')
                command.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        AIKYA_TEST_LOG=str(self.log), AIKYA_TEST_SOURCE=str(self.source),
                        AIKYA_MODS_HOME=str(self.base / 'persistent cache'))

    def options(self, *, mods=(), scope=None, source=False, version=None, dry=False, listing=False, all_mods=False):
        if self.powershell:
            args = []
            if mods: args += ['-Mods', ','.join(mods)]
            for key, value in (('-Scope', scope), ('-Version', version), ('-Source', str(self.source) if source else None)):
                if value is not None: args += [key, value]
            if dry: args += ['-DryRun']
            if listing: args += ['-List']
            if all_mods: args += ['-All']
            return args
        args = list(mods)
        for key, value in (('--scope', scope), ('--version', version), ('--source', str(self.source) if source else None)):
            if value is not None: args += [key, value]
        if dry: args += ['--dry-run']
        if listing: args += ['--list']
        if all_mods: args += ['--all']
        return args

    def run_script(self, *args, piped=False):
        script = ROOT / 'installers' / ('install.ps1' if self.powershell else 'install.sh')
        self.assertTrue(script.is_file(), f'Missing online installer: {script}')
        if self.powershell:
            command = [str(PWSH), '-NoProfile', '-NonInteractive']
            command += ['-Command', '& ([scriptblock]::Create([Console]::In.ReadToEnd()))'] if piped else ['-File', str(script), *args]
        else:
            command = ['/bin/bash', '-s', '--', *args] if piped else ['/bin/bash', str(script), *args]
        return subprocess.run(command, input=script.read_text() if piped else None, text=True,
                              capture_output=True, env=self.env, cwd=self.base, timeout=30)

    def calls(self, tool=None):
        rows = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return [row for row in rows if tool is None or row['tool'] == tool]

    def test_piped_script_installs_all_without_a_menu(self):
        result = self.run_script(piped=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([row['args'][2] for row in self.calls('claude')[1:]], [m + '@aikya-mods' for m in MODS])
        self.assertTrue((Path(self.env['AIKYA_MODS_HOME']) / 'main' / 'install.sh').is_file())

    def test_source_selection_deduplicates_and_preserves_scope_and_cwd(self):
        result = self.run_script(*self.options(mods=('aikya-flow', 'aikya-flow', 'aikya-usage'), scope='local', source=True))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.calls('git'), [])
        calls = self.calls('claude')
        self.assertEqual(Path(calls[0]['args'][3]).resolve(), self.source.resolve())
        # macOS resolves /var to /private/var; both spellings name the same source.
        calls[0]['args'][3] = str(self.source)
        self.assertEqual([r['args'] for r in calls], [
            ['plugin', 'marketplace', 'add', str(self.source), '--scope', 'local'],
            ['plugin', 'install', 'aikya-flow@aikya-mods', '--scope', 'local'],
            ['plugin', 'install', 'aikya-usage@aikya-mods', '--scope', 'local'],
        ])
        self.assertTrue(all(Path(r['cwd']).resolve() == self.base.resolve() for r in self.calls('claude')))

    def test_invalid_selection_and_options_do_not_download_or_configure(self):
        for options in (self.options(mods=('aikya-flow', 'missing')), self.options(scope='system'),
                        self.options(version='v1.2.3;bad'), self.options(mods=('aikya-flow',), all_mods=True)):
            with self.subTest(options=options):
                result = self.run_script(*options)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])
                self.assertFalse(Path(self.env['AIKYA_MODS_HOME']).exists())

    def test_dry_run_does_not_create_a_checkout_or_run_commands(self):
        result = self.run_script(*self.options(mods=('aikya-flow',), version='v1.2.3', dry=True))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('v1.2.3', result.stdout)
        self.assertIn('aikya-flow@aikya-mods', result.stdout)
        self.assertEqual(self.calls(), [])
        self.assertFalse(Path(self.env['AIKYA_MODS_HOME']).exists())

    def test_listing_has_no_side_effects(self):
        result = self.run_script(*self.options(listing=True))
        self.assertEqual(result.returncode, 0, result.stderr)
        for mod in MODS: self.assertIn(mod, result.stdout)
        self.assertEqual(self.calls(), [])

    def test_missing_claude_is_reported_before_cloning(self):
        (self.bin / ('claude.cmd' if os.name == 'nt' else 'claude')).unlink()
        self.env['PATH'] = str(self.bin)
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Claude Code', result.stderr)
        self.assertEqual(self.calls(), [])

    def test_invalid_source_is_not_registered(self):
        self.source.rename(self.base / 'moved source')
        result = self.run_script(*self.options(source=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_explicit_version_is_cloned_into_its_persistent_directory(self):
        result = self.run_script(*self.options(version='v1.2.3'))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        clone = self.calls('git')[0]['args']
        self.assertEqual(clone, ['clone', '--depth', '1', '--branch', 'v1.2.3', REPO, str(Path(self.env['AIKYA_MODS_HOME']) / 'v1.2.3')])

    def test_repeated_install_updates_the_existing_checkout(self):
        first = self.run_script()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        self.log.write_text('')
        again = self.run_script()
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertFalse(any(row['args'][0] == 'clone' for row in self.calls('git')))
        self.assertTrue(any('fetch' in row['args'] for row in self.calls('git')))

    def test_foreign_or_dirty_cache_is_not_replaced_or_registered(self):
        first = self.run_script()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        for key, value in (('AIKYA_TEST_ORIGIN', 'https://example.invalid/other.git'), ('AIKYA_TEST_FAIL', 'dirty')):
            self.log.write_text('')
            self.env[key] = value
            result = self.run_script()
            self.env.pop(key)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.calls('claude'), [])
            self.assertFalse(any('fetch' in row['args'] for row in self.calls('git')))

    def test_clone_or_claude_failure_never_reports_completion(self):
        for stage in ('clone', 'marketplace', 'install'):
            with self.subTest(stage=stage):
                self.env['AIKYA_TEST_FAIL'] = stage
                self.log.write_text('')
                result = self.run_script(*self.options(source=stage != 'clone'))
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('Installation complete', result.stdout)
                if stage == 'marketplace': self.assertEqual(len(self.calls('claude')), 1)


@unittest.skipIf(os.name == 'nt', 'Bash path is tested on Linux and macOS')
class BashOnlineTests(OnlineCases, unittest.TestCase):
    powershell = False


@unittest.skipUnless(PWSH, 'PowerShell is required; the Windows CI job provides it')
class PowerShellOnlineTests(OnlineCases, unittest.TestCase):
    powershell = True


if __name__ == '__main__':
    unittest.main()
