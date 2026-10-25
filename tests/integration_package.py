"""Build and install the complete release ZIP in a disposable configuration."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import zipfile


root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='aikya-package-', dir='/private/tmp' if Path('/private/tmp').is_dir() else None) as temporary:
    folder = Path(temporary)
    subprocess.run([sys.executable, str(root / 'scripts/build_release.py'), '--version', 'v0.0.0',
                    '--output', str(folder / 'assets')], check=True)
    with zipfile.ZipFile(folder / 'assets/aikya-mods-v0.0.0.zip') as archive:
        archive.extractall(folder / 'extracted')
    subprocess.run([sys.executable, str(root / 'tests/integration_install.py'), '--root',
                    str(folder / 'extracted/aikya-mods')], check=True)
