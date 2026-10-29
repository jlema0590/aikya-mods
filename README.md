# Aikya Mods

Independent Claude Code mods, with an individual installer for each released mod and a shared installation menu. All mod interfaces and installer messages are in English.

Bundle version: **0.0.16**. [VERSION](VERSION) is the release source of truth; [CHANGELOG.md](CHANGELOG.md) records the changes for each bundle version. Mod versions are independent.

| Mod | Version | Purpose |
| --- | --- | --- |
| [Aikya BoxBot](mods/aikya-boxbot/) | 0.3.2 | Decorative boxes on a moving conveyor belt at the bottom of the mod pane |
| [Aikya Flow](mods/aikya-flow/) | 0.1.4 | Evidence-backed phase diagrams with state colors and animation |
| [Aikya Usage](mods/aikya-usage/) | 0.1.1 | Context, observed tokens and separate 5h/7d usage bars on one bottom line |

After restart, Flow opens a native pane automatically without requesting keyboard focus. BoxBot stays at the bottom of the docked pane, with Flow above it when both are enabled. Usage appears on one compact line below the terminal prompt. Use a sufficiently wide fullscreen terminal for Claude Code on the left and the mods on the right; placement is controlled by Claude Code.

Flow 0.1.4 connects automatically when Harness 7.2.1 or newer runs in the same Claude process. It follows snapshots from the current invocation, including worktrees and background CLI processes. With older runtimes or unavailable evidence, applicable phases remain **No evidence**. Usage counts observed requests since the mod loaded, not earlier transcript history. See each mod’s documentation for its data sources and limits.

## Terminal layout

Illustrative compact layout with all three mods enabled; values and phase states are examples. Claude Code occupies the left side, Flow the right side, BoxBot the bottom of that pane, and Usage one footer line below the prompt.

```text
Claude Code                            | AIKYA FLOW
                                       | Explore   ✓ Completed
Working on your request...             |           ↓
                                       | Plan      ✓ Completed
                                       |           ↓
                                       | Implement ◐ Running
                                       |           ↓
                                       | Validate  ○ Pending
                                       |           ↓
                                       | Security  ○ Pending
                                       |           ↓
                                       | Review    ○ Pending
                                       |
                                       | AIKYA BOXBOT
                                       | Conveyor running
                                       | +---+           +---+
                                       | |:::|           |:::|
                                       | +---+           +---+
                                       | ====>====>====>====>====>
                                       |  o   o   o   o   o   o
                                       | IN                   OUT
>                                      |
Context: 42% | Tokens: 53k | Usage 5h [====------] 40% | 7d [========--] 80%
```

Taller docked panes show rounded phase cards connected by arrows. Smaller panes use the compact diagram above; very small panes use Claude's native scrolling. The mods have no on-screen controls. The terminal theme supplies the actual colors.

## Requirements

- Claude Code with mods support, available as `claude` on PATH. Tested with **2.1.308**.
- Windows: PowerShell 5.1 or 7. No Bash required.
- macOS: Bash 3.2+, curl, tar, gzip, shasum and diff.
- Linux: Bash 3.2+, curl or wget, tar, gzip, sha256sum, awk and diff.
- HTTPS access to GitHub Releases. No Git, Python, Node.js or administrator permissions are needed by the mod installers.

## Install without cloning

The following installers are available starting with **v0.0.11**. If you are reading this branch before that release is published, its new download URLs are not available yet. The published v0.0.10 installers keep their original behavior.

Copy the command for your operating system into its terminal. It downloads a temporary installer, opens the selection menu, and removes the temporary script afterward. The verified mod files remain in your user data directory.

### macOS

```sh
( aikya_setup=$(mktemp) && trap 'rm -f "$aikya_setup"' EXIT && curl -fsSL https://github.com/jlema0590/aikya-mods/releases/latest/download/install-macos.sh -o "$aikya_setup" && bash "$aikya_setup" )
```

### Linux

```sh
( aikya_setup=$(mktemp) && trap 'rm -f "$aikya_setup"' EXIT && curl -fsSL https://github.com/jlema0590/aikya-mods/releases/latest/download/install-linux.sh -o "$aikya_setup" && bash "$aikya_setup" )
```

If curl is unavailable, download `install-linux.sh` from the release page with your browser or wget, then run `bash install-linux.sh`.

### Windows

Run this in PowerShell:

```powershell
& { $aikyaSetup = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.ps1'); try { Invoke-WebRequest -UseBasicParsing -ErrorAction Stop -Uri 'https://github.com/jlema0590/aikya-mods/releases/latest/download/install-windows.ps1' -OutFile $aikyaSetup; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aikyaSetup; if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Review the error above.' } } finally { if (Test-Path -LiteralPath $aikyaSetup) { Remove-Item -LiteralPath $aikyaSetup -Force } } }
```

The execution-policy option applies only to that process; it does not change your saved PowerShell policy. If your organization blocks script execution, use its approved installation method.

### Choose your mods

```text
Aikya Mods Installer

1. Flow + Usage (recommended)
2. All mods
3. Choose mods
Q. Cancel

Choose an option [1]:
```

Press Enter for Flow + Usage, choose all mods, or select Flow, Usage and BoxBot independently. Installation uses Claude's `user` scope by default. Restart Claude Code after installation.

For unattended or version-pinned installation, download your OS installer from the release page and run it with explicit options:

```sh
# Linux; use install-macos.sh on macOS.
bash install-linux.sh aikya-flow aikya-usage --scope user
bash install-linux.sh aikya-flow --version v0.0.11
bash install-linux.sh aikya-usage --dry-run
bash install-linux.sh --all
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Mods aikya-flow,aikya-usage -Scope user
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Mods aikya-flow -Version v0.0.11
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Mods aikya-usage -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -All
```

With redirected input and no selection, all three mods install without a menu. `--dry-run` / `-DryRun` makes no network requests or changes. `--list` / `-List` shows the available mods.

The default source is the latest stable release, resolved once per installation. Keep its persistent directory: Claude loads the marketplace from it. Set `AIKYA_MODS_HOME` to choose another data directory.

| OS | Default retained source |
| --- | --- |
| macOS | `~/Library/Application Support/Aikya/Mods/releases/vX.Y.Z/aikya-mods` |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/aikya-mods/releases/vX.Y.Z/aikya-mods` |
| Windows | `%LOCALAPPDATA%\Aikya\Mods\releases\vX.Y.Z\aikya-mods` |

See [distribution and releases](docs/distribution.md) for updates, checksums, local/offline installation and recovery after a partial installation.

## Choose mods to install

### Use Claude Code from an IDE terminal

These mods run in Claude Code started from the integrated terminal of Cursor, Trae or an IntelliJ Platform IDE. Install them for the Claude user configuration once, then open a new terminal in your project and run `claude`:

```sh
# Install once using the OS command above, then:
cd /path/to/your/project
claude
```

This shares the plugins across terminals using the same user, runtime and Claude configuration. SSH, containers, WSL and a different `CLAUDE_CONFIG_DIR` are separate environments. Flow and BoxBot appear inside Claude's terminal UI; Usage appears below its prompt. For a side panel, maximize the terminal area and use Claude's fullscreen renderer, for example `CLAUDE_CODE_NO_FLICKER=1 claude`.

In Windows PowerShell, after installation, start fullscreen with:

```powershell
$env:CLAUDE_CODE_NO_FLICKER = '1'
claude
```

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

Run the command for each mod you want in your terminal. These commands work from any directory where `claude` is available:

```sh
claude plugin install aikya-boxbot --marketplace jlema0590/aikya-mods
claude plugin install aikya-flow --marketplace jlema0590/aikya-mods
claude plugin install aikya-usage --marketplace jlema0590/aikya-mods
```

Each command installs only the named mod. If BoxBot is already installed, run the Flow and Usage commands to add them alongside it. You can also install Flow or Usage independently. The usage mod's package and command name is **aikya-usage**.

From an existing Claude Code session, use the equivalent plugin commands:

```text
/plugin install aikya-boxbot --marketplace jlema0590/aikya-mods
/plugin install aikya-flow --marketplace jlema0590/aikya-mods
/plugin install aikya-usage --marketplace jlema0590/aikya-mods
```

Restart Claude Code after installation. Then use these local commands inside the session:

| Installed mod | Session command | Result |
| --- | --- | --- |
| Aikya BoxBot | `/aikya-boxbot` | Opens the conveyor animation |
| Aikya Flow | `/aikya-flow` | Shows command activity and workflow states |
| Aikya Usage | `/aikya-usage` | Reports context, observed tokens and account usage |

Flow opens its pane and Usage enables its compact footer automatically after restart. Installing a plugin and invoking its `/aikya-*` session command are separate steps. Check installed mods from your terminal with:

```sh
claude plugin list
```

Claude Code manages the hosted marketplace source, using Git internally to retrieve this repository. For Git-free installation, use the OS release installers above.

If you already have the complete source on disk, the individual local installers remain available:

```sh
bash mods/aikya-boxbot/install.sh
bash mods/aikya-flow/install.sh
bash mods/aikya-usage/install.sh
```

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

## Update installed mods

These changes must reach the branch used by your marketplace before a normal update can download them. The prepared versions are Flow 0.1.4, BoxBot 0.3.2 and Usage 0.1.1 (bundle 0.0.16).

Inside Claude Code, run `/plugin`, open **Marketplaces**, choose **aikya-mods**, then **Update marketplace**. This updates the listing and the installed plugins from this repository. Alternatively open each mod on the **Installed** tab and select **Update now**. Apply the offered plugin reload, or exit and start Claude Code again.

From a regular terminal on Windows, macOS or Linux:

```sh
claude plugin marketplace update aikya-mods
claude plugin update aikya-flow@aikya-mods
claude plugin update aikya-boxbot@aikya-mods
claude plugin update aikya-usage@aikya-mods
claude plugin list
```

Update only the mods you have installed. Restart Claude Code after shell updates and check the listed versions. If installed in more than one scope, use the relevant `--scope user`, `--scope project` or `--scope local` on each plugin update. Marketplace refresh alone is not a substitute for those explicit plugin updates from the shell.

## Use Flow

Flow shows six phases as rounded cards connected by arrows when the panel is tall enough. In a smaller panel it uses a compact diagram. Completed phases are green, active phases cyan, waits and interruptions amber, failures red, and unknown/pending/not-applicable phases gray. The running symbol changes every 250 ms; confirmed transitions receive one brief emphasis. Native activity does not count as phase evidence.

| Phase state | Color | Meaning |
| --- | --- | --- |
| No evidence | Gray | No valid phase evidence is available |
| Pending | Gray | The execution snapshot reports the phase as pending |
| Running | Cyan | The phase is active; its indicator animates |
| Waiting | Amber | The phase is waiting |
| Completed | Green | The phase has confirmed completion evidence |
| Failed | Red | The phase reports a failure |
| Not applicable | Gray | The phase does not apply to this recipe |
| Blocked | Amber | A blocker prevents the phase from proceeding |
| Interrupted | Amber | The phase was interrupted |

The default sequence is **Explore → Plan → Implement → Validate → Security → Review**. Bug-fix commands use **Reproduce → Diagnose → Fix → Regression → Security → Review**. Read-only recipes mark implementation as **Not applicable**.

```text
/aikya-flow status
/aikya-flow still
/aikya-flow motion
```

Still mode freezes only visual effects; phase readings keep updating. Flow adds no buttons, keeps BoxBot below the diagram, omits the placeholder task label, and hides the normal turn-ended activity line.

With Flow 0.1.4 and Harness 7.2.1+, restart Claude Code after updating both, then run `/aikya-mobile-feature` or `/aikya-analyze` normally. No manual cache path is needed. Each execution has its own focus/mode label; `/aikya-flow status` lists the executions. The pane shows active work first, then an unsuccessful result if present, otherwise the last completed execution. It does not combine their phase evidence.

Harness **7.2.0 does not contain the automatic bridge**, even with the newest Flow mod. Once Harness 7.2.1 is published, update the effective runtime (global or project):

```sh
aikya-manage update --version 7.2.1 --scope global --mods none
# Use this instead for an existing project registration:
aikya-manage update --version 7.2.1 --scope project --target /absolute/path/to/project --mods none
```

A project runtime can override the global runtime. Update Flow in its installed scope and restart Claude Code. `/aikya-flow status` should then report `Bridge: Connected` after a command is observed. A pending Bash permission remains a permission wait; it does not complete any phase.

Use `/aikya-flow status` to inspect `Harness bridge unavailable` (a current uncorrelated runtime; update Harness), `Waiting for execution`, `Session mismatch`, or unreadable/mismatched execution diagnostics. `/aikya-flow connect auto` re-enables automatic tracking; run a new Aikya command afterward. Independently launched shells need an explicit compatible session/context; Flow does not discover arbitrary external processes.

For older compatible snapshots, connect their cache root manually:

```text
/aikya-flow connect /absolute/path/to/execution-cache
```

A finished Claude turn or tool call does not complete a phase. See the [Flow evidence contract](mods/aikya-flow/README.md#activity-and-evidence) for compatible cache records and validation rules.

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

BoxBot stays at the bottom of its docked pane. With Flow enabled, the phase diagram stays above the conveyor. The position follows the available pane height when the terminal is resized. Narrow inline panes keep their natural height; content taller than the pane uses Claude's native scrolling.

The pane omits the decorative-animation disclaimer. The animation remains decorative and does not measure task progress, tool success, or token usage. Follow [Update installed mods](#update-installed-mods) to update BoxBot and Flow together if both are installed.

## Use Usage

Usage 0.1.1 keeps Context, Tokens and both account windows on one bottom line. Example values:

```text
Context: 42% | Tokens: 53k | Usage 5h [====------] 40% | 7d [========--] 80%
```

Each consumed segment (`=`) and its percentage use the theme's success color below 70%, warning color from 70% to below 90%, and error color at 90% or higher. Remaining cells (`-`) are dim. These are visual thresholds, not new account limits. Missing or expired readings show question-mark cells and N/A.

The footer shortens its bars and labels as space decreases, then uses a numeric fallback when bars cannot fit. It adds no rows or side panels. Use `/aikya-usage` for the full local report. Terminals without colors retain the same readable text.

Follow [Update installed mods](#update-installed-mods) to get the usage bars when this version is available from your marketplace.

## Verify

With a matching Harness 7.2.1+ source checkout, run the real producer/consumer contract:

```sh
python3 tests/integration_flow_bridge.py /path/to/aikya-harness
```

This checks an observed parent dispatch, simultaneous previews in a shared worktree, and architecture/security previews and approved runs in separate worktrees, invocation isolation, early hook starts and selection of actual child results.

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
python3 tests/integration_platforms.py
python3 tests/integration_online_release.py
python3 scripts/build_release.py --check
python3 scripts/build_release.py --version v0.0.16 --output dist
```

Installer tests execute the real Bash and PowerShell scripts against isolated HTTP/Claude boundaries. PowerShell tests run when `pwsh` is available; `AIKYA_TEST_PWSH` can select a portable runtime. Native mod tests use Claude Code's test kit. `integration_install.py` performs real installs in a disposable `CLAUDE_CONFIG_DIR`, verifies that user-scoped plugins stay enabled and available from other project directories, and leaves your normal Claude configuration untouched. `integration_package.py` repeats installation from the built ZIP. CI runs these checks on Linux, macOS and Windows using the Claude version in [.claude-version](.claude-version).

The [release workflow](.github/workflows/release.yml) rehearses the full validation and packaging path on pushes to `feature/installers-no-clone` and `develop`, without publishing. Stable `vMAJOR.MINOR.PATCH` tag pushes publish after all checks pass; manual runs default to dry-run for an existing tag. The tag must match VERSION and a dated changelog entry. The workflow validates the exact commit on all three operating systems, builds thirteen assets, verifies their artifact round trip, then uses those same files for draft publication. Release notes come from the changelog. See the [release procedure](docs/distribution.md#creating-a-release).

Official references: [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [mods](https://code.claude.com/docs/en/plugins/mods/reference).

Validation results and scope: [Flow and Usage validation](aikya/docs/research/2026-10-24-mods-validation.md).

Latest bridge validation: [automatic execution tracking](docs/validation/2026-10-28-flow-execution-bridge.md).

Latest feature validation: [Flow diagram, colors and motion](docs/validation/2026-10-26-flow-phase-diagram.md), [Usage progress bars](docs/validation/2026-10-26-usage-progress-bars.md), and [BoxBot bottom placement](docs/validation/2026-10-26-boxbot-bottom.md).

Claude terminal startup and configuration-sharing results: [integrated-terminal validation](aikya/docs/research/2026-10-25-integrated-terminal-validation.md).

## License

MIT. See [LICENSE](LICENSE).

GENERATED BY AIKYA HARNESS
