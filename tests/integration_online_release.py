"""Install generated OS assets over local HTTP with real Claude in isolated configurations."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
CLI = shutil.which('claude')
RELEASE_URL = 'https://github.com/jlema0590/aikya-mods/releases/'
MODS = {'aikya-flow@aikya-mods', 'aikya-usage@aikya-mods'}


def run(command, cwd, env, *, success=True):
    result = subprocess.run(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            capture_output=True, encoding='utf-8', errors='replace', timeout=120)
    if success and result.returncode:
        raise AssertionError(f'{command[0]} exited {result.returncode}: {result.stdout}\n{result.stderr}')
    if not success and not result.returncode:
        raise AssertionError('A corrupt download unexpectedly succeeded.')
    return result


def verify(config, project, env, scope, source):
    entries = json.loads(run([CLI, 'plugin', 'list', '--json'], project, env).stdout)
    if isinstance(entries, dict): entries = entries.get('installed', entries.get('plugins', []))
    assert {entry['id'] for entry in entries} == MODS, entries
    filename = config / 'settings.json' if scope == 'user' else project / '.claude' / ('settings.json' if scope == 'project' else 'settings.local.json')
    settings = json.loads(filename.read_text(encoding='utf-8-sig'))
    assert all(settings.get('enabledPlugins', {}).get(name) is True for name in MODS), settings
    if scope != 'user':
        user = config / 'settings.json'
        assert not (json.loads(user.read_text()).get('enabledPlugins') if user.exists() else {}), user
    known = json.loads((config / 'plugins/known_marketplaces.json').read_text(encoding='utf-8-sig'))
    assert Path(known['aikya-mods']['source']['path']).resolve() == source.resolve(), known
    assert (source / '.claude-plugin/marketplace.json').is_file(), source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, help='Existing assets for the current VERSION; otherwise build them')
    args = parser.parse_args()
    if not CLI: raise SystemExit('Claude Code is required for real installation checks.')
    version = 'v' + (ROOT / 'VERSION').read_text().strip()
    major, minor, patch = map(int, version[1:].split('.'))
    next_version = f'v{major}.{minor}.{patch + 1}'
    with tempfile.TemporaryDirectory(prefix='aikya online integration ') as temporary:
        base = Path(temporary)
        assets = args.assets.resolve() if args.assets else base / 'assets'
        if not args.assets:
            run([sys.executable, str(ROOT / 'scripts/build_release.py'), '--output', str(assets)], base, os.environ)
        next_source = base / 'next source'
        shutil.copytree(ROOT, next_source, ignore=shutil.ignore_patterns('.git', 'dist', '__pycache__', '.release-tools'))
        (next_source / 'VERSION').write_text(next_version[1:] + '\n')
        (next_source / 'CHANGELOG.md').write_text(f'# Changelog\n\n## [{next_version[1:]}] - 2026-10-26\n\n- Integration update fixture.\n')
        next_assets = base / 'next assets'
        run([sys.executable, str(ROOT / 'scripts/build_release.py'), '--root', str(next_source), '--output', str(next_assets)], base, os.environ)
        releases = {version: assets, next_version: next_assets}
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *unused): pass
            def do_GET(self):
                requests.append(self.path)
                match = re.fullmatch(r'/(?:download/(v[0-9.]+)|latest/download)/([A-Za-z0-9_.-]+)', self.path)
                tag = (match[1] or version) if match else None
                asset = releases[tag] / match[2] if tag in releases else None
                if not asset or not asset.is_file(): self.send_error(404); return
                data = asset.read_bytes()
                if self.server.corrupt and match[2].endswith(('.zip', '.tar.gz')): data = b'corrupt download'
                self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.corrupt = False
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            transport = base / 'transport'; transport.mkdir()
            # Test-only transport adapters rewrite the fixed HTTPS repository to loopback HTTP.
            # Production scripts retain their fixed HTTPS endpoints and have no test override.
            endpoint = f'http://127.0.0.1:{server.server_port}/'
            if os.name != 'nt':
                real_curl = shutil.which('curl')
                if not real_curl: raise SystemExit('curl is required by the integration test transport.')
                helper = transport / 'curl.py'
                helper.write_text(f'''import os, sys
args = sys.argv[1:]
out = []
i = 0
while i < len(args):
    if args[i] in ('--proto', '--proto-redir'): i += 2; continue
    value = args[i]
    if value.startswith('https://'):
        if not value.startswith({RELEASE_URL!r}): raise SystemExit('Unexpected download endpoint')
        value = {endpoint!r} + value[len({RELEASE_URL!r}):]
    out.append(value); i += 1
os.execv({real_curl!r}, [{real_curl!r}, *out])
''')
                (transport / 'curl').write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(helper))} "$@"\n')
                (transport / 'curl').chmod(0o755)
                (transport / 'git').write_text('#!/bin/sh\necho "Installer unexpectedly invoked Git" >&2\nexit 91\n')
                (transport / 'git').chmod(0o755)
                shells = ['bash']
                portable = os.environ.get('AIKYA_TEST_PWSH') or shutil.which('pwsh')
                if portable: shells.append(portable)
            else:
                (transport / 'git.cmd').write_text('@echo Installer unexpectedly invoked Git\r\n@exit /b 91\r\n')
                shells = ['pwsh', 'powershell.exe']
            for shell_index, shell in enumerate(shells):
                unix = shell == 'bash'
                os_asset = 'install-macos.sh' if sys.platform == 'darwin' else 'install-linux.sh'
                script = assets / (os_asset if unix else 'install-windows.ps1')
                wrapper = base / f'invoke-{shell_index}.ps1'
                if not unix:
                    quoted = lambda value: "'" + str(value).replace("'", "''") + "'"
                    wrapper.write_text('''param([string]$Installer, [string]$Scope, [string]$Version)
function Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing)
''' + f'''    if (-not $Uri.StartsWith({quoted(RELEASE_URL)})) {{ throw 'Unexpected download endpoint' }}
    Microsoft.PowerShell.Utility\\Invoke-WebRequest -UseBasicParsing -Uri ({quoted(endpoint)} + $Uri.Substring({len(RELEASE_URL)})) -OutFile $OutFile
''' + '''}
& $Installer -Mods aikya-flow,aikya-usage -Scope $Scope -Version $Version
if (-not $?) { exit 1 }; if ($LASTEXITCODE) { exit $LASTEXITCODE }
''', encoding='utf-8-sig')
                for scope in ('user', 'project', 'local'):
                    folder = base / f'{shell_index}-{scope}'
                    project = folder / 'project with spaces á'; project.mkdir(parents=True)
                    config = folder / 'config'
                    cache = folder / 'retained sources á'
                    env = dict(os.environ, PATH=str(transport) + os.pathsep + os.environ['PATH'],
                               CLAUDE_CONFIG_DIR=str(config), AIKYA_MODS_HOME=str(cache))
                    for tag in (version, version, next_version):
                        command = ['bash', str(script), 'aikya-flow', 'aikya-usage', '--scope', scope, '--version', tag] if unix else [shell, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper), '-Installer', str(script), '-Scope', scope, '-Version', tag]
                        run(command, project, env)
                        verify(config, project, env, scope, cache / 'releases' / tag / 'aikya-mods')
                    assert (cache / 'releases' / version / 'aikya-mods').is_dir(), 'Previous release must be retained'
                    server.corrupt = True
                    result = run(command, project, env, success=False)
                    assert 'Installation complete' not in result.stdout
                    verify(config, project, env, scope, cache / 'releases' / next_version / 'aikya-mods')
                    server.corrupt = False
                    assert not (cache / '.install-lock').exists()
                    print(f'PASS {Path(shell).name}/{scope}: HTTP release asset, real install, repeat, update, Unicode paths, persistent source, corruption recovery')
            assert requests, 'The release transport was not exercised'
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': main()
