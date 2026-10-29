# Aikya Flow

A native Claude Code mod that follows command activity and displays evidence-backed Aikya workflow states. The interface is in English and has no on-screen controls.

## Install

From your terminal, install directly from the hosted marketplace:

```sh
claude plugin install aikya-flow --marketplace jlema0590/aikya-mods
```

This installs only `aikya-flow`. To install the other mods, run their matching commands in the [installation guide](../../README.md#install-a-specific-mod).

From the repository root:

```sh
bash mods/aikya-flow/install.sh
```

Or in Claude Code, from the public repository:

```text
/plugin install aikya-flow --marketplace jlema0590/aikya-mods
```

Restart Claude Code. Flow opens its native pane automatically in interactive sessions without requesting keyboard focus. In a sufficiently wide fullscreen terminal, Claude places the pane beside its transcript. A narrow or non-fullscreen terminal may place it above the prompt or defer opening it; use a wider fullscreen terminal for the agreed side-by-side layout.

With Flow 0.1.1 and BoxBot 0.3.1 or later enabled, Flow stays at the top of the docked pane and the conveyor stays at the bottom. The shared frame uses the measured pane body height and adjusts on resize, in either hook order. Inline panes remain compact; if content exceeds the available height, Claude scrolls the whole pane. Flow and Usage have no dependency on each other. Flow also runs without BoxBot.

## Commands

When started with `claude` in an IDE's integrated terminal, Flow uses Claude's terminal panel and events. See the [integrated-terminal validation matrix](../../docs/terminal-compatibility.md) for installation across projects, fullscreen requirements and per-IDE checks.

```text
/aikya-flow
/aikya-flow show
/aikya-flow hide
/aikya-flow status
/aikya-flow still
/aikya-flow motion
/aikya-flow connect auto
/aikya-flow connect /absolute/path/to/execution-cache
/aikya-flow disconnect
```

`status` prints details locally without calling a model. `hide` closes the shared Flow pane; `/aikya-boxbot hide` hides only the conveyor section.

## Phase diagram and motion

Flow 0.1.4 shows Explore, Plan, Implement, Validate, Security and Review as rounded cards with arrows. A card contains the phase name and its state. Panels with at least 32 usable columns and 45 usable rows use cards; smaller, unmeasured or inline panels use a compact diagram. The layout keeps the existing shared frame and bottom BoxBot section. Very small panes still use Claude's native scrolling.

State colors are gray for No evidence/Pending/Not applicable, cyan for Running, green for Completed, amber for Waiting/Blocked/Interrupted, and red for Failed. Native theme colors and visible state labels keep the diagram readable without color. The running symbol rotates every 250 ms. A confirmed completion/failure/block or handoff receives one 250 ms emphasis; first loads and duplicate reads do not replay confirmations. Cards stay fixed.

`still` disables visual movement while readings continue updating; `motion` resumes current movement without replaying past changes. Both commands are local and add no on-screen controls. Animation and the existing two-second periodic cache reads share one coordinated timer. Closing or hiding the pane stops its scheduled work.

The idle task placeholder and normal turn-ended activity banner are omitted. The header still shows current commands and relevant native activity, plus the evidence source. One applicable reason is shown compactly; `/aikya-flow status` includes every phase reason.

To update an existing installation after these changes are available, use `/plugin` → Marketplaces → aikya-mods → Update marketplace, or `claude plugin marketplace update aikya-mods` followed by `claude plugin update aikya-flow@aikya-mods` in your terminal. Restart after shell updates. See the [complete update guide](../../README.md#update-installed-mods).

## Activity and evidence

Commands and skills select a recipe. Bug fixes use Reproduce, Diagnose, Fix and Regression labels; read-only verification marks implementation as not applicable to that recipe. Native events show command activity, tools, permission waits and interruption. Tool results, prompts and permissions pass through unchanged. Prompt text, command arguments and tool outputs are not retained by the mod.

A finished tool or model turn never completes a semantic phase. Without an Aikya snapshot, applicable phases show **No evidence**. Flow does not calculate a percentage of work completed from phase counts.

With Harness 7.2.1 or newer, Flow 0.1.4 exports an invocation context before a command runs. Child processes inherit the real session, origin and invocation ID. The harness publishes an atomic `flow-<invocation-id>.json` index beside the origin session records; it references separate validated snapshots for each execution, including worktrees. The pane selects active work first, then the last failed/blocked/interrupted result, otherwise the last completed result. Local status lists every execution with focus and preview/approved/observed mode. No phase evidence is combined across executions.

The default cache is `<CLAUDE_CONFIG_DIR>/aikya-execution`, or `~/.claude/aikya-execution` when no configuration directory is set; an existing `AIKYA_EXECUTION_CACHE` wins. Missing or mismatched records produce explicit bridge diagnostics. Follow-up turns retain the invocation; another explicit Aikya command gets a new ID. Stopping the native turn does not certify the semantic execution. Timers still stop when the pane/session closes.

Harness 7.2.0 was published without the producer from the earlier bridge branch. Updating only Flow cannot repair that runtime. Flow 0.1.4 reports `Harness bridge unavailable · update Harness to 7.2.1+ and restart Claude Code` when a current, matching but uncorrelated snapshot is present. It does not adopt that snapshot as phase evidence. Missing records still report `Waiting for execution`; stale or different-command records never trigger the compatibility warning.

Update both components and restart Claude Code before launching the command. Update project runtimes as well if they take precedence over the global registration. The automatic bridge covers child processes of that Claude process; independent shells need explicit correlation. `/aikya-flow disconnect` stops tracking and clears the exported context; `connect auto` restores automatic mode for a new invocation. The mod writes only the two named environment variables, not project files, permissions, prompts or shell commands. The producer writes only private execution metadata.

For older compatible runtimes, connect an existing Aikya execution cache manually. This is the cache root used by the compatible harness's `AIKYA_EXECUTION_CACHE` setting, not a project directory. The expected structure is:

```text
<cache-root>/<sha256(canonical-project-root + NUL + session-id)>/
  active.json       # {"run_id":"..."}
  <run-id>.json     # schema=1 execution snapshot
```

The adapter reads the contract in Aikya's `src/aikya/core/state.py`. It validates project/session identity, the active execution, command, revision, and candidate generation. Completed validation, security and review phases require successful evidence and actors bound to the current candidate. Missing, invalid, superseded or mismatched records show no verified phase evidence. A snapshot does not authorize any action.

The compatible harness must already produce the cache. This mod does not instrument older harness versions or write execution state. A cache is refreshed after relevant native events and at most every two seconds while the pane is visible. Closing the pane cancels polling. The manual connection remains in memory only and is rebound after a session change; restart Claude Code to discard it.

## Verify

```sh
claude plugin validate mods/aikya-flow --strict
claude plugin test mods/aikya-flow
```

Native tests validate event forwarding, startup behavior, platform element trees, cache identity, candidate evidence, timers and session isolation. They do not replace inspection of a particular terminal's final layout.

GENERATED BY AIKYA HARNESS
