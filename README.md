# Aikya Mods

Independent Claude Code mods, with an individual installer for each released mod and a shared installation menu. All mod interfaces and installer messages are in English.

| Mod | Status | Purpose |
| --- | --- | --- |
| [Aikya BoxBot](mods/aikya-boxbot/) | Available | Decorative boxes on a moving conveyor belt, with no on-screen controls |
| [Aikya Flow](mods/aikya-flow/) | Available | Command activity and evidence-backed workflow states |
| [Aikya Usage](mods/aikya-usage/) | Available | Context, observed tokens and account usage on one compact bottom line |

After restart, Flow opens a native pane automatically without requesting keyboard focus. BoxBot joins below Flow in the same pane when both are enabled. Usage appears on one compact line below the terminal prompt. Use a sufficiently wide fullscreen terminal for Claude Code on the left and the mods on the right; placement is controlled by Claude Code.

Flow works without a semantic bridge and marks phases **No evidence** until connected to an existing compatible Aikya execution cache. Usage counts observed requests since the mod loaded, not earlier transcript history. See each mod’s documentation for its data sources and limits.

## Requirements

- Linux/macOS with Bash 3.2+, or Windows with PowerShell 5.1+.
- Git on PATH for online installation; an existing checkout can be used with `--source` / `-Source`.
- Claude Code with mods support, available as `claude` on PATH. The mods are tested with Claude Code **2.1.308**.
- Access to this GitHub repository when cloning or installing directly from GitHub.

## Install with one command

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/jlema0590/aikya-mods/main/installers/install.sh | bash
```

Windows, from PowerShell:

```powershell
$p = Join-Path $env:TEMP 'aikya-mods-install.ps1'; curl.exe -fsSL https://raw.githubusercontent.com/jlema0590/aikya-mods/main/installers/install.ps1 -o $p; if ($LASTEXITCODE -ne 0) { throw 'Installer download failed' }; & $p
```

These commands install all three mods for the current Claude user configuration, without an interactive menu. They retain a checkout under `~/.local/share/aikya-mods/main` on Linux/macOS (or `$XDG_DATA_HOME`), and `%LOCALAPPDATA%\Aikya\Mods\main` on Windows. Keep that directory: it is the marketplace source. Set `AIKYA_MODS_HOME` to choose another persistent location.

Choose mods, inspect commands, or select a release tag:

```sh
curl -fsSL https://raw.githubusercontent.com/jlema0590/aikya-mods/main/installers/install.sh | bash -s -- aikya-flow aikya-usage --scope user
curl -fsSL https://raw.githubusercontent.com/jlema0590/aikya-mods/main/installers/install.sh | bash -s -- --version v1.2.3 --dry-run
```

`v1.2.3` is an example: use an existing release tag. After downloading the Windows script, the equivalents are `& $p -Mods aikya-flow,aikya-usage -Scope user` and `& $p -Version v1.2.3 -DryRun`.

The default source is `main`; use a version option to pin the installed code. Restart Claude Code after installation. See [distribution and releases](docs/distribution.md) for cache updates, release assets and offline installation. These URLs become available after the installer files are merged into `main`.

## Choose mods to install

### Use Claude Code from an IDE terminal

These mods run in Claude Code started from the integrated terminal of Cursor, Trae or an IntelliJ Platform IDE. Install them for the Claude user configuration once, then open a new terminal in your project and run `claude`:

```sh
bash /path/to/aikya-mods/install.sh --all --scope user
cd /path/to/your/project
claude
```

This shares the plugins across terminals using the same user, runtime and Claude configuration. SSH, containers, WSL and a different `CLAUDE_CONFIG_DIR` are separate environments. Flow and BoxBot appear inside Claude's terminal UI; Usage appears below its prompt. For a side panel, maximize the terminal area and use Claude's fullscreen renderer, for example `CLAUDE_CODE_NO_FLICKER=1 claude`.

See the [integrated-terminal protocol and per-IDE validation matrix](docs/terminal-compatibility.md). Per-IDE visual checks remain pending; the automated suites validate plugin behavior and installation separately.

### Install from this checkout

```sh
git clone https://github.com/jlema0590/aikya-mods.git
cd aikya-mods
bash install.sh
```

The menu currently offers:

```text
Aikya Mods

Available mods:
  1) aikya-boxbot
  2) aikya-flow
  3) aikya-usage
  a) Install all available mods
  q) Quit

Select mods (numbers separated by spaces):
```

Select a number, enter several numbers separated by spaces, choose `a` for all available mods, or `q` to quit. The full selection is checked before any configuration changes. The current release has three available mods.

The installers register this local checkout as the `aikya-mods` marketplace and invoke Claude Code's own plugin installer. Keep the checkout if you use this route; it remains the marketplace source. Restart Claude Code after installation.

## Install a specific mod

```sh
bash mods/aikya-boxbot/install.sh
bash mods/aikya-flow/install.sh
bash mods/aikya-usage/install.sh
```

Or use Claude Code's hosted marketplace route:

```sh
claude plugin install aikya-boxbot --marketplace jlema0590/aikya-mods
```

From a Claude Code session:

```text
/plugin install aikya-boxbot --marketplace jlema0590/aikya-mods
```

Both hosted routes require access to the repository. The local checkout scripts use the source already on disk; the online scripts above retrieve their own persistent checkout.

## Options and scope

```sh
bash install.sh --list
bash install.sh --all
bash install.sh aikya-boxbot --dry-run
bash install.sh aikya-flow aikya-usage --scope user
bash mods/aikya-boxbot/install.sh --scope local
```

`user` is the default and makes the plugin available across your projects. `project` records it in the current project's shared configuration; `local` records it only in that project's local configuration. For either project scope, run the script from your target project's directory:

```sh
cd /path/to/your/project
bash /path/to/aikya-mods/install.sh aikya-boxbot --scope project
```

`--dry-run` prints the exact commands and changes nothing. The install process stops on CLI errors. It does not roll back marketplace registration or earlier successful installations if a later installation fails; rerun after resolving the reported error.

## Use BoxBot

```text
/aikya-boxbot
```

Boxes move from left to right along a conveyor. The panel has no playback, motion, or close buttons. Optional commands remain available:

```text
/aikya-boxbot pause
/aikya-boxbot resume
/aikya-boxbot still
/aikya-boxbot motion
/aikya-boxbot hide
```

The animation is decorative and does not measure task progress, tool success, or token usage.

## Verify

```sh
python3 -m unittest discover -s tests -v
for script in install.sh mods/*/install.sh; do bash -n "$script"; done
claude plugin validate . --strict
for mod in mods/*; do
  claude plugin validate "$mod" --strict
  claude plugin test "$mod"
done
python3 tests/integration_install.py
python3 tests/integration_package.py
python3 scripts/build_release.py --version v0.0.0 --output dist
```

Installer tests execute the real Bash and PowerShell scripts against isolated Git/Claude boundaries. PowerShell tests run when `pwsh` is available; `AIKYA_TEST_PWSH` can select a portable runtime. Native mod tests use Claude Code's test kit. `integration_install.py` performs real installs in a disposable `CLAUDE_CONFIG_DIR`, verifies that user-scoped plugins stay enabled and available from other project directories, and leaves your normal Claude configuration untouched. `integration_package.py` repeats installation from the built ZIP. CI runs these checks on Linux, macOS and Windows using the Claude version in [.claude-version](.claude-version).

The [release workflow](.github/workflows/release.yml) runs on stable `vMAJOR.MINOR.PATCH` tags, or manually for an existing tag. It validates the tagged commit on all three operating systems, builds eight release assets, then uploads and verifies them in a draft before publishing. Bundle tags are independent of individual mod versions. See the [release procedure](docs/distribution.md#creating-a-release).

Official references: [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [mods](https://code.claude.com/docs/en/plugins/mods/reference).

Validation results and scope: [Flow and Usage validation](aikya/docs/research/2026-10-24-mods-validation.md).

Claude terminal startup and configuration-sharing results: [integrated-terminal validation](aikya/docs/research/2026-10-25-integrated-terminal-validation.md).

## License

MIT. See [LICENSE](LICENSE).

GENERATED BY AIKYA HARNESS
