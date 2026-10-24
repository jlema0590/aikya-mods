#!/usr/bin/env bash
# Install only released mods through Claude Code's marketplace commands.
set -e -o pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
available=(aikya-boxbot)
selected=()
requested=()
scope=user
dry_run=false
install_all=false
list_only=false

usage() {
  cat <<'HELP'
Aikya Mods installer
Usage: bash install.sh [OPTIONS] [MOD ...]

With no MOD, choose mods from the interactive menu.

Options:
  --list                       List available mods without installing
  --all                        Install every available mod
  --scope user|project|local    Installation scope (default: user)
  --dry-run                    Show commands without changing configuration
  --help                       Show this help

Example: bash install.sh aikya-boxbot --scope project
HELP
}

fail() { printf 'Error: %s\n' "$1" >&2; exit 2; }

add_mod() {
  local candidate="$1" allowed=false existing
  for existing in "${available[@]}"; do
    if [[ "$candidate" == "$existing" ]]; then allowed=true; break; fi
  done
  if [[ "$allowed" != true ]]; then fail "Mod '$candidate' is not available. Run --list to see released mods."; fi
  for existing in "${selected[@]}"; do
    if [[ "$candidate" == "$existing" ]]; then return; fi
  done
  selected+=("$candidate")
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --list) list_only=true; shift ;;
    --all) install_all=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --scope)
      [[ $# -ge 2 ]] || fail '--scope requires user, project, or local.'
      scope="$2"; shift 2 ;;
    --*) fail "Unknown option: $1" ;;
    *) requested+=("$1"); shift ;;
  esac
done
case "$scope" in user|project|local) ;; *) fail "Invalid scope '$scope'. Use user, project, or local." ;; esac
if [[ "$install_all" == true && ${#requested[@]} -gt 0 ]]; then fail 'Choose --all or explicit mod names, not both.'; fi

if [[ "$list_only" == true ]]; then
  printf 'Available mods:\n'
  printf '  %s\n' "${available[@]}"
  exit 0
fi

if [[ "$install_all" == true ]]; then
  selected=("${available[@]}")
elif [[ ${#requested[@]} -gt 0 ]]; then
  for mod in "${requested[@]}"; do add_mod "$mod"; done
else
  printf 'Aikya Mods\n\nAvailable mods:\n'
  for ((index=0; index<${#available[@]}; index++)); do
    printf '  %d) %s\n' "$((index+1))" "${available[index]}"
  done
  printf '  a) Install all available mods\n  q) Quit\n\nSelect mods (numbers separated by spaces): '
  if ! read -r answer; then fail 'No selection received. Nothing was installed.'; fi
  case "$answer" in
    q|Q) printf 'Cancelled. Nothing was installed.\n'; exit 0 ;;
    a|A) selected=("${available[@]}") ;;
    *)
      read -r -a choices <<< "$answer"
      [[ ${#choices[@]} -gt 0 ]] || fail 'Select at least one mod.'
      for choice in "${choices[@]}"; do
        [[ "$choice" =~ ^[0-9]+$ && ${#choice} -le 6 ]] || fail "Invalid selection: $choice"
        number=$((10#$choice))
        [[ "$number" -ge 1 && "$number" -le ${#available[@]} ]] || fail "Invalid selection: $choice"
        add_mod "${available[number-1]}"
      done ;;
  esac
fi

[[ ${#selected[@]} -gt 0 ]] || fail 'No released mods are available.'
if [[ "$dry_run" != true ]] && ! command -v claude >/dev/null 2>&1; then
  printf 'Error: Claude Code was not found. Install Claude Code with mods support and ensure claude is on PATH.\n' >&2
  exit 127
fi

run() {
  if [[ "$dry_run" == true ]]; then printf ' %q' "$@"; printf '\n'; else "$@"; fi
}

run claude plugin marketplace add "$repo_root" --scope "$scope"
for mod in "${selected[@]}"; do
  run claude plugin install "$mod@aikya-mods" --scope "$scope"
done
if [[ "$dry_run" == true ]]; then
  printf 'Dry run complete. Nothing was installed.\n'
else
  printf 'Installation complete. Restart Claude Code to load the selected mods.\n'
fi
