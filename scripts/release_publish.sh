#!/usr/bin/env bash
# The release job's publishing (.github/workflows/ci.yml), run from the root of a checkout over the artifacts of the engine and vsix jobs
# as actions/download-artifact lays them out in ./artifacts: the GitHub release with the VSIX files, the bare engines and their sha256,
# then, with NPM_PUBLISH=true, the npm packages, each platform's first and @grafema/rofl last.
#   scripts/release_publish.sh rofl-nb-<version>              the release job, on a tag
#   scripts/release_publish.sh --dry-run rofl-nb-<version>    the release-dry job on main: every line the same, but `gh release create`
#                                                              is not run and the npm packages go to `npm publish --dry-run`
# A version already on the registry is skipped by both, so the dry run publishes in earnest only on main between a version's bump and its tag
# (npm 11 refuses a dry run over a published version). What it cannot see: the sign-in (OIDC trusted publishing, provenance), the registry's
# verdict on the upload, the GitHub release itself, and the VSIX publishing after it.
set -euo pipefail
dry=
if [ "${1:-}" = --dry-run ]; then dry=1; shift; fi
tag=$1 v=${1#rofl-nb-}
npm=; if [ -n "$dry" ] || [ "${NPM_PUBLISH:-}" = true ]; then npm=1; fi
notes=docs/releases/${v%.*}.md

# what would fail halfway is refused before anything is published
[ -f "$notes" ] || { echo "no release notes $notes"; exit 1; }
if [ -n "$npm" ]; then
  # trusted publishing needs npm 11.5.1 or later
  node -e 'const [a, b, c] = process.argv[1].split(".").map(Number); process.exit(a > 11 || (a === 11 && (b > 5 || (b === 5 && c >= 1))) ? 0 : 1)' "$(npm --version)" \
    || { echo "npm $(npm --version) cannot publish by trusted publishing: npm 11.5.1 or later"; exit 1; }
fi

mkdir out npm-dist
mv artifacts/vsix/grafema-rofl-*.tgz npm-dist/
mv artifacts/vsix/* out/
node --experimental-strip-types scripts/npm_check.ts --dist npm-dist --tag "$tag"
for d in artifacts/rofl-*; do t=${d#artifacts/rofl-}; for f in "$d"/*; do b=$(basename "$f"); mv "$f" "out/${b%.exe}-$t${b#rofl}"; done; done
(cd out && sha256sum * > SHA256SUMS)
if [ -n "$dry" ]; then
  echo "dry run: gh release create $tag with the notes $notes and $(ls out | wc -l | tr -d ' ') files:"; ls -l out
else
  gh release create "$tag" out/* --prerelease --title "ROFL $v (preview)" --notes-file "$notes"
fi

# on the dist-tag latest, which the GitHub release's prerelease mark does not reach, so `npm i -g @grafema/rofl` and `npm update -g`
# take it; a version already on the registry is skipped, so re-running a tag is safe
[ -n "$npm" ] || exit 0
for p in linux-x64 linux-arm64 darwin-x64 darwin-arm64 win32-x64 ''; do
  # ./ : npm reads `npm-dist/x.tgz` as the GitHub repository npm-dist/x.tgz
  name=@grafema/rofl${p:+-$p}; f=./npm-dist/grafema-rofl${p:+-$p}-$v.tgz
  if [ "$(npm view "$name@$v" version 2>/dev/null)" = "$v" ]; then echo "$name@$v is on the registry already: skipped"; continue; fi
  npm publish "$f" --provenance --access public --tag latest ${dry:+--dry-run}
done
