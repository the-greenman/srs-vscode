#!/usr/bin/env bash
# Sync the payload contract golden schemas from the sibling srs-rust checkout
# into the vendored schemas/payload/ mirror (srs-vscode#119 workstream 7).
#
# Unlike scripts/sync-schemas-from-spec.sh, there is currently no published
# release asset for these — srs-rust's release.yml only publishes the `srs`
# binary and (separately) schemas-2.0.tar.gz for the spec-level schemas
# (docs/schema/2.0/, ext:repository/ext:views-l2/... shapes). The payload
# contract schemas (crates/srs-cli/schemas/payload/, ADR-011) have no
# equivalent tarball yet. Until a companion srs-rust change adds one (filed
# as a follow-up alongside this issue), this script only supports a local
# sibling checkout, with the same ancestor-of-origin/master safety check
# sync-schemas-from-spec.sh uses for its --local mode — never a diverged or
# foreign branch silently vendored with a green exit code (srs-rust#874's
# trap).
#
# Usage:
#   scripts/sync-payload-schemas.sh [--local <path>]
#   $SRS_RUST_DIR is the environment-variable spelling of --local.
# Defaults to the conventional sibling checkout ../srs-rust when neither is given.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DST="${REPO_DIR}/schemas/payload"

LOCAL_PATH=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --local)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --local requires a path argument" >&2
                exit 1
            fi
            LOCAL_PATH="$2"
            shift 2
            ;;
        *)
            echo "ERROR: unknown argument '$1'" >&2
            echo "Usage: ${0} [--local <path>]" >&2
            exit 1
            ;;
    esac
done

if [[ -n "${LOCAL_PATH}" && -n "${SRS_RUST_DIR:-}" ]]; then
    echo "ERROR: both --local and \$SRS_RUST_DIR are set — pick one explicit source, not two." >&2
    exit 1
fi
LOCAL_PATH="${LOCAL_PATH:-${SRS_RUST_DIR:-${REPO_DIR}/../srs-rust}}"

if [[ ! -e "${LOCAL_PATH}/.git" ]]; then
    echo "ERROR: ${LOCAL_PATH} is not a git checkout (no .git)." >&2
    exit 1
fi
SRC="${LOCAL_PATH}/crates/srs-cli/schemas/payload"
if [[ ! -d "${SRC}" ]]; then
    echo "ERROR: ${SRC} not found — not an srs-rust checkout, or the payload schema dir moved." >&2
    exit 1
fi

echo "Verifying ${LOCAL_PATH} against its origin/master (fetching)..." >&2
if ! git -C "${LOCAL_PATH}" fetch --quiet origin master; then
    echo "ERROR: could not fetch origin/master in ${LOCAL_PATH} — cannot verify it isn't stale." >&2
    exit 1
fi

HEAD_SHA="$(git -C "${LOCAL_PATH}" rev-parse HEAD)"
MASTER_SHA="$(git -C "${LOCAL_PATH}" rev-parse origin/master)"

if ! git -C "${LOCAL_PATH}" merge-base --is-ancestor "${HEAD_SHA}" "${MASTER_SHA}"; then
    echo "ERROR: ${LOCAL_PATH} HEAD (${HEAD_SHA}) is not an ancestor of its origin/master (${MASTER_SHA})." >&2
    echo "       A diverged or foreign-branch local checkout would silently vendor the wrong" >&2
    echo "       schemas with a green exit code (srs-rust#874's trap). Rebase/merge the" >&2
    echo "       checkout onto origin/master first." >&2
    exit 1
fi

if [[ "${HEAD_SHA}" == "${MASTER_SHA}" ]]; then
    echo "Source: ${LOCAL_PATH} @ ${HEAD_SHA} (= origin/master)"
else
    echo "Source: ${LOCAL_PATH} @ ${HEAD_SHA} (ancestor of origin/master @ ${MASTER_SHA})"
fi

mkdir -p "${DST}"
rm -f "${DST}"/*.json
cp "${SRC}"/*.json "${DST}/"

cd "${DST}"
# Plain `sort` (sorts by hash), matching check-schema-drift.sh's convention —
# never regenerate SHA256SUMS by hand.
sha256sum *.json | sort > SHA256SUMS

echo "Synced $(ls "${DST}"/*.json | wc -l) payload schemas + SHA256SUMS from ${SRC}"
