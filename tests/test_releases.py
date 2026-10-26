"""Validate real release archives and their public checksums."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from release_fixture import release_fixture

ROOT = Path(__file__).resolve().parents[1]


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='aikya-release-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = release_fixture(ROOT, self.base / 'source')

    def build(self, output='dist', root=None, version='v1.2.3'):
        return subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build_release.py'),
                               '--root', str(root or self.source), '--version', version, '--output', str(self.base / output)],
                              text=True, capture_output=True)

    def fixture(self):
        return release_fixture(ROOT, self.base / 'invalid-source')

    def test_archives_contain_installable_mods_and_hashes_match_actual_assets(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = self.base / 'dist'
        metadata = json.loads((output / 'release.json').read_text())
        self.assertEqual(metadata['version'], 'v1.2.3')
        self.assertEqual(metadata['release_notes'], '### Added\n\n- Fixture release notes.\n')
        self.assertEqual(metadata['claude_version'], '2.1.308')
        self.assertEqual(metadata['mods'], {'aikya-boxbot': '0.3.0', 'aikya-flow': '0.1.0', 'aikya-usage': '0.1.0'})
        with zipfile.ZipFile(output / 'aikya-mods-v1.2.3.zip') as archive:
            names = archive.namelist()
            self.assertIn('aikya-mods/install.sh', names)
            self.assertEqual(archive.read('aikya-mods/VERSION'), b'1.2.3\n')
            self.assertIn(b'Fixture release notes.', archive.read('aikya-mods/CHANGELOG.md'))
            self.assertIn('aikya-mods/installers/install.ps1', names)
            self.assertIn('aikya-mods/.claude-plugin/marketplace.json', names)
            self.assertIn('aikya-mods/scripts/build_release.py', names)
            self.assertIn('aikya-mods/tests/integration_install.py', names)
            self.assertIn('aikya-mods/.github/workflows/release.yml', names)
            self.assertFalse(any('/.git/' in n or '/types/' in n or n.endswith('.pyc') for n in names))
        for name, version in metadata['mods'].items():
            with zipfile.ZipFile(output / f'{name}-{version}.zip') as archive:
                self.assertIn(f'{name}/.claude-plugin/plugin.json', archive.namelist())
                self.assertIn(f'{name}/hooks/register.js', archive.namelist())
        sums = (output / 'SHA256SUMS').read_text().splitlines()
        self.assertEqual({line.split('  ', 1)[1] for line in sums}, {p.name for p in output.iterdir()} - {'SHA256SUMS'})
        for line in sums:
            digest, filename = line.split('  ', 1)
            self.assertEqual(hashlib.sha256((output / filename).read_bytes()).hexdigest(), digest)

    def test_rebuilding_produces_identical_bytes(self):
        for output in ('one', 'two'):
            result = self.build(output)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({p.name: p.read_bytes() for p in (self.base / 'one').iterdir()},
                         {p.name: p.read_bytes() for p in (self.base / 'two').iterdir()})

    def test_bad_tag_or_inconsistent_catalog_is_rejected_before_packaging(self):
        for version in ('main', 'v1.2', 'v01.2.3', 'v1.2.3/escape'):
            result = self.build(version=version)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.base / 'dist').exists())
        fixture = self.fixture()
        manifest = fixture / 'mods' / 'aikya-flow' / '.claude-plugin' / 'plugin.json'
        data = json.loads(manifest.read_text())
        data['version'] = '9.9.9'
        manifest.write_text(json.dumps(data))
        result = self.build(root=fixture)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('version', result.stderr.lower())
        self.assertFalse((self.base / 'dist').exists())

    def test_tag_must_match_version_before_any_output_is_created(self):
        result = self.build(version='v1.2.4')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('VERSION', result.stderr)
        self.assertFalse((self.base / 'dist').exists())

    def test_missing_duplicate_or_empty_release_notes_are_rejected(self):
        for index, changelog in enumerate((
            '# Changelog\n\n## [1.2.2] - 2026-10-24\n\n- Older.\n',
            '## [1.2.3] - 2026-10-25\n\n- One.\n\n## [1.2.3] - 2026-10-25\n\n- Two.\n',
            '## [1.2.3] - 2026-10-25\n\n### Added\n',
        )):
            with self.subTest(changelog=changelog):
                (self.source / 'CHANGELOG.md').write_text(changelog, encoding='utf-8')
                result = self.build(output=f'missing-notes-{index}')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('CHANGELOG', result.stderr)
                self.assertFalse((self.base / f'missing-notes-{index}').exists())

    def test_check_reads_current_version_without_building_assets(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/build_release.py'),
                                 '--root', str(self.source), '--check', '--output', str(self.base / 'dist')],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['version'], 'v1.2.3')
        self.assertFalse((self.base / 'dist').exists())

    def test_existing_output_is_not_overwritten(self):
        output = self.base / 'dist'
        output.mkdir()
        (output / 'keep.txt').write_text('keep')
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((output / 'keep.txt').read_text(), 'keep')
        self.assertEqual(len(list(output.iterdir())), 1)

    @unittest.skipIf(sys.platform == 'win32', 'Creating symlinks needs Windows developer mode')
    def test_symlinks_are_not_packaged(self):
        fixture = self.fixture()
        (fixture / 'mods' / 'aikya-flow' / 'lib' / 'leak.js').symlink_to(ROOT / 'LICENSE')
        result = self.build(root=fixture)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('symlink', result.stderr.lower())


if __name__ == '__main__':
    unittest.main()
