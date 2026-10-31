# Opening a notebook from GitHub

A `.rofl.md` in a repository opens in two places: the web workbench at
https://disentinel.github.io/rofl/ and the VS Code extension. Both read private
repositories with the viewer's own GitHub account, and both say in a sentence
why a link they cannot read failed: the repository is private or does not
exist, this account has no access, the organization restricts the app, the
request limit is spent, there is no such branch, there is no such file.

## The web workbench

`?gh=owner/repo/path.rofl.md@ref` (ref `main` when left out) or
`?url=<a GitHub page or raw link>` opens a notebook. The files its `reads:` and
`code:` name are read beside it. Open… or a dropped folder opens local files.
Public repositories need no sign-in. **Sign in with GitHub** opens private
ones.

The page is static (`.github/workflows/pages.yml` builds it from `workbench/`
on every push to main), so the sign-in has three parts, all in place since
2026-10-20:

| part | what it is | where it is set up |
|---|---|---|
| GitHub App **ROFL Workbench** (`rofl-workbench`) | the first sign-in: Contents and Metadata read-only, tokens expire in 8 hours. It reads only the accounts and organizations it is installed on; a repository it cannot read says where to install it | github.com/settings/apps/rofl-workbench (the owner's account) |
| OAuth App **ROFL Workbench (full access)** | offered only by a click, when the GitHub App cannot read a repository. Scope `repo`, so the page keeps its token in the tab alone and revokes it on sign out or after two hours | github.com/settings/developers, OAuth Apps |
| Cloudflare Worker `rofl-oauth` | `workbench/oauth-worker.js`: holds both apps' secrets, trades a sign-in code for a token and revokes tokens. A static page cannot hold a secret | https://rofl-oauth.vadimrimych.workers.dev/, the owner's Cloudflare account |

Both apps have the callback https://disentinel.github.io/rofl/. The page
side is `workbench/github.ts`. Its constants `APP_CLIENT_ID`, `APP_SLUG`,
`OAUTH_CLIENT_ID` and `EXCHANGE` name the two apps and the worker. Client ids
are public; the secrets live only in the worker.

To redeploy the worker or rotate a secret:

    npx wrangler deploy workbench/oauth-worker.js --name rofl-oauth --compatibility-date 2026-10-01
    npx wrangler secret put APP_CLIENT_SECRET      # and APP_CLIENT_ID, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET

A new worker address goes in `EXCHANGE`. A new app goes in its client id
constant. Without `EXCHANGE` the button falls back to a pasted personal access
token. `npm run test:workbench` plays GitHub with fake storages and checks the
sign-in on the build.

An organization with OAuth App access restrictions has to approve the app once,
in its settings under Third-party access. Until then the page says so.

## The VS Code extension

A notebook in a clone opens as any file does. That is also the way to work on
it: scan, edit, run, commit.

**ROFL: Open notebook from GitHub…** opens a notebook without a clone. It takes
a GitHub link or `owner/repo/path.rofl.md@ref` and signs in with VS Code's own
GitHub account (the Accounts menu), so it needs neither app above. It reads the
notebook and every file it reads (`reads:`, `code:`, and the data its code
imports) into a copy under the extension's storage, then opens the copy. Each
open reads the files again; edits to the copy stay in the copy.
`vscode://GrafemaLabs.rofl/open?gh=owner/repo/path.rofl.md@ref` does the same
from a link. The code is `vscode/github.ts`.

The extension declares `virtualWorkspaces: false`, so a repository opened
through GitHub Repositories (`vscode-vfs://`) does not run notebooks; the
command above is the way in.
