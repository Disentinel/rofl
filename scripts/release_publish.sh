#!/usr/bin/env bash
# The release job's publishing (.github/workflows/ci.yml), run from the root of a checkout over the artifacts of the engine and vsix jobs
# as actions/download-artifact lays them out in ./artifacts: the GitHub release with the VSIX files, the bare engines and their sha256,
# then, with NPM_PUBLISH=true, the npm packages STAGED (`npm stage publish`), each platform's first and @grafema/rofl last; the owner
# approves them on npmjs.com in the same order (docs/npm.md).
#   scripts/release_publish.sh rofl-nb-<version>              the release job, on a tag
#   scripts/release_publish.sh --dry-run rofl-nb-<version>    the release-dry job on main: every line the same, but no GitHub release
#                                                              is made and the npm packages go to `npm stage publish --dry-run`
# Run again on the same tag (a re-run of the job), it uploads the assets to the release already there and skips a version already on the
# registry. A version staged and not yet approved cannot be known here (`npm stage list` needs a person's sign-in, which a trusted
# publisher's token is not), so a re-run stops at the first such package with npm's refusal: approve or reject it, then run again.
set -euo pipefail
dry=
if [ "${1:-}" = --dry-run ]; then dry=1; shift; fi
tag=$1 v=${1#rofl-nb-}
npm=; if [ -n "$dry" ] || [ "${NPM_PUBLISH:-}" = true ]; then npm=1; fi
notes=docs/releases/${v%.*}.md
packages=(linux-x64 linux-arm64 darwin-x64 darwin-arm64 win32-x64 '')

# what would fail halfway is refused before anything is published
[ -f "$notes" ] || { echo "no release notes $notes"; exit 1; }
if [ -n "$npm" ]; then
  # `npm stage` is npm 12's
  echo "npm $(npm --version), node $(node --version), ACTIONS_ID_TOKEN_REQUEST_URL ${ACTIONS_ID_TOKEN_REQUEST_URL:+present}${ACTIONS_ID_TOKEN_REQUEST_URL:-absent}"
  [ "$(npm --version | cut -d. -f1)" -ge 12 ] || { echo "npm $(npm --version) has no \`npm stage\`: npm 12 or later"; exit 1; }
  # npm swallows a failed sign-in and fails later as ENEEDAUTH; this says why, before the GitHub release is made
  names=(); for p in "${packages[@]}"; do names+=("@grafema/rofl${p:+-$p}"); done
  node --experimental-strip-types scripts/npm_oidc.ts "${names[@]}"
fi

mkdir out npm-dist
mv artifacts/vsix/grafema-rofl-*.tgz npm-dist/
mv artifacts/vsix/* out/
node --experimental-strip-types scripts/npm_check.ts --dist npm-dist --tag "$tag"
for d in artifacts/rofl-*; do t=${d#artifacts/rofl-}; for f in "$d"/*; do b=$(basename "$f"); mv "$f" "out/${b%.exe}-$t${b#rofl}"; done; done
(cd out && sha256sum * > SHA256SUMS)
if [ -n "$dry" ]; then
  echo "dry run: no GitHub release $tag; the notes $notes and $(ls out | wc -l | tr -d ' ') files:"; ls -l out
elif gh release view "$tag" > /dev/null 2>&1; then
  echo "the GitHub release $tag is there already: its assets uploaded again"
  gh release upload "$tag" out/* --clobber
else
  gh release create "$tag" out/* --prerelease --title "ROFL $v (preview)" --notes-file "$notes"
fi

# staged on the dist-tag latest, which the GitHub release's prerelease mark does not reach, so once approved `npm i -g @grafema/rofl`
# and `npm update -g` take it
[ -n "$npm" ] || exit 0
for p in "${packages[@]}"; do
  # ./ : npm reads `npm-dist/x.tgz` as the GitHub repository npm-dist/x.tgz
  name=@grafema/rofl${p:+-$p}; f=./npm-dist/grafema-rofl${p:+-$p}-$v.tgz
  if [ "$(npm view "$name@$v" version 2>/dev/null)" = "$v" ]; then echo "$name@$v is on the registry already: skipped"; continue; fi
  # verbose: npm's own account of its sign-in (`oidc ...` lines: the exchange's answer) is in the log
  npm stage publish "$f" --provenance --access public --tag latest --loglevel verbose ${dry:+--dry-run}
done
