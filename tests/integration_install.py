"""Install every released mod with a real CLI in disposable configurations."""
import json
import argparse
import os
from pathlib import Path
import subprocess
import shutil
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()
root = args.root.resolve()
cli = shutil.which('claude')
if not cli:
    raise SystemExit('Claude Code is required for real installation checks.')
mods = ('aikya-boxbot', 'aikya-flow', 'aikya-usage')
with tempfile.TemporaryDirectory(prefix='aikya-mods-install-', dir='/private/tmp' if Path('/private/tmp').is_dir() else None) as temporary:
    for selection in ('all', *mods):
        env = dict(os.environ, CLAUDE_CONFIG_DIR=str(Path(temporary) / selection))
        if os.name == 'nt':
            command = ['pwsh', '-NoProfile', '-NonInteractive', '-File', str(root / 'installers' / 'install.ps1'), '-Source', str(root)]
            command += ['-All'] if selection == 'all' else ['-Mods', selection]
        else:
            command = ['bash', str(root / 'install.sh'), '--all'] if selection == 'all' else ['bash', str(root / 'mods' / selection / 'install.sh')]
        subprocess.run(command, cwd=temporary, env=env, stdin=subprocess.DEVNULL, check=True)
        if selection == 'all':
            subprocess.run(command, cwd=temporary, env=env, stdin=subprocess.DEVNULL, check=True)
        result = subprocess.run([cli, 'plugin', 'list', '--json'], cwd=temporary, env=env, text=True, capture_output=True, check=True)
        plugins = json.loads(result.stdout)
        if isinstance(plugins, dict):
            plugins = plugins.get('installed', plugins.get('plugins', []))
        installed = {plugin.get('id') for plugin in plugins}
        expected = {mod + '@aikya-mods' for mod in mods} if selection == 'all' else {selection + '@aikya-mods'}
        if installed != expected:
            raise SystemExit(f'Unexpected installed plugins for {selection}: {installed}')
        print(f'PASS: real installation verified for {selection} in a disposable Claude configuration.')
        if selection == 'all':
            # A user-scoped install must survive changing the terminal's cwd.
            # This checks configuration sharing, not a particular IDE renderer.
            settings = json.loads((Path(env['CLAUDE_CONFIG_DIR']) / 'settings.json').read_text())
            if any(settings.get('enabledPlugins', {}).get(plugin_id) is not True for plugin_id in expected):
                raise SystemExit('The user configuration did not enable every installed mod.')
            for project in ('another-project', 'project with spaces'):
                workdir = Path(temporary) / project
                workdir.mkdir()
                listed = subprocess.run([cli, 'plugin', 'list', '--json'], cwd=workdir,
                                        env=env, text=True, capture_output=True, check=True)
                entries = json.loads(listed.stdout)
                if isinstance(entries, dict):
                    entries = entries.get('installed', entries.get('plugins', []))
                if {plugin.get('id') for plugin in entries} != expected:
                    raise SystemExit(f'User-scoped plugins were not shared with {project}.')
                print(f'PASS: user-scoped mods remain available from {project}.')
