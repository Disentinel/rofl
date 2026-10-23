# Install the ROFL notebook

Needs Node 22 or later (`node -v`) for the command line and
VS Code 1.101 or later for the editor. A model is needed only to
translate natural-language cells: VS Code's own (e.g. Copilot) or a CLI such as
`claude` ([Models](MODELS.md)).

    npm install -g @grafema/rofl            # rofl, rofl-nb and the rofl-lsp language server
    npm install -g @grafema/rofl@latest     # later: the newest release over the one installed
    code --install-extension ./rofl-*.vsix  # the notebook in VS Code, from the release's .vsix; --force replaces the same version

Up to 1.4.0 the command line was a `rofl-nb-<version>.tgz` of the GitHub
release; `@grafema/rofl` replaces it with the same two commands. Uninstall the
old one first (`npm uninstall -g rofl-nb`), since both install `rofl-nb` and
`rofl-lsp`.

Uninstall:

    npm uninstall -g @grafema/rofl
    code --uninstall-extension GrafemaLabs.rofl

New here? Go to [QUICKSTART.md](QUICKSTART.md).
