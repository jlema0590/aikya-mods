"""Check real installs in every scope with platform shells and non-ASCII paths."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CLI = shutil.which('claude')
if not CLI:
    raise SystemExit('Claude Code is required for real installation checks.')
MODS = {'aikya-flow@aikya-mods', 'aikya-usage@aikya-mods'}


def run(command, cwd, env):
    result = subprocess.run(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            capture_output=True, encoding='utf-8', errors='replace', timeout=90)
    if result.returncode:
        raise AssertionError(f'{command[0]} exited {result.returncode}: {result.stdout}\n{result.stderr}')
    return result.stdout


with tempfile.TemporaryDirectory(prefix='aikya audit ') as temporary:
    base = Path(temporary)
    source = base / 'source with spaces \u00e1'
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns('.git', '__pycache__', 'dist'))
    shells = ['bash'] if os.name != 'nt' else ['pwsh', 'powershell.exe']
    for shell in shells:
        for scope in ('user', 'project', 'local'):
            label = shell + '-' + scope
            project = base / label / 'project with spaces \u00e1'
            project.mkdir(parents=True)
            config = base / label / 'config'
            env = dict(os.environ, CLAUDE_CONFIG_DIR=str(config))
            if shell == 'bash':
                command = ['bash', str(source / 'installers/install.sh'), 'aikya-flow', 'aikya-usage',
                           '--source', str(source), '--scope', scope]
            else:
                command = [shell, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
                           str(source / 'installers/install.ps1'), '-Mods', 'aikya-flow,aikya-usage',
                           '-Source', str(source), '-Scope', scope]
            run(command, project, env)
            run(command, project, env)
            listed = json.loads(run([CLI, 'plugin', 'list', '--json'], project, env))
            if isinstance(listed, dict):
                listed = listed.get('installed', listed.get('plugins', []))
            assert {p['id'] for p in listed} == MODS, listed
            filename = config / 'settings.json' if scope == 'user' else project / '.claude' / ('settings.json' if scope == 'project' else 'settings.local.json')
            settings = json.loads(filename.read_text(encoding='utf-8-sig'))
            assert all(settings.get('enabledPlugins', {}).get(name) is True for name in MODS), settings
            if scope != 'user':
                user_settings = json.loads((config / 'settings.json').read_text()) if (config / 'settings.json').exists() else {}
                assert not user_settings.get('enabledPlugins'), user_settings
            print(f'PASS {label}: selected mods, real install, repeated install, correct settings scope, spaces and Unicode')
