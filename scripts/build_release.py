#!/usr/bin/env python3
"""Build deterministic, self-contained release assets using the standard library."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import zipfile


SEMVER = r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)'


def checked_file(root: Path, relative: str) -> Path:
    path = root / relative
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root):
        raise ValueError(f'Symlink is not a release input: {relative}')
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Missing or invalid release input: {relative}')
    return path


def catalog(root: Path) -> dict[str, str]:
    data = json.loads(checked_file(root, '.claude-plugin/marketplace.json').read_text())
    if data.get('name') != 'aikya-mods' or not data.get('plugins'):
        raise ValueError('Invalid marketplace catalog.')
    mods = {}
    for entry in data['plugins']:
        name, version = entry['name'], entry['version']
        if not re.fullmatch(r'aikya-[a-z0-9-]+', name) or name in mods:
            raise ValueError(f'Invalid or duplicate plugin name: {name}')
        if entry['source'] != f'./mods/{name}' or not re.fullmatch(SEMVER, version):
            raise ValueError(f'Invalid source or version for {name}')
        manifest = json.loads(checked_file(root, f'mods/{name}/.claude-plugin/plugin.json').read_text())
        if manifest.get('name') != name or manifest.get('version') != version:
            raise ValueError(f'Plugin/catalog name or version mismatch: {name}')
        for required in ('hooks/hooks.json', 'hooks/register.js', 'README.md', 'LICENSE'):
            checked_file(root, f'mods/{name}/{required}')
        mods[name] = version
    return mods


def zip_files(destination: Path, entries: dict[str, bytes]) -> None:
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith('.sh') else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)


def build(root: Path, version: str, output: Path) -> None:
    if not re.fullmatch('v' + SEMVER, version):
        raise ValueError('Invalid release tag; use vMAJOR.MINOR.PATCH without leading zeroes.')
    mods = catalog(root)
    claude_version = checked_file(root, '.claude-version').read_text().strip()
    if not re.fullmatch(SEMVER, claude_version):
        raise ValueError('Invalid pinned Claude version.')
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError('The release output directory must be empty; existing files are never replaced.')
    files = ['README.md', 'LICENSE', 'install.sh', '.claude-version', '.gitattributes', '.gitignore', '.claude-plugin/marketplace.json',
             'installers/install.sh', 'installers/install.ps1']
    for folder in ('docs', 'aikya/docs/research'):
        files.extend(str(p.relative_to(root)) for p in (root / folder).rglob('*.md'))
    for folder, pattern in (('scripts', '*.py'), ('tests', '*.py'), ('.github/workflows', '*.yml')):
        files.extend(str(p.relative_to(root)) for p in (root / folder).rglob(pattern))
    plugin_files = {}
    for name in mods:
        selected = [f'mods/{name}/{p}' for p in ('.claude-plugin/plugin.json', 'README.md', 'LICENSE', 'install.sh')]
        for folder in ('lib', 'hooks'):
            selected.extend(str(p.relative_to(root)) for p in (root / 'mods' / name / folder).rglob('*')
                            if p.is_file() and p.suffix in ('.js', '.json'))
        selected.extend(str(p.relative_to(root)) for p in (root / 'mods' / name / 'tests').rglob('*.test.ts'))
        plugin_files[name] = selected
        files.extend(selected)
    contents = {relative.replace('\\', '/'): checked_file(root, relative).read_bytes() for relative in files}
    metadata = {'version': version, 'claude_version': claude_version, 'mods': mods}
    metadata_bytes = (json.dumps(metadata, indent=2, sort_keys=True) + '\n').encode()
    output.mkdir(parents=True, exist_ok=True)
    bundle = {f'aikya-mods/{path}': data for path, data in contents.items()}
    bundle['aikya-mods/release.json'] = metadata_bytes
    zip_files(output / f'aikya-mods-{version}.zip', bundle)
    for name, selected in plugin_files.items():
        entries = {path.replace('\\', '/').removeprefix('mods/'): contents[path.replace('\\', '/')] for path in selected}
        zip_files(output / f'{name}-{mods[name]}.zip', entries)
    for installer in ('install.sh', 'install.ps1'):
        shutil.copyfile(root / 'installers' / installer, output / installer)
    (output / 'release.json').write_bytes(metadata_bytes)
    sums = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(output.iterdir()))
    (output / 'SHA256SUMS').write_text(sums, encoding='utf-8', newline='\n')
    print(f'Built {len(list(output.iterdir()))} release assets for {version} in {output}')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--version', required=True)
    parser.add_argument('--output', type=Path, default=Path('dist'))
    args = parser.parse_args()
    try:
        build(args.root.resolve(), args.version, args.output.resolve())
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
