#!/usr/bin/env bash
# Recompute the pnpm dependency hashes for the SparkyFitness Nix packages.
#
# Run this whenever pnpm-lock.yaml (or the dependency set of either package)
# changes. It rebuilds each package's `.pnpmDeps` derivation with a fake hash,
# reads the real hash Nix reports, and rewrites the `hash = "...";` line in the
# corresponding nix/*.nix file in place.
#
# Usage: nix/update-hashes.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

nix_bin="${NIX:-nix}"
nix_flags=(--extra-experimental-features "nix-command flakes")

# package attr -> nix file holding its hash
declare -A files=(
  [sparkyfitness-server]="nix/backend.nix"
  [sparkyfitness-frontend]="nix/frontend.nix"
)

fake_hash="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

update_one() {
  local pkg="$1"
  local file="$2"

  echo ">> Resolving pnpm deps hash for ${pkg} (${file})"

  # Force a known-wrong hash so the fixed-output derivation fails and prints the
  # real one. sed only touches the hash line for this package's file.
  sed -i -E "s|(hash = \")[^\"]*(\";)|\1${fake_hash}\2|" "$file"

  local log got
  # The build is expected to fail with a hash mismatch; capture its output.
  if log="$("$nix_bin" "${nix_flags[@]}" build ".#${pkg}.pnpmDeps" --no-link 2>&1)"; then
    echo "!! Build unexpectedly succeeded for ${pkg}; deps hash already current?" >&2
    return 0
  fi

  got="$(printf '%s\n' "$log" | sed -nE 's/^[[:space:]]*got:[[:space:]]*(sha256-[A-Za-z0-9+/=]+)/\1/p' | tail -n1)"
  if [[ -z "$got" ]]; then
    echo "!! Could not parse a hash from the build output for ${pkg}:" >&2
    printf '%s\n' "$log" >&2
    return 1
  fi

  sed -i -E "s|(hash = \")[^\"]*(\";)|\1${got}\2|" "$file"
  echo "   ${pkg}: ${got}"
}

for pkg in "${!files[@]}"; do
  update_one "$pkg" "${files[$pkg]}"
done

echo ">> Done. Updated hashes in: ${files[*]}"
