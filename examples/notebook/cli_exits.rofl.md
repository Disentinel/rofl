---
world: grafema-cli-exits
books: main
default: main
model: js
code:
  - ~/grafema/packages/cli/src/cli.ts
  - ~/grafema/packages/cli/src/commands/analyze.ts
  - ~/grafema/packages/cli/src/commands/analyzeAction.ts
  - ~/grafema/packages/cli/src/commands/check.ts
  - ~/grafema/packages/cli/src/commands/context.ts
  - ~/grafema/packages/cli/src/commands/coverage.ts
  - ~/grafema/packages/cli/src/commands/crawl.ts
  - ~/grafema/packages/cli/src/commands/describe.ts
  - ~/grafema/packages/cli/src/commands/doctor.ts
  - ~/grafema/packages/cli/src/commands/doctor/checks.ts
  - ~/grafema/packages/cli/src/commands/doctor/output.ts
  - ~/grafema/packages/cli/src/commands/doctor/types.ts
  - ~/grafema/packages/cli/src/commands/explain.ts
  - ~/grafema/packages/cli/src/commands/explore.tsx
  - ~/grafema/packages/cli/src/commands/export.ts
  - ~/grafema/packages/cli/src/commands/exportAction.ts
  - ~/grafema/packages/cli/src/commands/features.ts
  - ~/grafema/packages/cli/src/commands/featuresAction.ts
  - ~/grafema/packages/cli/src/commands/file.ts
  - ~/grafema/packages/cli/src/commands/get.ts
  - ~/grafema/packages/cli/src/commands/git-ingest.ts
  - ~/grafema/packages/cli/src/commands/impact.ts
  - ~/grafema/packages/cli/src/commands/init.ts
  - ~/grafema/packages/cli/src/commands/ls.ts
  - ~/grafema/packages/cli/src/commands/overview.ts
  - ~/grafema/packages/cli/src/commands/query.ts
  - ~/grafema/packages/cli/src/commands/registry.ts
  - ~/grafema/packages/cli/src/commands/resolve.ts
  - ~/grafema/packages/cli/src/commands/resolveAction.ts
  - ~/grafema/packages/cli/src/commands/schema.ts
  - ~/grafema/packages/cli/src/commands/server.ts
  - ~/grafema/packages/cli/src/commands/setup-skill.ts
  - ~/grafema/packages/cli/src/commands/start.ts
  - ~/grafema/packages/cli/src/commands/stats.ts
  - ~/grafema/packages/cli/src/commands/tldr.ts
  - ~/grafema/packages/cli/src/commands/trace.ts
  - ~/grafema/packages/cli/src/commands/types.ts
  - ~/grafema/packages/cli/src/commands/upgrade.ts
  - ~/grafema/packages/cli/src/commands/who.ts
  - ~/grafema/packages/cli/src/commands/why.ts
  - ~/grafema/packages/cli/src/commands/wtf.ts
  - ~/grafema/packages/cli/src/plugins/builtinPlugins.ts
  - ~/grafema/packages/cli/src/plugins/pluginLoader.ts
  - ~/grafema/packages/cli/src/utils/codePreview.ts
  - ~/grafema/packages/cli/src/utils/errorFormatter.ts
  - ~/grafema/packages/cli/src/utils/formatNode.ts
  - ~/grafema/packages/cli/src/utils/pathUtils.ts
  - ~/grafema/packages/cli/src/utils/progressRenderer.ts
  - ~/grafema/packages/cli/src/utils/queryHints.ts
  - ~/grafema/packages/cli/src/utils/quickstart.ts
  - ~/grafema/packages/cli/src/utils/spinner.ts
---

# Grafema CLI — exit discipline

> Does the Grafema CLI (`/Users/vadimr/grafema/packages/cli/src`, read-only)
> exit only from its command entry points, or also from library-like helper
> code — and can an exit cut off async work still in flight? All three
> questions, over the JS model.

## Q1 · Where can the process exit at all

```rofl
A call C exits if C is a host site of some host from "process" at "exit".

? C exits
```

> `commands/explore.tsx` does not parse under this model (JSX), so any exit
> inside it is out of sight; see the blind-spot cell at the end. Confirmed by
> reading (not by the model): `explore.tsx` calls `exitWithError` but no bare
> `process.exit`, so it does not change the count below on its own.

## Q2 · Confined to per-command code, or reaching into a shared helper

```natural
Q2 Every exit sits in code written for one command, never in a file more than one command imports.
```

```rofl
`cli_shared_helper_file` lists:

| file |
|---|
| "grafema/packages/cli/src/utils/codePreview.ts" |
| "grafema/packages/cli/src/utils/errorFormatter.ts" |
| "grafema/packages/cli/src/utils/formatNode.ts" |
| "grafema/packages/cli/src/utils/pathUtils.ts" |
| "grafema/packages/cli/src/utils/progressRenderer.ts" |
| "grafema/packages/cli/src/utils/queryHints.ts" |
| "grafema/packages/cli/src/utils/quickstart.ts" |
| "grafema/packages/cli/src/utils/spinner.ts" |
| "grafema/packages/cli/src/plugins/builtinPlugins.ts" |
| "grafema/packages/cli/src/plugins/pluginLoader.ts" |

A call C exits in a shared helper if C exits, C is in file F, and `cli_shared_helper_file`(F).

never C exits in a shared helper
? C exits in a shared helper
```

> `cli_shared_helper_file` is every file under `utils/` and `plugins/`: code no
> single command owns, imported by more than one `commands/*.ts` file (checked
> by reading, not by this model — the notebook's own acceptance table
> (`examples/notebook/self.rofl.md`, `kernel_file`) is curated the same way).

## Q3 · Who calls into the point that exits

```rofl
A function F itself exits if a call C exits and F is the nearest function of C.

A function F calls a function that itself exits if F has a call to a function G and G itself exits.

? F calls a function that itself exits
? F itself exits
```

## Q4 · Can an exit cut off async work still in flight

```natural
Q4 No function both fires an async call it does not await and can exit: the promise from the first could still be pending when the second runs.
```

```rofl
A call C is unawaited if C resolves to a function F and the attribute `async` of F is `true`, unless some await awaits C.

? C is unawaited

A function F fires an unawaited call if a call U is unawaited and F is the nearest function of U.

A function F both exits and fires unawaited work if F itself exits and F fires an unawaited call.

never F both exits and fires unawaited work
? F both exits and fires unawaited work
```

> This only sees the risk when the fire-and-forget call and the exit are read
> by the same function; an exit's `finally`-skipping a caller's pending
> cleanup (documented in `utils/errorFormatter.ts`'s own comment on
> `exitWithError`) is a different shape — a try/finally around the call, not
> an unawaited call in it — and this model has no relation over here for
> "encloses a finally block" that I found, so that half is UNVERIFIED by this
> notebook; see NOTES.md.

## Blind spots

```natural
Blind spot: commands/explore.tsx (JSX) does not parse under this model, so
nothing in it — including its own call into exitWithError — is in any answer
above. The run's own line says so: "error: grafema/packages/cli/src/commands/
explore.tsx: not parsed: Unexpected token, expected "," (435:11)", exit 2. A
`? src_parse_error[code](F, M)` cell answered "nothing in the model can put a
row here" (wrong name, book, or arity — not found in README.md/CLAUDE.md), so
that fact is read from the run's own error line, not queried; see NOTES.md.
```

