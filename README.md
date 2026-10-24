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

- macOS or Linux with Bash 3.2 or later and Git.
- Claude Code with mods support, available as `claude` on PATH. The mods are tested with Claude Code **2.1.308**.
- Access to this GitHub repository when cloning or installing directly from GitHub.

## Choose mods to install

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

Both hosted routes require access to the repository. The scripts do not fetch or execute remote shell installers.

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
```

Installer tests exercise real shell scripts against an isolated CLI boundary. Native mod tests use Claude Code's test kit. `integration_install.py` performs a real install and list check in a disposable `CLAUDE_CONFIG_DIR`; it leaves your normal Claude configuration untouched. The repository workflow runs installer tests on macOS and Linux; native checks are run locally with the tested Claude Code version.

Official references: [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [mods](https://code.claude.com/docs/en/plugins/mods/reference).

Validation results and scope: [Flow and Usage validation](aikya/docs/research/2026-10-24-mods-validation.md).

## License

MIT. See [LICENSE](LICENSE).

GENERATED BY AIKYA HARNESS
