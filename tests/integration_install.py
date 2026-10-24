"""Install every released mod with a real CLI in disposable configurations."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
mods = ('aikya-boxbot', 'aikya-flow', 'aikya-usage')
with tempfile.TemporaryDirectory(prefix='aikya-mods-install-', dir='/private/tmp' if Path('/private/tmp').is_dir() else None) as temporary:
    for selection in ('all', *mods):
        env = dict(os.environ, CLAUDE_CONFIG_DIR=str(Path(temporary) / selection))
        command = ['bash', str(root / 'install.sh'), '--all'] if selection == 'all' else ['bash', str(root / 'mods' / selection / 'install.sh')]
        subprocess.run(command, cwd=temporary, env=env, stdin=subprocess.DEVNULL, check=True)
        if selection == 'all':
            subprocess.run(command, cwd=temporary, env=env, stdin=subprocess.DEVNULL, check=True)
        result = subprocess.run(['claude', 'plugin', 'list', '--json'], cwd=temporary, env=env, text=True, capture_output=True, check=True)
        plugins = json.loads(result.stdout)
        if isinstance(plugins, dict):
            plugins = plugins.get('installed', plugins.get('plugins', []))
        installed = {plugin.get('id') for plugin in plugins}
        expected = {mod + '@aikya-mods' for mod in mods} if selection == 'all' else {selection + '@aikya-mods'}
        if installed != expected:
            raise SystemExit(f'Unexpected installed plugins for {selection}: {installed}')
        print(f'PASS: real installation verified for {selection} in a disposable Claude configuration.')
