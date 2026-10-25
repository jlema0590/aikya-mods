"""Exercise draft publication against a stateful GitHub CLI boundary."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHA = 'a' * 40


class PublishReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='aikya publish ')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.dist = self.base / 'assets'
        built = subprocess.run([sys.executable, str(ROOT / 'scripts/build_release.py'), '--version', 'v1.2.3', '--output', str(self.dist)], capture_output=True, text=True)
        self.assertEqual(built.returncode, 0, built.stderr)
        self.state = self.base / 'state.json'
        self.state.write_text('null')
        self.log = self.base / 'calls.jsonl'
        helper = self.base / 'gh.py'
        helper.write_text('''import hashlib, json, os, pathlib, sys
args = sys.argv[1:]
state_path = pathlib.Path(os.environ['AIKYA_GH_STATE'])
state = json.loads(state_path.read_text())
with open(os.environ['AIKYA_GH_LOG'], 'a') as stream: stream.write(json.dumps(args) + '\\n')
fault = os.environ.get('AIKYA_GH_FAULT')
if args[0] == 'api':
    if '--paginate' in args: print(json.dumps([[state]] if state else [[]]))
    else: print(json.dumps(state))
elif args[:2] == ['release', 'create']:
    state = {'tag_name': args[2], 'draft': True, 'target_commitish': args[args.index('--target') + 1], 'assets': []}
elif args[:2] == ['release', 'upload']:
    if fault == 'upload': sys.exit(19)
    state['assets'] = [{'name': pathlib.Path(p).name, 'size': pathlib.Path(p).stat().st_size,
        'digest': 'sha256:' + ('0' * 64 if fault == 'digest' else hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest())}
        for p in args[3:] if pathlib.Path(p).is_file()]
elif args[:2] == ['release', 'edit']:
    state['draft'] = False
state_path.write_text(json.dumps(state))
''')
        bindir = self.base / 'bin'
        bindir.mkdir()
        launcher = bindir / ('gh.cmd' if os.name == 'nt' else 'gh')
        if os.name == 'nt': launcher.write_text(f'@"{sys.executable}" "{helper}" %*\r\n')
        else:
            launcher.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(helper))} "$@"\n')
            launcher.chmod(0o755)
        self.env = dict(os.environ, PATH=str(bindir) + os.pathsep + os.environ['PATH'], AIKYA_GH_STATE=str(self.state), AIKYA_GH_LOG=str(self.log))

    def publish(self):
        return subprocess.run([sys.executable, str(ROOT / 'scripts/publish_release.py'), '--repo', 'owner/repo',
                               '--tag', 'v1.2.3', '--sha', SHA, '--assets', str(self.dist)],
                              env=self.env, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_new_release_is_published_only_after_every_asset_is_verified(self):
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(self.state.read_text())['draft'])
        mutations = [args[:2] for args in self.calls() if args[0] == 'release']
        self.assertEqual(mutations, [['release', 'create'], ['release', 'upload'], ['release', 'edit']])

    def test_a_failed_upload_or_digest_leaves_a_draft(self):
        for fault in ('upload', 'digest'):
            self.state.write_text('null')
            self.log.write_text('')
            self.env['AIKYA_GH_FAULT'] = fault
            result = self.publish()
            self.assertNotEqual(result.returncode, 0)
            state = json.loads(self.state.read_text())
            self.assertIsNotNone(state, 'The upload attempt must first create a draft')
            self.assertTrue(state['draft'])
            self.assertFalse(any(args[:2] == ['release', 'edit'] for args in self.calls()))

    def test_a_matching_draft_can_be_resumed(self):
        self.state.write_text(json.dumps({'tag_name': 'v1.2.3', 'draft': True, 'target_commitish': SHA, 'assets': []}))
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(args[:2] == ['release', 'create'] for args in self.calls()))
        self.assertFalse(json.loads(self.state.read_text())['draft'])

    def test_published_release_or_draft_for_another_commit_is_not_changed(self):
        for draft, sha in ((False, SHA), (True, 'b' * 40)):
            self.state.write_text(json.dumps({'tag_name': 'v1.2.3', 'draft': draft, 'target_commitish': sha, 'assets': []}))
            self.log.write_text('')
            result = self.publish()
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(args[0] == 'release' for args in self.calls()))

    def test_tampered_asset_is_rejected_before_github_is_called(self):
        (self.dist / 'install.sh').write_text('tampered')
        result = self.publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_an_older_release_does_not_replace_the_latest_version(self):
        self.state.write_text(json.dumps({'tag_name': 'v9.0.0', 'draft': False, 'target_commitish': SHA, 'assets': []}))
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        edited = next(args for args in self.calls() if args[:2] == ['release', 'edit'])
        self.assertIn('--latest=false', edited)


if __name__ == '__main__':
    unittest.main()
