#!/usr/bin/env python3
"""Publish verified assets through a resumable GitHub draft release."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

from build_release import SEMVER


def local_assets(folder: Path, tag: str) -> dict[str, tuple[int, str]]:
    metadata = json.loads((folder / 'release.json').read_text())
    if metadata.get('version') != tag:
        raise ValueError('Release metadata does not match the requested tag.')
    if not isinstance(metadata.get('release_notes'), str) or not metadata['release_notes'].strip():
        raise ValueError('Release notes are required in release.json.')
    expected = {f'aikya-mods-{tag}.zip', 'install.sh', 'install.ps1', 'release.json'}
    for name, version in metadata['mods'].items():
        if not re.fullmatch(r'aikya-[a-z0-9-]+', name) or not re.fullmatch(SEMVER, version):
            raise ValueError('Invalid plugin metadata.')
        expected.add(f'{name}-{version}.zip')
    sums = {}
    for line in (folder / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1)
        if not re.fullmatch(r'[a-f0-9]{64}', digest) or not re.fullmatch(r'[a-zA-Z0-9_.-]+', name) or name in sums:
            raise ValueError('Invalid checksum entry.')
        sums[name] = digest
    if set(sums) != expected or {p.name for p in folder.iterdir()} != expected | {'SHA256SUMS'}:
        raise ValueError('The release asset inventory is incomplete or contains unexpected files.')
    assets = {}
    for name in sorted(expected | {'SHA256SUMS'}):
        path = folder / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Invalid asset: {name}')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name != 'SHA256SUMS' and sums[name] != digest:
            raise ValueError(f'Checksum mismatch: {name}')
        assets[name] = (path.stat().st_size, 'sha256:' + digest)
    return assets


def publish(repo: str, tag: str, sha: str, folder: Path, dry_run: bool = False) -> None:
    if not re.fullmatch('v' + SEMVER, tag) or not re.fullmatch(r'[a-f0-9]{40}|[a-f0-9]{64}', sha):
        raise ValueError('A stable version tag and full commit SHA are required.')
    if not re.fullmatch(r'[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+', repo):
        raise ValueError('Use an owner/repository name.')
    assets = local_assets(folder, tag)
    if dry_run:
        print(f'Verified {tag}: {len(assets)} release assets. Dry run complete.')
        return
    executable = shutil.which('gh')
    if not executable:
        raise ValueError('GitHub CLI is required.')

    def gh(*arguments: str) -> str:
        return subprocess.run([executable, *arguments], text=True, capture_output=True, check=True).stdout

    pages = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100'))
    releases = [release for page in pages for release in page]
    existing = next((release for release in releases if release['tag_name'] == tag), None)
    if existing:
        if not existing['draft']:
            raise ValueError('This release is already published; published assets are never replaced.')
        if existing.get('target_commitish') != sha:
            raise ValueError('The existing draft targets another commit; it was left unchanged.')
    else:
        with tempfile.TemporaryDirectory(prefix='aikya-release-notes-') as temporary:
            notes = Path(temporary) / 'notes.md'
            notes.write_text(json.loads((folder / 'release.json').read_text())['release_notes'], encoding='utf-8')
            gh('release', 'create', tag, '--repo', repo, '--verify-tag', '--target', sha,
               '--draft', '--notes-file', str(notes), '--title', f'Aikya Mods {tag}')
    gh('release', 'upload', tag, '--repo', repo, *(str(folder / name) for name in assets), '--clobber')
    remote = json.loads(gh('api', f'repos/{repo}/releases/tags/{tag}'))
    uploaded = {item['name']: (item['size'], item.get('digest')) for item in remote['assets']}
    if not remote['draft'] or remote.get('target_commitish') != sha or uploaded != assets:
        raise ValueError('Uploaded assets or draft metadata did not match; the draft was not published.')
    current = tuple(map(int, tag[1:].split('.')))
    published = [tuple(map(int, release['tag_name'][1:].split('.'))) for release in releases
                 if not release['draft'] and re.fullmatch('v' + SEMVER, release['tag_name'])]
    latest = not published or current >= max(published)
    gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest' if latest else '--latest=false')
    print(f'Published {tag} with {len(assets)} verified assets.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--dry-run', action='store_true', help='Verify local assets without contacting GitHub')
    args = parser.parse_args()
    try:
        publish(args.repo, args.tag, args.sha, args.assets.resolve(), args.dry_run)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        detail = error.stderr if isinstance(error, subprocess.CalledProcessError) else str(error)
        print(f'Error: {detail}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
