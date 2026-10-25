# Claude Code in integrated IDE terminals

BoxBot, Flow and Usage run inside the **Claude Code CLI**. When you start `claude` in an IDE's integrated terminal, the mods use Claude's `terminal` surface. Their data comes from Claude Code, including in Cursor and Trae; their native AI agents are separate products.

## Install once for the current Claude user configuration

Run from any local terminal, using the path to this checkout:

```sh
bash /path/to/aikya-mods/install.sh --all --scope user
```

Then open a **new integrated terminal**, enter your project and start Claude Code:

```sh
cd /path/to/your/project
claude
```

The same installed plugins are available in other IDE terminals that use the same user, machine/runtime and Claude configuration. Keep this checkout: the local marketplace loads its mods from it. Changes load after restarting Claude; existing sessions retain their loaded code.

For project-only installation, run the installer from the target project and choose `--scope project` or `--scope local`. Opening an unrelated project does not carry that project's configuration with it.

SSH hosts, containers and WSL have separate runtimes. A different OS user or `CLAUDE_CONFIG_DIR` selects a different configuration. Install and validate in the environment where `claude` actually runs.

## Layout and local checks

- Flow opens its panel at interactive startup without requesting keyboard focus. BoxBot joins below Flow when both are enabled. Without Flow, open BoxBot with `/aikya-boxbot`.
- Usage renders below the Claude prompt. `/aikya-usage` prints its details without opening another panel.
- Maximize the IDE terminal area and give Claude enough columns. A side panel requires Claude's fullscreen renderer; a narrow terminal may use an inline panel instead. Maximizing the IDE window and enabling Claude fullscreen are separate actions.
- For a fullscreen session without changing a saved renderer preference, start `CLAUDE_CODE_NO_FLICKER=1 claude`. `/tui fullscreen` switches and saves Claude's preference; use it deliberately.
- `No evidence` is expected without a matching Aikya execution cache. `N/A` means Claude has not supplied a reading. Neither means the plugin failed to load.

Run these commands in the IDE terminal if a different terminal works:

```sh
command -v claude
claude --version
claude plugin list --json
```

Check the three IDs `aikya-boxbot@aikya-mods`, `aikya-flow@aikya-mods`, and `aikya-usage@aikya-mods` and that they are enabled. Compare the runtime/user/configuration with the terminal where installation succeeded. A test using `--plugin-dir` proves session loading, not permanent installation.

Avoid changing the IDE's renderer, shell or keyboard settings until a concrete problem is reproduced. Claude's `/terminal-setup` can modify host settings and is not required just to load these mods. Ctrl+J inserts a newline when the terminal does not support Shift+Enter.

## Acceptance protocol

For each product, record its version, OS, terminal engine, Claude version and configuration scope. Use a dedicated terminal session and a disposable Claude configuration for installation tests; authenticate through the normal flow if needed. Never copy credentials into test reports.

1. Install all three mods with user scope, verify the installed IDs, then start Claude from a second project directory using that same configuration.
2. Confirm Flow opens without moving keyboard focus from Claude's prompt, BoxBot appears below Flow and Usage appears below the prompt.
3. Run `/aikya-flow status` and `/aikya-usage`. Check that responses are local, phase evidence is honest and missing metrics remain unavailable.
4. Run `/aikya-boxbot still`, `motion`, `pause` and `resume`. Observe the drawing and confirm there are no playback buttons in the scene.
5. Resize the terminal and compare wide fullscreen with narrow/inline layout. Confirm the drawing fits and the prompt remains usable.
6. Hide and reopen the Flow panel; hide only BoxBot; hide/show Usage independently. Close and start a new Claude session.
7. Repeat each mod independently. Report individual/concurrent loading separately from visual layout.

Do not submit a model prompt just to manufacture token readings. Check real metrics during a separately authorized task; absent readings at startup are valid.

## Validation matrix

`Pending` means the integrated terminal has not passed the visual protocol. Native unit tests and generic PTY tests are recorded separately and never substitute for this matrix.

| IDE | Product version | Terminal engine | Claude version | Visual result |
| --- | --- | --- | --- | --- |
| Cursor | Not available on this machine | Not inspected | Not run | Pending |
| Trae | 3.6.4 (CLI help); base 1.107.1 (`--version`) | Not verified | 2.1.308 available | Pending: UI automation did not complete |
| IntelliJ IDEA | Not available on this machine | Not inspected | Not run | Pending |
| PyCharm | Not available on this machine | Not inspected | Not run | Pending |
| WebStorm | Not available on this machine | Not inspected | Not run | Pending |
| GoLand | Not available on this machine | Not inspected | Not run | Pending |
| PhpStorm | Not available on this machine | Not inspected | Not run | Pending |
| CLion | Not available on this machine | Not inspected | Not run | Pending |
| Rider | Not available on this machine | Not inspected | Not run | Pending |
| RubyMine | Not available on this machine | Not inspected | Not run | Pending |
| DataGrip | Not available on this machine | Not inspected | Not run | Pending |
| Android Studio (additional IntelliJ Platform check) | Installed; not inspected | Not inspected | Not run | Pending |

Official references: [Claude terminal configuration](https://code.claude.com/docs/en/terminal-config), [mods surfaces and render sites](https://code.claude.com/docs/en/plugins/mods/reference), [IntelliJ IDEA terminal](https://www.jetbrains.com/help/idea/terminal-emulator.html).

GENERATED BY AIKYA HARNESS
