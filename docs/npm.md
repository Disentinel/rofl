# The npm packages

ROFL is installed from npm as `@grafema/rofl` (the name `rofl` on npm is
someone else's package): `npm install -g @grafema/rofl`, and
`npm install -g @grafema/rofl@latest` (or `npm update -g`) for each new release.
`scripts/dist.ts` packs it, `npm run test:npm` (`scripts/npm_check.ts`) installs
the tarballs and runs them as a user would before anything is published, and the
release job of `.github/workflows/ci.yml` publishes them from a
`rofl-nb-<version>` tag to the dist-tag `latest`.

## What is in them

**`@grafema/rofl`**, plain JS, no dependencies but optional ones:

- `rofl` (`npm/rofl.ts`): runs the engine binary of this platform's package
  with the arguments, streams, directory, environment and exit as given. Where
  Node has `process.execve` (22.15 and later, not Windows) the engine replaces
  the Node process, so killing either is killing the one process; elsewhere the
  engine is a child, the signals are passed on and an engine killed by a signal
  kills the command by it. It calls the engine by a path inside the package, so
  the engine reads `@rules/js.files` and a notebook's vocabulary from the
  package (`md::installed_tree`, docs/cli.md). `rofl scan` is the JS scanner,
  `npm run scan` of a checkout; `rofl --version` the version and the engine
  binary it runs. No platform package, or one of another version: exit 127 and
  a line naming the package to install. There is no TypeScript fallback: Rust
  is the engine.
- `rofl-nb` and `rofl-lsp`, which the `rofl-nb-<version>.tgz` of the GitHub
  release carried up to 1.4.0; the notebook evaluates on the same platform
  package's engine.
- the library (`import { Rofl } from '@grafema/rofl'`, `./port`, `boot.rofl`,
  the inquiry, policy and decision packs), the JS model (`rules/js.files` and
  what it lists), the scanner with `@babel/parser` vendored, the guide and the
  examples.

**`@grafema/rofl-<os>-<cpu>`** for `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64`, `win32-x64`: `bin/rofl` (`bin/rofl.exe`), executable, with
`os` and `cpu` set, so npm downloads only the one of the machine. Each is an
optional dependency of `@grafema/rofl` pinned to its exact version, so an
upgrade of `@grafema/rofl` brings its engine with it.

One version for all: package.json's. The release job refuses a tag whose
version is not package.json's or not every tarball's before anything is
published (`scripts/npm_check.ts --tag`). The tarballs are not attached to the
GitHub release; the release keeps the VSIX files and the bare engine binaries.

Installing from the tarballs with no registry works, as the check does it, only
with `npm install --offline`: the package names the other four engines as
optional dependencies, and without the flag npm asks the registry for each,
retrying for minutes where nothing answers (over 250 s measured).

## The release, rehearsed on main

The release job's publishing is `scripts/release_publish.sh`, and the
`release-dry` job runs the same script on every push to main with
`--dry-run`, over that run's artifacts: the files laid out as for the GitHub
release, the tag's version checked against package.json and every tarball, the
release notes found, npm 11.5.1 or later, and each package to
`npm publish --dry-run` unless its version is on the registry already (npm 11
refuses a dry run over a published version), so the packages go through it
whole on the push that bumps the version, the one before the tag. It cannot see
the sign-in (OIDC, provenance), the registry's verdict on the upload, the
GitHub release itself or the VSIX publishing after it.

## Publishing: what the owner sets up once

The release job publishes by npm's trusted publishing: GitHub's OIDC token,
no npm token stored anywhere, provenance attached. It needs npm 11.5.1 or
later and Node 22.14 or later (the job installs npm 11), and it cannot be set up
for a package that was never published. So, once:

1. Make a release as usual (`rofl-nb-<version>` tag). With the repository
   variable `NPM_PUBLISH` unset, the job publishes nothing to npm.
2. Take the six `grafema-rofl-*.tgz` from that run's `vsix` artifact
   (`gh run download <run id> -n vsix`), and publish each from your own
   machine, signed in to npm as a member of the `@grafema` org (`npm login`,
   with its second factor), the platforms first:

       npm publish ./grafema-rofl-linux-x64-<version>.tgz --access public
       npm publish ./grafema-rofl-linux-arm64-<version>.tgz --access public
       npm publish ./grafema-rofl-darwin-x64-<version>.tgz --access public
       npm publish ./grafema-rofl-darwin-arm64-<version>.tgz --access public
       npm publish ./grafema-rofl-win32-x64-<version>.tgz --access public
       npm publish ./grafema-rofl-<version>.tgz --access public

3. On npmjs.com, for each of the six packages: Settings, Trusted Publisher,
   GitHub Actions, with organization or user `Disentinel`, repository `rofl`,
   workflow filename `ci.yml`, environment `marketplace-publish`. A new
   trusted publisher that no publish uses within two days expires, so do this
   step when the next release is due within two days.
4. Optionally, in each package's Settings, require two-factor authentication
   and disallow tokens, so that only the workflow publishes.
5. In GitHub, Settings, Secrets and variables, Actions, Variables: set
   `NPM_PUBLISH` to `true`. From the next tag on, the release job publishes
   the six itself to `latest`, skipping any version already on the registry,
   so re-running a tag is safe.
