# Validation, releases and online installation

## Distribution requirements

- The public repository is `jlema0590/aikya-mods`; the default branch is `main`.
- Installers must work from a URL without an existing checkout: Bash 3.2+ on Linux/macOS, PowerShell 5.1+ on Windows. Git and Claude Code must already be on PATH.
- Online installation defaults to all three released mods and user scope. Selection, duplicate removal, user/project/local scope, listing, help and dry-run are supported. Invalid selections must fail before downloads or configuration changes.
- Keep the checkout in a persistent user directory. Default source is `main`; an explicit `vMAJOR.MINOR.PATCH` installs a release tag. Preserve the caller's working directory for project/local scope. Never reset or overwrite local changes to a cached checkout.
- An existing checkout can be supplied explicitly for source installation. That route skips the installer's download and Git operations.
- Pull requests and branch pushes validate installers, package construction, Claude manifests and native mod tests. Windows validates the PowerShell path.
- Releases use stable `vMAJOR.MINOR.PATCH` tags; individual mod versions remain independent and must match the marketplace catalog. Run the same checks on the exact tagged commit before publishing.
- Release files include a complete source ZIP, an individual ZIP for each mod, both online installers, release metadata and SHA256 sums. Do not include credentials, generated types, Git internals or temporary output.
- Build the full release in a temporary draft, upload every asset, then publish. Never overwrite an already published release. Failed draft uploads may be retried.
- No workflow or real release is published by editing these files locally. They take effect after the changes are pushed to GitHub.

## Online installers

Linux and macOS share [installers/install.sh](../installers/install.sh). Windows uses [installers/install.ps1](../installers/install.ps1). The README contains the public curl commands. Claude Code and Git must already be installed; these scripts install the mods, without changing shell profiles or installing Claude itself.

Bash options:

```sh
bash installers/install.sh --list
bash installers/install.sh aikya-flow aikya-usage --scope project
bash installers/install.sh --all --version v1.2.3 --dry-run
bash installers/install.sh --source /path/to/checkout --all
```

PowerShell options:

```powershell
& .\installers\install.ps1 -List
& .\installers\install.ps1 -Mods aikya-flow,aikya-usage -Scope project
& .\installers\install.ps1 -All -Version v1.2.3 -DryRun
& .\installers\install.ps1 -Source C:\path\to\checkout -All
```

Run project/local installation from the target project's directory. The installer keeps that working directory while registering the marketplace. Without explicit names, all released mods are selected. Selection and scope are checked before network or configuration changes; `--dry-run` / `-DryRun` does not create a cache or call Git/Claude.

The persistent cache contains one checkout per ref: `main` or the requested stable version tag. Re-running fetches that ref and checks it out without a forced reset. Unexpected origins and tracked/staged local changes stop the update. Existing untracked files are left to Git's normal checkout collision checks. Keep the checkout while installed; Claude loads the local marketplace from it. To use another version, rerun with the version option: Claude updates the marketplace source. A failure does not roll back earlier successful CLI operations.

An interrupted clone may leave an incomplete cache entry. Inspect and move that specific entry aside before retrying; the installer never deletes an existing directory to recover automatically.

## Release files

For a tag such as `v1.2.3`, the workflow produces eight assets:

- `aikya-mods-v1.2.3.zip`: complete installable checkout under `aikya-mods/`.
- One ZIP per mod, named with that mod's own version, such as `aikya-flow-0.1.0.zip`.
- `install.sh` and `install.ps1`: standalone online installers.
- `release.json`: bundle version, tested Claude version and mod versions.
- `SHA256SUMS`: SHA256 for the other seven files.

After the first release is published, its installers are also downloadable through `https://github.com/jlema0590/aikya-mods/releases/latest/download/install.sh` and the corresponding `install.ps1` URL. Downloading an installer from a release pins the installer file; the installed code still defaults to `main` unless a version option is supplied.

To install the complete ZIP without cloning, extract it and retain that folder. On Linux/macOS run `bash /path/to/aikya-mods/install.sh --all`. On Windows run `& C:\path\to\aikya-mods\installers\install.ps1 -Source C:\path\to\aikya-mods -All`. Individual ZIPs can be loaded for one session with `claude --plugin-dir /path/to/aikya-flow-0.1.0.zip`; their `install.sh` wrappers target the complete marketplace checkout.

Verify downloads before extracting:

```sh
sha256sum -c SHA256SUMS
# macOS:
shasum -a 256 -c SHA256SUMS
```

Windows can inspect each file with `Get-FileHash -Algorithm SHA256` and compare it with `SHA256SUMS`.

## Creating a release

1. Merge the validated changes into `main` and choose a new stable bundle version. Individual mod versions only change when that mod changes; each version must match its marketplace entry.
2. Create and push the tag on the intended commit, for example:

   ```sh
   git tag -a v1.2.3 -m "Aikya Mods v1.2.3"
   git push origin v1.2.3
   ```

3. The Release workflow resolves the tag to a commit and calls the reusable Validation workflow for that exact SHA. Validation runs on Linux, macOS and Windows with Claude Code pinned in `.claude-version`. It runs unit tests, strict manifest checks, native mod tests, real installation, and installation from the release ZIP.
4. After successful validation, the publish job checks that the tag still points to the same commit. It builds the assets and creates a draft release. Every uploaded asset must match the local inventory, byte size and GitHub SHA256 digest before the draft is published.
5. A failed upload or verification leaves a draft. Re-run the workflow manually with the same tag to resume a draft targeting that commit. Published releases and drafts for another commit are left unchanged. Publishing an older bundle does not replace a newer release as `latest`.

Only the publish job requests `contents: write`. Tests use temporary Claude configurations and do not need model credentials. The tag examples are illustrative; no release is created by the local test suite.

Local verification:

```sh
python3 -m unittest discover -s tests -v
python3 tests/integration_install.py
python3 tests/integration_package.py
python3 scripts/build_release.py --version v0.0.0 --output dist
```

The build output must be empty. The publisher's tests simulate GitHub at the CLI boundary; the build and installation tests use real files and real Claude installs. A GitHub-hosted workflow run is only validated once these files have been pushed and Actions has executed them.

Local results recorded on 2026-10-25: **48 Python tests and 39 native mod tests passed** on macOS. The PowerShell installer tests ran with portable PowerShell 7.5.12; workflows passed actionlint 1.7.12, and strict Claude validation and Bash syntax checks passed. Real isolated installs succeeded through the streamed online Bash script, the PowerShell source installer and the generated complete ZIP. No GitHub release was published during these checks. Actual Linux/Windows runner results remain pending the first Actions run.

References: [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [GitHub release assets](https://docs.github.com/en/rest/releases/assets), [Claude mod testing](https://code.claude.com/docs/en/plugins/mods/test).

GENERATED BY AIKYA HARNESS
