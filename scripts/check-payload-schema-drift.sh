#!/usr/bin/env bash
# Check that the vendored payload contract schemas (schemas/payload/) match
# the sibling srs-rust checkout's crates/srs-cli/schemas/payload/ — the same
# drift check pattern as scripts/check-schema-drift.sh for schemas/2.0/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRS_RUST_DIR="${SRS_RUST_DIR:-${REPO_DIR}/../srs-rust}"
SRC="${SRS_RUST_DIR}/crates/srs-cli/schemas/payload"
DST="${REPO_DIR}/schemas/payload"

if [[ ! -d "${SRC}" ]]; then
    echo "ERROR: Canonical payload schema directory not found: ${SRC}" >&2
    echo "       Set SRS_RUST_DIR to the path of the srs-rust repo." >&2
    exit 1
fi

if [[ ! -d "${DST}" ]]; then
    echo "ERROR: Vendored payload schema directory not found: ${DST}" >&2
    exit 1
fi

DRIFT=0

for src_file in "${SRC}"/*.json; do
    filename="$(basename "${src_file}")"
    dst_file="${DST}/${filename}"
    if [[ ! -f "${dst_file}" ]]; then
        echo "MISSING in srs-vscode: ${filename}"
        DRIFT=1
    elif ! diff -q "${src_file}" "${dst_file}" > /dev/null; then
        echo "DRIFT detected: ${filename}"
        DRIFT=1
    fi
done

for dst_file in "${DST}"/*.json; do
    filename="$(basename "${dst_file}")"
    if [[ ! -f "${SRC}/${filename}" ]]; then
        echo "EXTRA in srs-vscode (not in srs-rust): ${filename}"
        DRIFT=1
    fi
done

if [[ "${DRIFT}" -ne 0 ]]; then
    echo ""
    echo "Payload schema drift detected between srs-rust and srs-vscode." >&2
    echo "Run scripts/sync-payload-schemas.sh to refresh the vendored copy." >&2
    exit 1
fi

echo "OK: No payload schema drift detected."
