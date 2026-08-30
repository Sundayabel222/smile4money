#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

cp "$repo_root/scripts/deploy_mainnet.sh" "$work_dir/deploy_mainnet.sh"
cd "$work_dir"
git init -q
git config user.name "Test User"
git config user.email "test@example.com"

source ./deploy_mainnet.sh
write_deployment_manifest "mainnet" "escrow_test_id" "oracle_test_id"

manifest="deployments/mainnet.json"
if [[ ! -f "$manifest" ]]; then
  echo "Expected deployment manifest at $manifest" >&2
  exit 1
fi

python3 - <<'PY' "$manifest"
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    data = json.load(fh)
assert data["escrow"] == "escrow_test_id", data
assert data["oracle"] == "oracle_test_id", data
assert "deployedAt" in data and data["deployedAt"], data
print(f"manifest ok: {path}")
PY

status=$(git status --short -- "$manifest")
if [[ -z "$status" ]]; then
  echo "Manifest was not staged for commit" >&2
  exit 1
fi
if ! printf '%s\n' "$status" | grep -q "A  .*deployments/mainnet.json\|A .*deployments/mainnet.json"; then
  echo "Manifest is not staged as an added file: $status" >&2
  exit 1
fi

echo "mainnet manifest test passed"
