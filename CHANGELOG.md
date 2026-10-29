# Changelog

All notable changes to the Aikya Mods bundle are recorded here.
Bundle versions follow Semantic Versioning and are independent of each mod's version.

## [Unreleased]

## [0.0.16] - 2026-10-29

### Fixed

- Explain a current uncorrelated Harness runtime instead of silently waiting forever for the missing Flow bridge; never substitute its phase evidence.
- Correct the automatic bridge requirement to the forthcoming Harness 7.2.1: the bridge branch was not included in the published 7.2.0 runtime.

### Added

- Mobile skill and Bash permission-wait regression coverage, registered runtime producer/consumer checks, and update guidance for global/project scope precedence.

### Included mods

- Aikya BoxBot 0.3.2, Aikya Flow 0.1.4 and Aikya Usage 0.1.1.

## [0.0.15] - 2026-10-28

### Fixed

- Connect Flow automatically to compatible Harness execution metadata, including child processes and worktrees, using the real Claude session and an explicit invocation ID.
- Accept a correlated execution whose hook started before the mod, without allowing foreign invocations or older candidate revisions.
- Keep background phase evidence across approval/follow-up turns; separate parallel and sequential execution snapshots instead of mixing their evidence.

### Added

- Per-execution focus/mode labels and summaries in local status, plus explicit bridge diagnostics and `connect auto` recovery.
- Producer/consumer regression coverage for the matching Harness 7.1.1 bridge. Older Harness versions retain manual cache connection.

### Included mods

- Aikya BoxBot 0.3.2, Aikya Flow 0.1.3 and Aikya Usage 0.1.1.

## [0.0.14] - 2026-10-26

### Added

- Rounded Flow phase cards with centered connectors and a compact layout for smaller panels.
- State colors, a four-frame running indicator and 250 ms emphasis for confirmed phase changes and handoffs.
- Local Flow still/motion commands; one coordinated timer preserves existing two-second evidence polling.

### Changed

- Keep all six phase states and command-specific recipes, with detailed reasons available through the local status command.
- Remove the idle Claude task placeholder and the normal turn-ended activity banner from Flow.
- Remove BoxBot's decorative-animation disclaimer from the pane while keeping the conveyor at the bottom.
- Document updating installed mods from Claude Code's plugin manager and terminal commands.

### Included mods

- Aikya BoxBot 0.3.2, Aikya Flow 0.1.2 and Aikya Usage 0.1.1.

## [0.0.13] - 2026-10-26

### Added

- Separate ASCII usage bars for the five-hour and seven-day account windows, with each percentage after its bar on the existing single-line footer.
- Independent theme-aware colors for consumed segments and percentages: success below 70%, warning from 70% to below 90%, and error at 90% or higher.

### Changed

- Shorten bars and labels as available space decreases, retaining a numeric fallback for extremely narrow terminals.
- Distinguish unavailable readings with question-mark bars and N/A; keep actual zero readings, decimal percentages and over-limit values explicit.
- Share plain-text and colored formatting without changing native metric sources or token accounting.

### Included mods

- Aikya BoxBot 0.3.1, Aikya Flow 0.1.1 and Aikya Usage 0.1.1.

## [0.0.12] - 2026-10-26

### Fixed

- Anchor BoxBot at the bottom of its docked pane, using the measured pane body height on every render and terminal resize.
- Keep Flow above a shared bottom BoxBot section in either hook order, without nesting full-height panes. Inline panes retain their compact layout.

### Included mods

- Aikya BoxBot 0.3.1, Aikya Flow 0.1.1 and Aikya Usage 0.1.0.

### Documentation

- Show direct hosted marketplace installation commands for BoxBot, Flow and Usage, with the equivalent in-session plugin commands and separate mod commands.
- Clarify that each install command selects one mod and that Flow and Usage can be added alongside an existing BoxBot installation.

## [0.0.11] - 2026-10-26

### Added

- Dedicated Linux, macOS and Windows release installers, with no repository clone or Git dependency.
- An English terminal menu with Flow + Usage recommended, all mods, or individual selection.
- Reproducible TAR.GZ bundles, OS-specific installer assets and a versioned installer manifest with SHA-256 verification.
- Release-download tests for integrity failures, unsafe archive entries, persistent sources, installation locks and repeated installation.

### Changed

- Online installation now downloads the latest stable release by default; explicit release versions start at v0.0.11.
- Retain extracted marketplace sources in per-version user directories; preserve older Git checkouts and refuse to overwrite local changes.
- Document separate installation commands for Windows, macOS and Linux, including unattended selection and pinned versions.

### Fixed

- Repeated Windows installation compares provider-relative paths, including temporary directories with short 8.3 aliases and equivalent path spellings.
- Read release manifests with splitting compatible with Windows PowerShell 5.1 and PowerShell 7.
- Verify and resume draft releases by numeric release ID when GitHub's tag endpoint does not return a draft.
- Use release tooling from the workflow's immutable revision while preserving the validated tag and source assets.

### Included mods

- Aikya BoxBot 0.3.0, Aikya Flow 0.1.0 and Aikya Usage 0.1.0 (unchanged).

## [0.0.10] - 2026-10-25

### Added

- Independent BoxBot, Flow and Usage mods with a shared installation menu and individual installers.
- Online Bash and PowerShell installers with mod selection, persistent source checkouts and user/project/local scopes.
- Deterministic release archives, per-mod ZIPs, release metadata and SHA256 checksums.
- Linux, macOS and Windows validation, including real installations from source and the complete release ZIP.
- Real installation checks for PowerShell 5.1 and 7, project scopes and paths with spaces and accented characters.
- A bundle VERSION file, version-specific release notes and a release rehearsal that verifies assets without publishing.

### Fixed

- Flow's cache test fixtures now recognize Windows-normalized paths while preserving the connection and session-lifecycle assertions.
- Integrated-terminal instructions include PowerShell equivalents for fullscreen startup and command discovery.

### Included mods

- Aikya BoxBot 0.3.0: boxes moving along a conveyor, without playback controls.
- Aikya Flow 0.1.0: native command activity and evidence-backed workflow states.
- Aikya Usage 0.1.0: context, observed tokens and account usage in one compact footer.

GENERATED BY AIKYA HARNESS
