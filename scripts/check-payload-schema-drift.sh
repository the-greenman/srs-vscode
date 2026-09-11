#!/usr/bin/env bash
# Check that the vendored payload contract schemas (schemas/payload/) match
# srs-rust's crates/srs-cli/schemas/payload/ at origin/master — the same drift
# check pattern as scripts/check-schema-drift.sh for schemas/2.0/.
#
# Compares against the origin/master REF, never the sibling's working tree, so
# a stale local checkout reports honest drift against what is actually
# published rather than agreeing with itself. sync-payload-schemas.sh reads the
# same ref; the two must not disagree about their source.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRS_RUST_DIR="${SRS_RUST_DIR:-${REPO_DIR}/../srs-rust}"
DST="${REPO_DIR}/schemas/payload"

if [[ ! -e "${SRS_RUST_DIR}/.git" ]]; then
    echo "ERROR: srs-rust checkout not found: ${SRS_RUST_DIR}" >&2
    echo "       Set SRS_RUST_DIR to the path of the srs-rust repo." >&2
    exit 1
fi

git -C "${SRS_RUST_DIR}" fetch --quiet origin master 2>/dev/null || true
if ! git -C "${SRS_RUST_DIR}" rev-parse --quiet --verify "origin/master:crates/srs-cli/schemas/payload" >/dev/null; then
    echo "ERROR: crates/srs-cli/schemas/payload not found at ${SRS_RUST_DIR} origin/master." >&2
    exit 1
fi

# Materialise the canonical copy from the ref into a temp dir for comparison.
SRC="$(mktemp -d)"
trap 'rm -rf "${SRC}"' EXIT
git -C "${SRS_RUST_DIR}" archive origin/master crates/srs-cli/schemas/payload \
    | tar -x -C "${SRC}" --strip-components=4 --wildcards '*.json'
echo "Comparing against ${SRS_RUST_DIR} @ origin/master ($(git -C "${SRS_RUST_DIR}" rev-parse --short origin/master))"

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
