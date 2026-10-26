#!/usr/bin/env bash
# Standalone release installer. Bash 3.2; no Git, Node.js or Python required.
set -e -o pipefail

release_url='https://github.com/jlema0590/aikya-mods/releases'
expected_os="${AIKYA_INSTALL_OS:-auto}"
available=(aikya-boxbot aikya-flow aikya-usage)
selected=()
requested=()
scope=user
version=''
source_dir=''
all=false
dry_run=false
list=false
stage=''
lock=''

fail() { printf 'Error: %s\n' "$1" >&2; exit 2; }
usage() {
  cat <<'HELP'
Aikya Mods release installer (Linux/macOS)
Usage: bash install.sh [MOD ...] [OPTIONS]
With no selection: show a menu in a terminal; install all mods without a terminal.
  --all                       Install all mods without prompting
  --scope user|project|local   Claude configuration scope (default: user)
  --version vMAJOR.MINOR.PATCH Install a release (default: latest stable; v0.0.11+)
  --source PATH               Use an existing extracted bundle; do not download
  --dry-run                   Show the plan without network access or writes
  --list                      List available mods without installing
  --help                      Show this help
AIKYA_MODS_HOME sets the persistent data directory.
HELP
}
validate_version() {
  [[ "$1" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Use a stable release version such as v0.0.11.'
  local major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"
  [[ ${#major} -le 9 && ${#minor} -le 9 && ${#patch} -le 9 ]] || fail 'Release version is too large.'
  if [[ "$major" == 0 && "$minor" == 0 ]] && ((10#$patch < 11)); then
    fail 'Release installers require v0.0.11 or later. Older releases can be installed from their extracted bundle.'
  fi
}
add_mod() {
  local candidate="$1" entry allowed=false
  for entry in "${available[@]}"; do [[ "$entry" != "$candidate" ]] || allowed=true; done
  [[ "$allowed" == true ]] || fail "Mod '$candidate' is not available."
  for entry in "${selected[@]}"; do [[ "$entry" != "$candidate" ]] || return 0; done
  selected+=("$candidate")
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) all=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    --list) list=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --scope|--version|--source)
      [[ $# -ge 2 && -n "$2" ]] || fail "$1 requires a value."
      case "$1" in --scope) scope="$2" ;; --version) version="$2" ;; --source) source_dir="$2" ;; esac
      shift 2 ;;
    --*) fail "Unknown option: $1" ;;
    *) requested+=("$1"); shift ;;
  esac
done
case "$scope" in user|project|local) ;; *) fail "Invalid scope: $scope" ;; esac
if [[ -n "$version" ]]; then
  validate_version "$version"
  [[ -z "$source_dir" ]] || fail 'Choose --version or --source, not both.'
fi
[[ "$all" != true || ${#requested[@]} -eq 0 ]] || fail 'Choose --all or explicit mod names, not both.'
for mod in "${requested[@]}"; do add_mod "$mod"; done
if [[ "$list" == true ]]; then printf 'Available mods:\n'; printf '  %s\n' "${available[@]}"; exit 0; fi

if [[ ${#selected[@]} -eq 0 && "$all" != true && "$dry_run" != true && -t 0 ]]; then
  while [[ ${#selected[@]} -eq 0 ]]; do
    printf '\nAikya Mods Installer\n\n1. Flow + Usage (recommended)\n2. All mods\n3. Choose mods\nQ. Cancel\n\nChoose an option [1]: '
    read -r answer || fail 'No selection received. Nothing was installed.'
    case "$answer" in
      ''|1) selected=(aikya-flow aikya-usage) ;;
      2) selected=("${available[@]}") ;;
      q|Q) printf 'Cancelled. Nothing was installed.\n'; exit 0 ;;
      3)
        printf '1. Flow\n2. Usage\n3. BoxBot\nChoose numbers separated by spaces (or Q to cancel): '
        read -r answer || fail 'No selection received. Nothing was installed.'
        case "$answer" in q|Q) printf 'Cancelled. Nothing was installed.\n'; exit 0 ;; esac
        read -r -a choices <<< "$answer"
        valid=true
        [[ ${#choices[@]} -gt 0 ]] || valid=false
        for choice in "${choices[@]}"; do case "$choice" in 1|2|3) ;; *) valid=false ;; esac; done
        if [[ "$valid" == true ]]; then
          for choice in "${choices[@]}"; do case "$choice" in 1) add_mod aikya-flow ;; 2) add_mod aikya-usage ;; 3) add_mod aikya-boxbot ;; esac; done
        else printf 'Invalid selection. Choose 1, 2 or 3.\n'; fi ;;
      *) printf 'Invalid selection. Choose 1, 2, 3 or Q.\n' ;;
    esac
  done
fi
[[ ${#selected[@]} -gt 0 ]] || selected=("${available[@]}")
if [[ "$dry_run" == true ]]; then
  printf 'Release: %s\nScope: %s\n' "${version:-latest stable}" "$scope"
  [[ -z "$source_dir" ]] || printf 'Marketplace source: %s\n' "$source_dir"
  printf 'Selected plugins:'; printf ' %s@aikya-mods' "${selected[@]}"
  printf '\nDry run complete. Nothing was installed.\n'; exit 0
fi
command -v claude >/dev/null 2>&1 || fail 'Claude Code was not found. Install it and ensure claude is on PATH.'

cleanup() {
  [[ -z "$stage" ]] || rm -rf -- "$stage"
  [[ -z "$lock" ]] || rmdir -- "$lock" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  if [[ "$downloader" == curl ]]; then
    curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 180 "$1" -o "$2" || fail "Download failed: $1"
  else
    wget --https-only --timeout=30 --tries=2 -q "$1" -O "$2" || fail "Download failed: $1"
  fi
}
read_manifest() {
  local key value seen='|' count=0
  manifest_tag=''
  unix_archive=''
  windows_archive=''
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    [[ "$seen" != *"|$key|"* ]] || fail 'Duplicate installer manifest entry.'
    seen="$seen$key|"; count=$((count+1))
    case "$key" in
      installer_schema) [[ "$value" == 1 ]] || fail 'Unsupported installer manifest schema.' ;;
      version) validate_version "$value"; manifest_tag="$value" ;;
      unix_archive) unix_archive="$value" ;;
      windows_archive) windows_archive="$value" ;;
      *) fail 'Invalid installer manifest entry.' ;;
    esac
  done < "$1"
  [[ "$count" -eq 4 && -n "$manifest_tag" && "$unix_archive" == "aikya-mods-$manifest_tag.tar.gz" && "$windows_archive" == "aikya-mods-$manifest_tag.zip" ]] || fail 'Invalid installer manifest.'
}
verify_hash() {
  local name="$1" digest actual hits=0 line hash entry
  digest=''
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([a-f0-9]{64})'  '([A-Za-z0-9_.-]+)$ ]] || fail 'Invalid release checksums.'
    hash="${BASH_REMATCH[1]}"; entry="${BASH_REMATCH[2]}"
    if [[ "$entry" == "$name" ]]; then digest="$hash"; hits=$((hits+1)); fi
  done < "$stage/SHA256SUMS"
  [[ "$hits" -eq 1 ]] || fail "Missing or duplicate checksum: $name"
  if [[ "$platform" == macos ]]; then actual="$(shasum -a 256 "$stage/$name")"; else actual="$(sha256sum "$stage/$name")"; fi
  [[ "${actual%% *}" == "$digest" ]] || fail "Checksum mismatch: $name"
}

if [[ -z "$source_dir" ]]; then
  case "$(uname -s)" in Darwin) platform=macos ;; Linux) platform=linux ;; *) fail 'Use the Windows PowerShell installer on Windows.' ;; esac
  [[ "$expected_os" == auto || "$expected_os" == "$platform" ]] || fail "This installer is for $expected_os. Download the $platform installer."
  for tool in tar gzip awk diff find mktemp; do command -v "$tool" >/dev/null 2>&1 || fail "Required tool was not found: $tool"; done
  if [[ "$platform" == macos ]]; then
    command -v shasum >/dev/null 2>&1 || fail 'Required tool was not found: shasum'
    cache_root="${AIKYA_MODS_HOME:-$HOME/Library/Application Support/Aikya/Mods}"
  else
    command -v sha256sum >/dev/null 2>&1 || fail 'Required tool was not found: sha256sum'
    cache_root="${AIKYA_MODS_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/aikya-mods}"
  fi
  if command -v curl >/dev/null 2>&1; then downloader=curl
  elif [[ "$platform" == linux ]] && command -v wget >/dev/null 2>&1; then downloader=wget
  else fail 'Required download tool was not found: curl (or wget on Linux)'; fi
  [[ ! -L "$cache_root" && ! -L "$cache_root/releases" ]] || fail 'The installation directory must not be a symbolic link.'
  mkdir -p "$cache_root"
  if ! mkdir "$cache_root/.install-lock" 2>/dev/null; then fail "Another installation holds $cache_root/.install-lock. If interrupted, inspect that lock before removing it."; fi
  lock="$cache_root/.install-lock"
  stage="$(mktemp -d "$cache_root/.staging.XXXXXX")"
  if [[ -z "$version" ]]; then
    download "$release_url/latest/download/installer-manifest.txt" "$stage/latest.txt"
    read_manifest "$stage/latest.txt"
    version="$manifest_tag"
  fi
  download "$release_url/download/$version/installer-manifest.txt" "$stage/installer-manifest.txt"
  read_manifest "$stage/installer-manifest.txt"
  [[ "$manifest_tag" == "$version" ]] || fail 'Installer manifest does not match the requested release.'
  download "$release_url/download/$version/SHA256SUMS" "$stage/SHA256SUMS"
  verify_hash installer-manifest.txt
  download "$release_url/download/$version/$unix_archive" "$stage/$unix_archive"
  verify_hash "$unix_archive"
  tar -tzf "$stage/$unix_archive" > "$stage/entries" || fail 'The release archive is invalid.'
  awk '
    !/^aikya-mods\/[A-Za-z0-9_.\/-]+$/ || /(^|\/)\.\.?($|\/)/ || /\/\// { exit 1 }
    seen[tolower($0)]++ { exit 1 }
    END { if (NR == 0) exit 1 }
  ' "$stage/entries" || fail 'Unsafe or duplicate release archive path.'
  tar -tvzf "$stage/$unix_archive" > "$stage/types" || fail 'The release archive is invalid.'
  awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" { exit 1 }' "$stage/types" || fail 'Release archives must not contain links or special files.'
  mkdir "$stage/extracted"
  tar -xzf "$stage/$unix_archive" --no-same-owner -C "$stage/extracted" || fail 'Release extraction failed.'
  source_dir="$stage/extracted/aikya-mods"
  [[ -f "$source_dir/VERSION" && "$(cat "$source_dir/VERSION")" == "${version#v}" ]] || fail 'The extracted bundle version does not match the release.'
fi
[[ -f "$source_dir/install.sh" && -f "$source_dir/.claude-plugin/marketplace.json" ]] || fail "Not an Aikya Mods bundle: $source_dir"
source_dir="$(cd "$source_dir" && pwd -P)"
claude plugin validate "$source_dir" --strict || fail 'Marketplace validation failed. Nothing was configured.'
for mod in "${available[@]}"; do claude plugin validate "$source_dir/mods/$mod" --strict || fail "Mod validation failed: $mod"; done
if [[ -n "$stage" ]]; then
  destination="$cache_root/releases/$version"
  [[ ! -L "$destination" ]] || fail 'The release directory must not be a symbolic link.'
  if [[ -e "$destination" ]]; then
    [[ -d "$destination/aikya-mods" && ! -L "$destination/aikya-mods" ]] || fail 'The release directory belongs to another installation.'
    [[ -z "$(find "$destination" ! -type f ! -type d -print)" ]] || fail 'The installed release contains a link or special file. Preserve it before retrying.'
    diff -qr "$stage/extracted" "$destination" >/dev/null || fail 'The installed release contains local changes. Preserve that directory before retrying.'
  else
    mkdir -p "$cache_root/releases"
    mv "$stage/extracted" "$destination"
  fi
  source_dir="$(cd "$destination/aikya-mods" && pwd -P)"
fi
if ! bash "$source_dir/install.sh" "${selected[@]}" --scope "$scope"; then
  fail "Claude Code installation failed. Earlier successful changes are not rolled back. Source retained at $source_dir; resolve the error and retry."
fi
printf 'Marketplace source retained at %s\n' "$source_dir"
