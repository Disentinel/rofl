#!/bin/bash
# SessionStart hook: install deps if missing, then render the findings
# backlog into the session's opening context — open findings demand a
# reaction (see CLAUDE.md, rules/findings.rofl).
set -euo pipefail
cd "$CLAUDE_PROJECT_DIR"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >/dev/null 2>&1 || true
fi

node --experimental-strip-types runtime/report.ts facts/findings.rofl 2>/dev/null \
  || echo "findings report failed - run 'npm run findings' and investigate"
