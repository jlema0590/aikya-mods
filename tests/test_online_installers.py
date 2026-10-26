"""Exercise standalone installers with real release files and HTTP/Claude boundaries."""
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
import time
from release_fixture import release_fixture

ROOT = Path(__file__).resolve().parents[1]
PWSH = os.environ.get('AIKYA_TEST_PWSH') or shutil.which('pwsh')
MODS = ('aikya-boxbot', 'aikya-flow', 'aikya-usage')


class OnlineCases:
    @classmethod
    def setUpClass(cls):
        cls.release_temp = tempfile.TemporaryDirectory(prefix='aikya release fixture ')
        cls.addClassCleanup(cls.release_temp.cleanup)
        base = Path(cls.release_temp.name)
        cls.fixture_source = release_fixture(ROOT, base / 'source')
        cls.fixture_assets = base / 'assets'
        subprocess.run([sys.executable, str(ROOT / 'scripts/build_release.py'), '--root', str(cls.fixture_source),
                        '--output', str(cls.fixture_assets)], check=True, capture_output=True)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='aikya online ')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.source = self.base / 'source with spaces á'
        shutil.copytree(self.fixture_source, self.source)
        self.assets = self.base / 'assets'
        shutil.copytree(self.fixture_assets, self.assets)
        self.log = self.base / 'calls.jsonl'
        helper = self.base / 'boundary.py'
        helper.write_text('''import json, os, pathlib, shutil, sys
tool, args = sys.argv[1], sys.argv[2:]
with open(os.environ['AIKYA_TEST_LOG'], 'a', encoding='utf-8') as stream:
    stream.write(json.dumps({'tool': tool, 'args': args, 'cwd': os.getcwd()}) + '\\n')
stage = os.environ.get('AIKYA_TEST_FAIL', '')
if tool == 'git': sys.exit(91)
if tool in ('curl', 'wget'):
    if stage == 'http': sys.exit(22)
    url = next(a for a in args if a.startswith('https://'))
    output = args[args.index('-o' if tool == 'curl' else '-O') + 1]
    asset = pathlib.Path(os.environ['AIKYA_TEST_ASSETS'], url.rsplit('/', 1)[1])
    if not asset.is_file(): sys.exit(22)
    shutil.copyfile(asset, output)
elif tool == 'claude':
    if args[:2] == ['plugin', 'validate']:
        if stage == 'validate': sys.exit(15)
        if not pathlib.Path(args[2]).is_dir(): sys.exit(16)
    if args[:3] == ['plugin', 'marketplace', 'add'] and stage == 'marketplace': sys.exit(17)
    if args[:2] == ['plugin', 'install'] and stage == 'install': sys.exit(19)
''', encoding='utf-8')
        for tool in ('git', 'claude', 'curl', 'wget'):
            command = self.bin / (tool + ('.cmd' if os.name == 'nt' else ''))
            if os.name == 'nt':
                command.write_text(f'@"{sys.executable}" "{helper}" {tool} %*\r\n')
            else:
                command.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(helper))} {tool} "$@"\n')
                command.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        AIKYA_TEST_LOG=str(self.log), AIKYA_TEST_ASSETS=str(self.assets),
                        AIKYA_MODS_HOME=str(self.base / 'persistent cache á'))

    def options(self, *, mods=(), scope=None, source=False, version=None, dry=False, listing=False, all_mods=False):
        args = ['-Mods', ','.join(mods)] if mods and self.powershell else list(mods)
        for unix, windows, value in (('--scope', '-Scope', scope), ('--version', '-Version', version),
                                      ('--source', '-Source', str(self.source) if source else None)):
            if value is not None: args += [windows if self.powershell else unix, value]
        for unix, windows, value in (('--dry-run', '-DryRun', dry), ('--list', '-List', listing), ('--all', '-All', all_mods)):
            if value: args += [windows if self.powershell else unix]
        return args

    def run_script(self, *args, piped=False, script=None):
        script = script or ROOT / 'installers' / ('install.ps1' if self.powershell else 'install.sh')
        if self.powershell:
            # Replace only PowerShell's HTTP boundary, leaving the script and ZIP APIs real.
            wrapper = self.base / 'invoke.ps1'
            quoted = lambda s: "'" + str(s).replace("'", "''") + "'"
            command = '& ([scriptblock]::Create([Console]::In.ReadToEnd()))' if piped else '& ' + quoted(script)
            command += ' ' + ' '.join(a if a.startswith('-') else quoted(a) for a in args)
            command += '\nif (-not $?) { exit 1 }; if ($LASTEXITCODE) { exit $LASTEXITCODE }'
            wrapper.write_text('''function Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing)
    $record = @{tool='http'; args=@($Uri); cwd=(Get-Location).Path} | ConvertTo-Json -Compress
    Add-Content -LiteralPath $env:AIKYA_TEST_LOG -Value $record -Encoding UTF8
    if ($env:AIKYA_TEST_FAIL -eq 'http') { throw 'HTTP 404' }
    $asset = Join-Path $env:AIKYA_TEST_ASSETS ($Uri.Split('/')[-1])
    Copy-Item -LiteralPath $asset -Destination $OutFile -ErrorAction Stop
}
''' + command, encoding='utf-8-sig')
            command = [str(PWSH), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper)]
        else:
            command = ['/bin/bash', '-s', '--', *args] if piped else ['/bin/bash', str(script), *args]
        return subprocess.run(command, input=script.read_text() if piped else '', text=True,
                              capture_output=True, encoding='utf-8', errors='replace', env=self.env, cwd=self.base, timeout=40)

    def calls(self, tool=None):
        rows = [json.loads(line.lstrip('\ufeff')) for line in self.log.read_text(encoding='utf-8-sig').splitlines()] if self.log.exists() else []
        return [row for row in rows if tool is None or row['tool'] == tool]

    def configurations(self):
        return [r for r in self.calls('claude') if r['args'][:2] != ['plugin', 'validate']]

    def retained(self):
        return Path(self.env['AIKYA_MODS_HOME']) / 'releases/v1.2.3/aikya-mods'

    def rehash(self):
        (self.assets / 'SHA256SUMS').write_text(''.join(
            hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n'
            for p in sorted(self.assets.iterdir()) if p.name != 'SHA256SUMS'), encoding='ascii')

    def test_piped_script_installs_all_without_a_menu(self):
        result = self.run_script(piped=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([r['args'][2] for r in self.configurations()[1:]], [m + '@aikya-mods' for m in MODS])
        self.assertTrue((self.retained() / 'install.sh').is_file())
        self.assertEqual(self.calls('git'), [])
        self.assertNotIn('Choose an option', result.stdout)

    def test_source_selection_deduplicates_and_preserves_scope_and_cwd(self):
        result = self.run_script(*self.options(mods=('aikya-flow', 'aikya-flow', 'aikya-usage'), scope='local', source=True))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.calls('git'), [])
        self.assertFalse(any(r['tool'] in ('http', 'curl', 'wget') for r in self.calls()))
        calls = self.configurations()
        self.assertEqual(Path(calls[0]['args'][3]).resolve(), self.source.resolve())
        self.assertEqual([r['args'][2] for r in calls[1:]], ['aikya-flow@aikya-mods', 'aikya-usage@aikya-mods'])
        self.assertTrue(all(r['args'][-2:] == ['--scope', 'local'] for r in calls))
        self.assertTrue(all(Path(r['cwd']).resolve() == self.base.resolve() for r in calls))

    def test_invalid_selection_and_options_do_not_download_or_configure(self):
        for options in (self.options(mods=('aikya-flow', 'missing')), self.options(scope='system'),
                        self.options(version='v1.2.3;bad'), self.options(mods=('aikya-flow',), all_mods=True),
                        self.options(version='v0.0.10')):
            result = self.run_script(*options)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertEqual(self.calls(), [])
            self.assertFalse(Path(self.env['AIKYA_MODS_HOME']).exists())

    def test_dry_run_has_no_network_writes_or_commands(self):
        for version in (None, 'v1.2.3'):
            result = self.run_script(*self.options(mods=('aikya-flow',), version=version, dry=True))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(version or 'latest stable', result.stdout)
            self.assertIn('aikya-flow@aikya-mods', result.stdout)
        self.assertEqual(self.calls(), [])
        self.assertFalse(Path(self.env['AIKYA_MODS_HOME']).exists())

    def test_listing_has_no_side_effects(self):
        result = self.run_script(*self.options(listing=True))
        self.assertEqual(result.returncode, 0, result.stderr)
        for mod in MODS: self.assertIn(mod, result.stdout)
        self.assertEqual(self.calls(), [])

    def test_missing_claude_is_reported_before_downloading(self):
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
        self.assertEqual(self.configurations(), [])

    def test_explicit_version_downloads_only_that_release(self):
        result = self.run_script(*self.options(version='v1.2.3', mods=('aikya-flow',)))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        requests = [r for r in self.calls() if r['tool'] in ('http', 'curl', 'wget')]
        self.assertTrue(requests)
        self.assertTrue(all('/releases/download/v1.2.3/' in ' '.join(r['args']) for r in requests))
        self.assertTrue(self.retained().is_dir())
        self.assertEqual(self.calls('git'), [])

    def test_latest_is_resolved_once_and_downloads_are_pinned(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        urls = [a for r in self.calls() if r['tool'] in ('http', 'curl', 'wget') for a in r['args'] if a.startswith('https://')]
        self.assertEqual(urls[0], 'https://github.com/jlema0590/aikya-mods/releases/latest/download/installer-manifest.txt')
        self.assertTrue(all('/releases/download/v1.2.3/' in url for url in urls[1:]))

    def test_repeated_install_reuses_identical_files_and_preserves_legacy_checkout(self):
        legacy = Path(self.env['AIKYA_MODS_HOME']) / 'main/.git'
        legacy.mkdir(parents=True)
        first = self.run_script()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        again = self.run_script()
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertTrue(legacy.is_dir())
        self.assertEqual(self.calls('git'), [])
        self.assertFalse((legacy.parent.parent / '.install-lock').exists())

    def test_modified_version_is_not_overwritten_or_registered(self):
        self.assertEqual(self.run_script().returncode, 0)
        target = self.retained() / 'VERSION'
        target.write_text('local changes')
        self.log.write_text('')
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(target.read_text(), 'local changes')
        self.assertEqual(self.configurations(), [])

    @unittest.skipIf(os.name == 'nt', 'POSIX terminal is tested on Linux/macOS')
    def test_terminal_menu_defaults_to_flow_usage_and_cancel_has_no_effects(self):
        import pty
        import select
        for answer, expected in ((b'\n', ['aikya-flow@aikya-mods', 'aikya-usage@aikya-mods']), (b'Q\n', [])):
            self.log.write_text('')
            master, slave = pty.openpty()
            script = ROOT / 'installers' / ('install.ps1' if self.powershell else 'install.sh')
            command = [str(PWSH), '-NoProfile', '-File', str(script), '-Source', str(self.source)] if self.powershell else ['/bin/bash', str(script), '--source', str(self.source)]
            process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, env=dict(self.env, TERM='dumb'), cwd=self.base)
            os.close(slave)
            output = b''
            sent = False
            deadline = time.monotonic() + 20
            try:
                while process.poll() is None and time.monotonic() < deadline:
                    if select.select([master], [], [], 0.1)[0]:
                        try: output += os.read(master, 65536)
                        except OSError: break
                    if b'Choose an option' in output and not sent:
                        os.write(master, answer); sent = True
                self.assertEqual(process.wait(timeout=2), 0, output.decode(errors='replace'))
                self.assertTrue(sent, output.decode(errors='replace'))
            finally:
                if process.poll() is None: process.kill(); process.wait()
                os.close(master)
            self.assertEqual([r['args'][2] for r in self.configurations()[1:]], expected)
            self.assertFalse(Path(self.env['AIKYA_MODS_HOME']).exists())

    @unittest.skipIf(os.name == 'nt', 'Creating symlinks requires privileges on Windows')
    def test_links_inside_an_existing_version_are_not_reused(self):
        self.assertEqual(self.run_script().returncode, 0)
        original = self.retained() / 'VERSION'
        saved = self.base / 'same version bytes'
        original.rename(saved)
        original.symlink_to(saved)
        self.log.write_text('')
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(original.is_symlink())
        self.assertEqual(self.configurations(), [])

    def test_existing_lock_is_not_removed(self):
        lock = Path(self.env['AIKYA_MODS_HOME']) / '.install-lock'
        lock.mkdir(parents=True)
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(lock.is_dir())
        self.assertEqual(self.configurations(), [])

    def test_download_validation_or_claude_failure_never_reports_completion(self):
        for stage in ('http', 'validate', 'marketplace', 'install'):
            self.env['AIKYA_TEST_FAIL'] = stage
            self.log.write_text('')
            result = self.run_script()
            self.assertNotEqual(result.returncode, 0, stage)
            self.assertNotIn('Installation complete', result.stdout)
            self.assertFalse((Path(self.env['AIKYA_MODS_HOME']) / '.install-lock').exists())
            if stage in ('marketplace', 'install'):
                self.assertTrue(self.retained().is_dir(), 'Keep sources referenced by partial installation')
            else:
                self.assertEqual(self.configurations(), [])

    def test_corrupt_archive_is_rejected_before_configuration(self):
        extension = 'zip' if self.powershell else 'tar.gz'
        (self.assets / f'aikya-mods-v1.2.3.{extension}').write_bytes(b'truncated')
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.configurations(), [])
        self.assertFalse(self.retained().exists())

    def test_manifest_schema_duplicate_and_tag_mismatch_are_rejected(self):
        manifest = self.assets / 'installer-manifest.txt'
        original = manifest.read_text()
        for invalid in (original.replace('installer_schema=1', 'installer_schema=9'),
                        original + 'version=v1.2.3\n', original.replace('version=v1.2.3', 'version=v1.2.4')):
            manifest.write_text(invalid)
            self.rehash()
            result = self.run_script(*self.options(version='v1.2.3'))
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.configurations(), [])

    def test_archive_paths_links_and_duplicate_entries_are_rejected(self):
        extension = 'zip' if self.powershell else 'tar.gz'
        target = self.assets / f'aikya-mods-v1.2.3.{extension}'
        for name in ('../escape', '/absolute', 'aikya-mods/../escape', 'aikya-mods/link', 'aikya-mods/duplicate'):
            with self.subTest(name=name):
                if self.powershell:
                    with zipfile.ZipFile(target, 'w') as archive:
                        if name == 'aikya-mods/link':
                            entry = zipfile.ZipInfo(name)
                            entry.create_system = 3
                            entry.external_attr = 0o120777 << 16
                            archive.writestr(entry, '../escape')
                        else:
                            archive.writestr(name, 'bad')
                            if name == 'aikya-mods/duplicate':
                                archive.writestr(name.upper(), 'collision on Windows')
                else:
                    with tarfile.open(target, 'w:gz') as archive:
                        entry = tarfile.TarInfo(name)
                        if name == 'aikya-mods/link':
                            entry.type = tarfile.SYMTYPE
                            entry.linkname = '../escape'
                        archive.addfile(entry, io.BytesIO())
                        if name == 'aikya-mods/duplicate': archive.addfile(entry, io.BytesIO())
                self.rehash()
                result = self.run_script()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.configurations(), [])
                self.assertFalse((Path(self.env['AIKYA_MODS_HOME']) / 'escape').exists())


@unittest.skipIf(os.name == 'nt', 'Bash path is tested on Linux and macOS')
class BashOnlineTests(OnlineCases, unittest.TestCase):
    powershell = False


@unittest.skipUnless(PWSH, 'PowerShell is required; the Windows CI job provides it')
class PowerShellOnlineTests(OnlineCases, unittest.TestCase):
    powershell = True


if __name__ == '__main__':
    unittest.main()
