"""Build and install the complete release ZIP in a disposable configuration."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import zipfile


root = Path(__file__).resolve().parents[1]
version = 'v' + (root / 'VERSION').read_text(encoding='utf-8').strip()
with tempfile.TemporaryDirectory(prefix='aikya-package-', dir='/private/tmp' if Path('/private/tmp').is_dir() else None) as temporary:
    folder = Path(temporary)
    subprocess.run([sys.executable, str(root / 'scripts/build_release.py'), '--version', version,
                    '--output', str(folder / 'assets')], check=True)
    with zipfile.ZipFile(folder / f'assets/aikya-mods-{version}.zip') as archive:
        archive.extractall(folder / 'extracted')
    subprocess.run([sys.executable, str(root / 'tests/integration_install.py'), '--root',
                    str(folder / 'extracted/aikya-mods')], check=True)
