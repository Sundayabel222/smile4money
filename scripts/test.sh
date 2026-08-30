#!/usr/bin/env bash
# Run all test suites: Rust contracts, frontend, and backend.
# Exits with a non-zero code if any suite fails.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "============================================================"
echo " smile4money — full test run"
echo "============================================================"

failures=0

echo ""
echo ">>> [1/3] Rust contract tests (cargo test)"
rc=0
cargo test --manifest-path "$REPO_ROOT/Cargo.toml" || rc=$?
if [ "$rc" -ne 0 ]; then
	echo "    ✗ Rust tests failed (exit code $rc)"
	failures=$((failures+1))
else
	echo "    ✓ Rust tests passed"
fi

echo ""
echo ">>> [2/3] Frontend tests (npm run test)"
rc=0
(cd "$REPO_ROOT/apps/frontend" && npm run test) || rc=$?
if [ "$rc" -ne 0 ]; then
	echo "    ✗ Frontend tests failed (exit code $rc)"
	failures=$((failures+1))
else
	echo "    ✓ Frontend tests passed"
fi

echo ""
echo ">>> [3/3] Backend tests (npm run test)"
rc=0
(cd "$REPO_ROOT/apps/backend" && npm run test) || rc=$?
if [ "$rc" -ne 0 ]; then
	echo "    ✗ Backend tests failed (exit code $rc)"
	failures=$((failures+1))
else
	echo "    ✓ Backend tests passed"
fi

echo ""
echo "============================================================"
if [ "$failures" -ne 0 ]; then
	echo ""
	echo "============================================================"
	echo " Some tests failed. ($failures failures)"
	echo "============================================================"
	exit 1
fi

echo " All tests passed."
echo "============================================================"
