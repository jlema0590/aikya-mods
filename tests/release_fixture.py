"""Independent release inputs for packaging and publishing tests."""
from pathlib import Path
import shutil


def release_fixture(root: Path, destination: Path) -> Path:
    shutil.copytree(root, destination, ignore=shutil.ignore_patterns('.git', '__pycache__', 'dist'))
    (destination / 'VERSION').write_text('1.2.3\n', encoding='utf-8')
    (destination / 'CHANGELOG.md').write_text(
        '# Changelog\n\n## [Unreleased]\n\n- Future work.\n\n'
        '## [1.2.3] - 2026-10-25\n\n### Added\n\n- Fixture release notes.\n\n'
        '## [1.2.2] - 2026-10-24\n\n- Previous release.\n', encoding='utf-8')
    return destination
