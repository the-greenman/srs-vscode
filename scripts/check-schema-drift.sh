#!/usr/bin/env bash
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

if [[ ! -d "${DST}" ]]; then
    echo "ERROR: VS Code schema directory not found: ${DST}" >&2
    exit 1
fi

DRIFT=0

for src_file in "${SRC}"/*.json; do
    filename="$(basename "${src_file}")"
    dst_file="${DST}/${filename}"
    if [[ ! -f "${dst_file}" ]]; then
        echo "MISSING in VS Code schemas: ${filename}"
        DRIFT=1
    elif ! diff -q "${src_file}" "${dst_file}" > /dev/null; then
        echo "DRIFT detected: ${filename}"
        DRIFT=1
    fi
done

for dst_file in "${DST}"/*.json; do
    filename="$(basename "${dst_file}")"
    if [[ ! -f "${SRC}/${filename}" ]]; then
        echo "EXTRA in VS Code schemas (not in spec): ${filename}"
        DRIFT=1
    fi
done

if [[ "${DRIFT}" -ne 0 ]]; then
    echo ""
    echo "Schema drift detected between srs and srs-vscode." >&2
    exit 1
fi

echo "OK: No schema drift detected."
