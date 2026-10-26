#!/usr/bin/env bash
# Standalone URL installer for Linux/macOS. Default to all mods: stdin may be a pipe.
set -e -o pipefail

repository='https://github.com/jlema0590/aikya-mods.git'
available=(aikya-boxbot aikya-flow aikya-usage)
selected=()
requested=()
scope=user
ref=main
source_dir=''
version_set=false
all=false
dry_run=false
list=false

fail() { printf 'Error: %s\n' "$1" >&2; exit 2; }
usage() {
  cat <<'HELP'
Aikya Mods online installer (Linux/macOS)
Usage: bash install.sh [MOD ...] [OPTIONS]
With no MOD, install all available mods without prompting.
  --all                       Install all mods (default)
  --scope user|project|local   Claude configuration scope (default: user)
  --version vMAJOR.MINOR.PATCH Install a release tag (default: main)
  --source PATH               Install from an existing checkout; do not download
  --dry-run                   Print commands without running or writing anything
  --list                      List mods without installing
  --help                      Show this help
AIKYA_MODS_HOME sets the persistent checkout directory.
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) all=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --list) list=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --scope|--version|--source)
      [[ $# -ge 2 && -n "$2" ]] || fail "$1 requires a value."
      case "$1" in
        --scope) scope="$2" ;;
        --version) ref="$2"; version_set=true ;;
        --source) source_dir="$2" ;;
      esac
      shift 2 ;;
    --*) fail "Unknown option: $1" ;;
    *) requested+=("$1"); shift ;;
  esac
done
case "$scope" in user|project|local) ;; *) fail "Invalid scope: $scope" ;; esac
if [[ "$version_set" == true ]]; then
  [[ "$ref" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Use a release version such as v1.2.3.'
  [[ -z "$source_dir" ]] || fail 'Choose --version or --source, not both.'
fi
[[ "$all" != true || ${#requested[@]} -eq 0 ]] || fail 'Choose --all or explicit mod names, not both.'
for mod in "${requested[@]}"; do
  allowed=false
  for candidate in "${available[@]}"; do [[ "$mod" != "$candidate" ]] || allowed=true; done
  [[ "$allowed" == true ]] || fail "Mod '$mod' is not available."
  duplicate=false
  for candidate in "${selected[@]}"; do [[ "$mod" != "$candidate" ]] || duplicate=true; done
  [[ "$duplicate" == true ]] || selected+=("$mod")
done
if [[ ${#selected[@]} -eq 0 ]]; then selected=("${available[@]}"); fi
if [[ "$list" == true ]]; then printf 'Available mods:\n'; printf '  %s\n' "${available[@]}"; exit 0; fi

run() {
  if [[ "$dry_run" == true ]]; then printf ' %q' "$@"; printf '\n'; else "$@"; fi
}

if [[ "$dry_run" != true ]]; then
  command -v claude >/dev/null 2>&1 || fail 'Claude Code was not found. Install it and ensure claude is on PATH.'
fi
if [[ -z "$source_dir" ]]; then
  cache_root="${AIKYA_MODS_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/aikya-mods}"
  source_dir="$cache_root/$ref"
  if [[ "$dry_run" != true ]]; then
    command -v git >/dev/null 2>&1 || fail 'Git was not found. Install Git and retry.'
    mkdir -p "$cache_root"
  fi
  if [[ -e "$source_dir" ]]; then
    if [[ "$dry_run" != true ]]; then
      [[ -d "$source_dir/.git" ]] || fail "The cache is not a Git checkout: $source_dir"
      origin="$(git -C "$source_dir" remote get-url origin)"
      [[ "$origin" == "$repository" ]] || fail 'The cached checkout has an unexpected Git origin.'
      git -C "$source_dir" diff --quiet || fail 'The cached checkout has local changes. Preserve them before updating.'
      git -C "$source_dir" diff --cached --quiet || fail 'The cached checkout has staged changes. Preserve them before updating.'
    fi
    run git -C "$source_dir" fetch --depth 1 origin "$ref"
    run git -C "$source_dir" checkout --detach FETCH_HEAD
  else
    run git clone --depth 1 --branch "$ref" "$repository" "$source_dir"
  fi
fi
if [[ "$dry_run" != true ]]; then
  [[ -f "$source_dir/install.sh" && -f "$source_dir/.claude-plugin/marketplace.json" ]] || fail "Not an Aikya Mods checkout: $source_dir"
  source_dir="$(cd "$source_dir" && pwd -P)"
fi
run bash "$source_dir/install.sh" "${selected[@]}" --scope "$scope"
if [[ "$dry_run" == true ]]; then
  printf 'Selected plugins:'; printf ' %s@aikya-mods' "${selected[@]}"; printf '\nDry run complete. Nothing was installed.\n'
else
  printf 'Marketplace source retained at %s\n' "$source_dir"
fi
