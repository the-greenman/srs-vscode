#!/usr/bin/env bash
# Install the srs-vscode extension into your local VS Code.
#
# Usage:
#   scripts/install-local.sh                 # download the latest CI release .vsix and install it
#   scripts/install-local.sh --build         # package the extension locally, then install
#   scripts/install-local.sh path/to/x.vsix  # install a specific .vsix file
#
# Options:
#   --code <bin>   VS Code CLI to use (default: $CODE_BIN, else 'code')
#   -h, --help     Show this help
#
# After installing, reload the window: Ctrl/Cmd-Shift-P -> "Developer: Reload Window".
# The extension shells out to the `srs` CLI — make sure it's on PATH, or set the
# `srs.cli.path` setting.
set -euo pipefail

REPO="the-greenman/srs-vscode"
CODE_BIN="${CODE_BIN:-code}"
MODE="download"
VSIX_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --build) MODE="build"; shift ;;
    --code) CODE_BIN="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) MODE="file"; VSIX_ARG="$1"; shift ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

if ! command -v "$CODE_BIN" >/dev/null 2>&1; then
  echo "error: VS Code CLI '$CODE_BIN' not found on PATH. Set CODE_BIN or pass --code <bin>." >&2
  exit 1
fi

case "$MODE" in
  build)
    echo "==> Packaging locally (npm run package)…"
    ( cd "$repo_root" && npm run package )
    vsix="$repo_root/srs-vscode.vsix"
    ;;
  file)
    vsix="$VSIX_ARG"
    [ -f "$vsix" ] || { echo "error: no such file: $vsix" >&2; exit 1; }
    ;;
  download)
    command -v gh >/dev/null 2>&1 || { echo "error: 'gh' CLI required to download the release. Use --build or pass a .vsix path." >&2; exit 1; }
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    echo "==> Downloading latest release .vsix from $REPO…"
    gh release download --repo "$REPO" --pattern 'srs-vscode.vsix' --pattern 'srs-vscode.vsix.sha256' --dir "$tmp" --clobber
    if [ -f "$tmp/srs-vscode.vsix.sha256" ]; then
      echo "==> Verifying checksum…"
      ( cd "$tmp" && sha256sum -c srs-vscode.vsix.sha256 )
    fi
    vsix="$tmp/srs-vscode.vsix"
    ;;
esac

echo "==> Installing $vsix into '$CODE_BIN'…"
"$CODE_BIN" --install-extension "$vsix" --force

echo
echo "Installed. Reload VS Code: Ctrl/Cmd-Shift-P -> 'Developer: Reload Window'."
echo "Then: Ctrl/Cmd-Shift-P -> 'SRS: Open Archive (.srs)…'."
