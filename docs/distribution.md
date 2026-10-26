# Distribution and releases

## Install without cloning

Starting with bundle **0.0.11**, the release provides one standalone installer per OS:

| OS | Release asset | Package | Installer runtime |
| --- | --- | --- | --- |
| Windows | `install-windows.ps1` | ZIP | PowerShell 5.1 or 7 |
| macOS | `install-macos.sh` | TAR.GZ | Bash 3.2+ |
| Linux | `install-linux.sh` | TAR.GZ | Bash 3.2+ |

Use the separate one-command instructions in the [README](../README.md#install-without-cloning). The new URLs become usable when v0.0.11 is published; v0.0.10's files remain unchanged. Git, Python and Node.js are not needed by these installers. Claude Code must already be available as `claude` on PATH. The scripts do not install Claude or change shell profiles, and need no administrator permissions.

macOS uses curl, tar, gzip, awk, shasum and diff. Linux uses curl or wget, tar, gzip, awk, sha256sum and diff. Windows uses PowerShell/.NET download, hashing and ZIP APIs, without Bash. Missing tools are reported before downloading the package; dependencies are not installed automatically.

## Selection and scope

In an interactive terminal, press Enter for **Flow + Usage (recommended)**, select all mods, choose individual mods, or cancel. Invalid menu input is requested again. Explicit mod names or the all option skip the menu. With redirected input and no selection, all available mods install without prompting.

After downloading your OS installer:

```sh
# Replace install-linux.sh with install-macos.sh on macOS.
bash install-linux.sh aikya-flow aikya-usage --scope user
bash install-linux.sh aikya-flow --version v0.0.11
bash install-linux.sh --all --dry-run
bash install-linux.sh --list
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Mods aikya-flow,aikya-usage -Scope user
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Mods aikya-flow -Version v0.0.11
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -All -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -List
```

`user` is the default. For `project` or `local`, run from the target project's directory. The installer preserves that working directory. Invalid selections fail before downloads or configuration changes. Listing, help and dry-run do not access the network, create directories or invoke Claude. Dry-run shows `latest stable` without resolving it.

Restart Claude Code after installation. A user-scoped install is shared by IDE terminals using the same user, runtime and Claude configuration; WSL, SSH, containers and other `CLAUDE_CONFIG_DIR` values are separate environments. See [terminal compatibility](terminal-compatibility.md).

## Releases and persistent files

The default source is the latest published stable release, never `main`, a draft or a prerelease. The installer reads `installer-manifest.txt` from latest once, validates its stable tag, and retrieves the manifest, checksums and package from that exact tag. Pinned versions require v0.0.11 or later. Earlier releases can still be installed from an extracted complete bundle through the local source option.

The manifest contains four strict `key=value` lines: `installer_schema`, `version`, `unix_archive`, `windows_archive`. Unknown keys, duplicates and unexpected filenames are rejected. It is parsed as data, never sourced or evaluated. The manifest and archive hashes must match SHA256SUMS. The installer rejects unsafe archive paths, links, special files and duplicate entries before extraction, checks VERSION, then uses Claude's strict validation before configuration changes.

| OS | Retained marketplace source |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Aikya\Mods\releases\vX.Y.Z\aikya-mods` |
| macOS | `~/Library/Application Support/Aikya/Mods/releases/vX.Y.Z/aikya-mods` |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/aikya-mods/releases/vX.Y.Z/aikya-mods` |

`AIKYA_MODS_HOME` replaces the data root. Keep the retained source: Claude loads its marketplace from that directory. Downloads and extraction use a staging directory inside the data root; the verified bundle is moved into its version directory before registering it. Existing older Git checkouts are neither converted nor deleted.

Reinstalling a version compares the extracted files with the retained copy. Identical files are reused; local changes and foreign directories stop installation instead of being overwritten. Installing a newer version retains the previous directory and registers the new source with Claude. The scripts do not remove old releases automatically.

A `.install-lock` blocks simultaneous installations using the same data root. Normal failures release the lock and remove staging files. If a process is forcibly terminated, inspect its lock and staging directory before removing them; never remove another running installer's lock.

Download or integrity failure does not change Claude configuration. A later Claude CLI failure can leave earlier operations in place. The installer returns failure, keeps verified sources that may already be referenced, and does not claim completion. Resolve the reported problem and rerun. Re-registering an older retained source is possible through `--source` / `-Source`; this does not promise a complete rollback of plugin configuration.

## Existing source and offline installation

The source option skips release resolution and downloads. Retain the complete extracted bundle:

```sh
bash /path/to/aikya-mods/installers/install.sh --source /path/to/aikya-mods aikya-flow aikya-usage
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\path\to\aikya-mods\installers\install.ps1 -Source C:\path\to\aikya-mods -Mods aikya-flow,aikya-usage
```

The root `install.sh` and the per-mod local wrappers are unchanged. The online release assets `install.sh` and `install.ps1` remain compatible aliases of the new engines. An individual mod ZIP can be loaded for one session through Claude's plugin-dir option; its local shell wrapper expects the complete marketplace bundle.

## Release assets

For three released mods, a tag such as `v0.0.11` produces thirteen assets:

- `aikya-mods-v0.0.11.zip` and `aikya-mods-v0.0.11.tar.gz`: identical installable files under `aikya-mods/`.
- One ZIP for each mod, named with its independent mod version.
- `install-linux.sh`, `install-macos.sh`, `install-windows.ps1` and compatible `install.sh` / `install.ps1` aliases.
- `installer-manifest.txt`: installer schema, tag and archive names.
- `release.json`: tag, tested Claude version, mod versions, changelog notes and installer contract.
- `SHA256SUMS`: SHA-256 for every other asset.

Unix platform scripts are generated from one Bash engine, with a platform guard; the Windows asset comes from the PowerShell engine. Archives are reproducible and exclude Git internals, credentials and generated temporary files. The publisher validates the exact allowed inventory, metadata and hashes before contacting GitHub.

## Creating a release

1. Update VERSION and the README bundle version; add exactly one non-empty dated `## [MAJOR.MINOR.PATCH] - YYYY-MM-DD` entry to CHANGELOG.md in English. Keep unfinished changes under Unreleased. Mod versions change only when their own code changes and must match the marketplace catalog.
2. Push `feature/installers-no-clone` or `develop` for a release rehearsal. Branch runs validate and package without publishing. Review the Linux/macOS/Windows matrix, including PowerShell 5.1 and 7 on Windows and the final generated installers.
3. On the intended reviewed commit, create and push the matching tag. The next prepared bundle tag is `v0.0.12`; do not move `v0.0.10` or replace its assets.
4. The tag workflow checks VERSION/changelog and validates the exact tag commit. It builds all assets, uploads/downloads them as an Actions artifact and verifies the artifact round trip before publication.
5. Only the publish job requests `contents: write`. It checks that the tag still points at the validated commit, creates or resumes a draft, uploads every asset and verifies the inventory, sizes and GitHub SHA-256 digests before publishing. Drafts are retrieved by numeric release ID, since a tag lookup may not return a draft.
6. A failed publication leaves a draft. Dispatch the workflow for the same tag with `dry_run=false` to resume; manual runs default to `dry_run=true`. Published releases and drafts for another commit are preserved. Older releases do not replace newer stable releases as latest.

Publication uses helper scripts from the immutable workflow revision while the packaged source and tag checks remain pinned to the validated tag commit. The helper suite is tested before publication. This allows a corrected workflow to resume a draft without moving an existing tag.

## Validation

```sh
python3 -m unittest discover -s tests -v
python3 tests/integration_install.py
python3 tests/integration_package.py
python3 tests/integration_platforms.py
python3 tests/integration_online_release.py
python3 scripts/build_release.py --check --version v0.0.12
python3 scripts/build_release.py --output dist
python3 scripts/publish_release.py --repo jlema0590/aikya-mods --tag v0.0.12 --sha "$(git rev-parse HEAD)" --assets dist --dry-run
```

The output directory must be empty. Tests use isolated Claude configurations, never the user's settings, and need no model credentials. The online integration serves fixture releases over loopback HTTP through test-only transport adapters; production installers retain fixed HTTPS endpoints. It executes the generated OS assets with real Claude, checks first/repeated installation, version changes, corruption recovery, every scope and paths with spaces/Unicode. Git invocations during installation fail the test. Test infrastructure can use Python and Node; the installer itself does not require them.

A CI runner validates its native OS, not every Linux distribution or graphical IDE. Tag creation and publication are separate from branch validation. Updating VERSION and these files does not publish a release.

References: [GitHub release assets](https://docs.github.com/en/rest/releases/assets), [Claude marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).

GENERATED BY AIKYA HARNESS
