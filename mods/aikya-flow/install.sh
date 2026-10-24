#!/usr/bin/env bash
set -e -o pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
exec bash "$repo_root/install.sh" aikya-flow "$@"
