#!/usr/bin/env bash
# Sync canonical schemas from the spec repo into the VS Code schema mirror.
# Usage: scripts/sync-schemas-from-spec.sh [SRS_SPEC_DIR]
# SRS_SPEC_DIR defaults to ../srs (sibling checkout of this workspace).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPEC_DIR="${SRS_SPEC_DIR:-${REPO_DIR}/../srs}"
SRC="${SPEC_DIR}/docs/schema/2.0"
DST="${REPO_DIR}/schemas/2.0"

if [[ ! -d "${SRC}" ]]; then
    echo "ERROR: Canonical schema directory not found: ${SRC}" >&2
    echo "       Set SRS_SPEC_DIR to the path of the srs spec repo." >&2
    exit 1
fi

mkdir -p "${DST}"
cp "${SRC}"/*.json "${DST}/"

echo "Synced $(ls "${DST}"/*.json | wc -l) schemas from ${SRC}"
