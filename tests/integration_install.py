"""Install the real local marketplace in a disposable Claude configuration."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="aikya-mods-install-", dir="/private/tmp" if Path('/private/tmp').is_dir() else None) as temporary:
    env = dict(os.environ, CLAUDE_CONFIG_DIR=str(Path(temporary) / "config"))
    subprocess.run(["bash", str(root / "install.sh"), "--all"], cwd=temporary,
                   env=env, stdin=subprocess.DEVNULL, check=True)
    result = subprocess.run(["claude", "plugin", "list", "--json"], cwd=temporary,
                            env=env, text=True, capture_output=True, check=True)
    plugins = json.loads(result.stdout)
    if isinstance(plugins, dict):
        plugins = plugins.get("installed", plugins.get("plugins", []))
    matching = [plugin for plugin in plugins if plugin.get("id") == "aikya-boxbot@aikya-mods"]
    if not matching:
        raise SystemExit("BoxBot was not found in the isolated installed-plugin list.")
    print("PASS: real BoxBot installation found in a disposable Claude configuration.")
