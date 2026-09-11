#!/usr/bin/env bash
# Sync the payload contract golden schemas from the sibling srs-rust checkout's
# origin/master
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
echo "Fetching origin/master in ${LOCAL_PATH}..." >&2
if ! git -C "${LOCAL_PATH}" fetch --quiet origin master; then
    echo "ERROR: could not fetch origin/master in ${LOCAL_PATH}." >&2
    exit 1
fi

# Read the schemas out of origin/master itself, never the working tree. An
# "is HEAD an ancestor of origin/master" check passes for a checkout that is
# arbitrarily stale — 51 commits behind is an ancestor too — and that is
# exactly how this mirror was first vendored stale (srs-vscode#119 CI). Taking
# the content from the ref removes the staleness class rather than guarding it.
MASTER_SHA="$(git -C "${LOCAL_PATH}" rev-parse origin/master)"
echo "Source: ${LOCAL_PATH} @ origin/master (${MASTER_SHA})"

if ! git -C "${LOCAL_PATH}" rev-parse --quiet --verify "origin/master:crates/srs-cli/schemas/payload" >/dev/null; then
    echo "ERROR: crates/srs-cli/schemas/payload not found at origin/master — the payload schema dir moved." >&2
    exit 1
fi

mkdir -p "${DST}"
rm -f "${DST}"/*.json
git -C "${LOCAL_PATH}" archive "origin/master" crates/srs-cli/schemas/payload \
    | tar -x -C "${DST}" --strip-components=4 --wildcards '*.json'

cd "${DST}"
# Plain `sort` (sorts by hash), matching check-schema-drift.sh's convention —
# never regenerate SHA256SUMS by hand.
sha256sum *.json | sort > SHA256SUMS

echo "Synced $(ls "${DST}"/*.json | wc -l) payload schemas + SHA256SUMS from ${LOCAL_PATH} @ origin/master"
