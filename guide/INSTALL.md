# Install the ROFL notebook

Needs Node 22 or later (`node -v`) for the command line and
VS Code 1.101 or later for the editor. The `claude` CLI is needed only to
translate natural-language cells. From the folder with the two files:

    npm install -g ./rofl-nb-*.tgz          # the rofl-nb command and the rofl-lsp language server
    code --install-extension ./rofl-*.vsix  # the notebook in VS Code; --force replaces the same version

Uninstall:

    npm uninstall -g rofl-nb
    code --uninstall-extension GrafemaLabs.rofl

New here? Go to [QUICKSTART.md](QUICKSTART.md).
