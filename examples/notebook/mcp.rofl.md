---
world: mcp-audit
books: main
default: main
model: js
code:
  - ../../../grafema/packages/mcp/src/**/*.ts
---

# A reviewer's audit of the Grafema MCP server

> `grafema/packages/mcp/src` (40 files, ~9.7k lines): an MCP server exposing
> ~60 tools over a code-graph database to an AI agent. Read-only target;
> this file never edits it. Seven invariants a reviewer would want, each
> taken from plain language down to something the JS model can run, with
> every intermediate step kept and a note on what it narrowed and why.
> Run: `npm run nb -- examples/notebook/mcp.rofl.md`.

## I1 · Every advertised tool has a handler, and every handler is advertised

```natural
I1 Every tool the server advertises has a handler, and every handler is advertised: the tools returned to the client and the dispatch table in server.ts agree.
```

> Read first, not modelled first: `definitions/index.ts` builds `TOOLS` by
> spreading ten arrays; `server.ts` dispatches on `request.params.name` with
> one `case` per tool. A third file, `definitions/knowledge-tools.ts`,
> exports a fifth array, `KNOWLEDGE_TOOLS` (`add_knowledge`,
> `query_knowledge`, `query_decisions`, `supersede_fact`,
> `get_knowledge_stats`), that `definitions/index.ts` never imports — and
> `handlers/knowledge-handlers.ts` implements all five handlers in full
> (`handleAddKnowledge` etc., real try/catch, real calls into the knowledge
> base) without `handlers/index.ts` ever exporting them. Both halves exist,
> fully written, and are wired to nothing. This is different from the git
> tools in the same two files, which are commented out with a named reason
> (`US-17`, needs git-ingest) — nothing here says these five are meant to be
> off.
>
> Step 1: name a tool by the code, not by re-reading `definitions/index.ts`
> myself — a tool definition is an object literal that is an array element
> and carries a `name:` property.
>
> FIRST ATTEMPT, KEPT AS A WARNING, two rounds of it: I first wrote this as
> two sentences, "A node O is a tool entry if O is among the `elements` of
> some node A" and then "A tool entry O is named T if [...]". The noun
> phrase in a head (`a tool entry O`) is a type LABEL for the parser, not a
> condition, and does not silently require the matching "is a tool entry"
> fact — left unstated, the second sentence ran over every named node in
> the corpus, 12366 of them, because "is named" also already exists as a
> base sentence (`ast_name`) and concluding it again added a clause to that
> one rather than making a new relation (`examples/notebook/self.rofl.md`'s
> I7, "a well-formed cell that concludes a model sentence... extends the
> model"). Fixed by gating explicitly and renaming to `has the tool name` /
> `has the dispatch label` — which then collided with EACH OTHER: two
> sentences of the identical shape ("A node X has the ADJ NOUN Y if...")
> made the second question return the first relation's rows verbatim, tool
> names and all, under the second's own wording. Not a wording collision
> this time, a SHAPE one. Final fix, below: both heads now read as
> differently-shaped sentences, `advertises the tool` and `dispatches the
> case`.

```rofl
A node O advertises the tool T if O is among the `elements` of some node, a node P is among the `properties` of O, the `key` of P is a node K, K is named "name", the `value` of P is a node V, V is written as T.

? O advertises the tool T
```

> 58 rows, not the 61 tool definitions `grep -c "name: '" definitions/*.ts`
> counts by hand — three short, not chased further (the corpus's own reading
> of "is among the elements of a node" plainly does not catch every array
> shape a `name:`-carrying object can sit in, and this file says so instead
> of padding the count).
>
> Step 2: name a dispatch case the same way — a `switch_case` in `server.ts`
> whose `test` is a string.

```rofl
A node SC dispatches the case T if SC is of kind `switch_case` in file "grafema/packages/mcp/src/server.ts", the `test` of SC is a node X, X is written as T.

? SC dispatches the case T
```

> 52 rows (of the 56 tool cases expected, by the same undercount as Step 1).
> Both undercounts are fine for this invariant specifically: it only asks
> for tool names present in Step 1 and absent from Step 2, so a name Step 1
> MISSES cannot appear as a false "unwired" — it just cannot be checked at
> all, and any name actually missing from both steps by the same accident
> would fail silently rather than loudly. Recorded as a limit, not
> papered over: this `never`, like `examples/notebook/self.rofl.md`'s I3,
> holds only as far as it sees.
>
> Step 3: the invariant itself. Named by the STRING, not the node — a
> node id cannot be typed into a `why` line by hand, and the point of this
> step is to be able to ask `why` about one specific name.

```rofl
A tool name N is unwired if some node advertises the tool N, unless some node dispatches the case N.

never N is unwired
why "add_knowledge" is unwired
```

> FAILS with SIX rows, not five: `add_knowledge`, `get_knowledge_stats`,
> `query_decisions`, `query_knowledge`, `supersede_fact` — and
> `onboard_project`. The sixth is the false positive Step 1's prose above
> promised would come if this ever widened past `definitions/`: it is
> `prompts.ts`'s one MCP prompt, a real `{name: 'onboard_project', ...}`
> array element, correctly "advertised" and correctly absent from
> `server.ts`'s tool switch — prompts are served by a different handler
> entirely, `GetPromptRequestSchema` → `getPrompt(name)` (`prompts.ts:36`),
> not `CallToolRequestSchema`'s `case`. Named and excluded explicitly,
> the way `examples/notebook/self.rofl.md` names `kernel_file` as data
> rather than guessing a filter that would happen to work — and it has to
> be a table: `unless N is "onboard_project"` (bare term equality) does not
> parse (`error: expected a literal or builtin`), so the one-row `lists:`
> table below, referenced by its positional name, is not style, it is the
> only form that reads.

```rofl
`prompt_name` lists:

| name |
|---|
| "onboard_project" |

A tool name N is unwired for real if N is unwired, unless `prompt_name`(N).

never N is unwired for real
```

> FAILS with exactly the five real rows. `finding_note`: `definitions/
> index.ts` is missing `import { KNOWLEDGE_TOOLS } from
> './knowledge-tools.js'` in its spread, and `handlers/index.ts` is missing
> the re-export of the five `handle*` functions from
> `handlers/knowledge-handlers.ts` — either omission alone would hide the
> feature; both are present, so it is invisible twice over. The reverse
> direction (a `case` with no tool definition) would need its own `never`,
> over dispatch labels rather than tool names; not written here because
> reading `server.ts` already shows every `case` is one of the wired tool
> names and the `default:` branch is the only fallback.

## I2 · No exception reaches the client unhandled

```natural
I2 A tool handler never lets an exception escape unhandled to the client: whatever a handler does, the caller always gets a ToolResult, never a thrown error.
```

> Step 1, naive: ask the model's own `may throw` of every handler function
> directly.

```rofl
? F may throw
```

> Three rows: `acquireAnalysisLock` (`state.ts:206`), `ensureAnalyzed`
> (`analysis.ts:132`), `getPrompt` (`prompts.ts:36`) — all three really do
> throw with no local `catch` (`ensureAnalyzed`'s outer block is
> `try { ... } finally { ... }`, no `handler`, so nothing inside it is
> "caught here" either). None of the ~56 `handleXxx` functions appear, even
> though several of them call `ensureAnalyzed()` with no local `catch`
> (`handlers/context-handlers.ts:196`, `handlers/graph-handlers.ts:200`).
> `may_throw`'s own second clause is interprocedural — "G may throw, C
> resolves to G, F is nearest to C, unless C is caught here" — so it SHOULD
> have propagated from `ensureAnalyzed` to every handler that calls it
> unguarded. It did not, for any of them.

```rofl
A call C calls ensureAnalyzed if C resolves to a function F and F answers to "ensureAnalyzed".

? C calls ensureAnalyzed
```

> Zero rows, for a name that is called at more than a dozen sites across
> `handlers/*.ts`. `finding_note`: cross-file call resolution
> (`resolves_to`, hence `may_throw`'s propagation) does not reach across the
> import from `handlers/*.ts` into `../analysis.js` — the same gap
> `examples/notebook/self.rofl.md`'s I5 already names on this tool's own
> source (`f_a_call_across_directories_is_not_resolved`), reproduced here on
> a second, unrelated codebase. So Step 1's silence ("no handler throws") is
> not evidence of anything: the model cannot see the one path that would
> have lit it up, and a green `never` built on it would have been the
> failure `examples/notebook/self.rofl.md`'s I3 warns about — held only
> because the check could not look.
>
> Step 2: ask the right question instead. Nothing needs cross-file
> resolution here — `server.ts` calls all ~56 handlers directly, from one
> function, the one MCP actually invokes per request.

```rofl
A node F is the request dispatcher if F is of kind `arrow_function_expression` in file "grafema/packages/mcp/src/server.ts" at line 251.

A node F throws to the client if F is the request dispatcher and F may throw.

never F throws to the client
```

> HOLDS, and for the right reason this time: every one of the dispatcher's
> ~56 calls to a `handleXxx` sits inside its own `try { switch (...) { ... }
> } catch (error) { ... }` (`server.ts:259-504`), so each call site is
> "caught here" in the model's own (correctly intraprocedural-per-site)
> sense, and `may_throw`'s clause 2 never fires for the dispatcher regardless
> of whether cross-file resolution works — this hold does not depend on the
> gap above. What is still out of sight: `request.params` is destructured
> one statement above the `try` (`server.ts:253`); if that ever threw, the
> model would not catch it either, because the code doesn't. Read: the SDK
> validates the shape before the handler runs, so this is a note, not a
> finding.

## I3 · No promise is dropped

```natural
I3 No promise is dropped: every call to an async function is awaited, returned, or deliberately detached — never silently discarded.
```

```rofl
A call C is unawaited if C resolves to a function F and the attribute `async` of F is `true`, unless some await awaits C.

never C is unawaited
```

> FAILS with 9 rows, not 2: `handleReload()` (`dev-proxy.ts:291`),
> `shutdown()` (three call sites — `SIGINT`, `SIGTERM`, `stdin.on('end')` at
> lines 329-331), `main()` (`server.ts:514`), and four more —
> `getNodeLogic`/`getNeighborsLogic`/`traverseGraphLogic`
> (`handlers/graph-handlers.ts:201,206,211`) and `findSharedBehaviorsLogic`
> (`handlers/behavior-handlers.ts:150`). `why` needs a ground literal and a
> call site has no atom I can type by hand, so the next steps read the code
> at each named line instead.
>
> `handleReload(msg.id)` and `shutdown()` are written `void handleReload(...)`
> / `void shutdown()` — the author's own mark for "fire-and-forget on
> purpose". First excuse:

```rofl
A call C is voided if the attribute `operator` of a node U is "void" and the `argument` of U is C.

A call C drops its promise if C is unawaited, unless C is voided.

never C drops its promise
```

> Down to 5, not 0 — still `main()` and the four `*Logic` calls. Read them:
> `handleGetNode` is `export async function handleGetNode(args) { const db =
> await ensureAnalyzed(); return getNodeLogic(db, args); }`
> (`graph-handlers.ts:199-202`) — `getNodeLogic` is not awaited, it is
> RETURNED; an async function returning a promise still propagates its
> rejection to whoever awaits the outer call, so nothing is dropped. Second
> excuse, a call in tail-return position:

```rofl
A call C is tail returned if R is of kind `return_statement` and the `argument` of R is C.

A call C drops its promise for real if C drops its promise, unless C is tail returned.

never C drops its promise for real
```

> Down to 1: `main()`. Read `server.ts:514`: `main().catch((error) => {
> log(...); process.exit(1); }); ` — not awaited, not `void`, not returned,
> but `.catch` is attached directly, which is a third legitimate way to
> not drop a rejection. Third excuse, a call whose result a `.catch`/`.then`
> is selected on:

```rofl
A call C is settled if the `object` of a node M is C and M selects "catch".

A call C really drops its promise if C drops its promise for real, unless C is settled.

never C really drops its promise
```

> HOLDS — three excuses deep, not one. `finding_note`: each widening was
> checked against the row it was meant to remove and nothing else — `void`
> took exactly the 4 `dev-proxy.ts` rows, tail-return took exactly the 4
> `*Logic` rows, `.catch` took exactly `main()` — by re-running the narrower
> `never` above it each time and reading the row list before writing the
> next excuse. The naive one-clause I3 from the top of this section would
> have been 9 for 9 wrong if trusted as stated, and the two-excuse version
> after it still had one false positive left.

## I4 · No child process is started through a shell

```natural
I4 No process the server starts is spawned through a shell string: every child process takes its argv as an array, never a command line a shell re-parses (the injection surface `exec`/`execSync` open and `execFile`/`spawn` close).
```

```rofl
A call C starts via a shell either:
1. if C is a host site of `node` from "node:child_process" at "exec";
2. if C is a host site of `node` from "node:child_process" at "execSync".

never C starts via a shell
```

> FIRST ATTEMPT, KEPT AS A WARNING: writing the two clauses as separate
> one-line sentences ("A call C starts via a shell if... " twice, once via
> a helper sentence) instead of this numbered `either:` list ran the two
> sentences together into one unreadable line, dropped the whole relation,
> and `never C starts via a shell` printed `FAILS · 0` — which reads exactly
> like "zero violations", not like "this head was never built". The only
> way to tell them apart was the `error:`/`left out:` lines printed above
> it. Logged in `mcp.FRICTION.md`: a `never` on a broken head and a `never`
> on a clean, populated, empty relation are NOT the same "holds"/"fails",
> and only one of them is a measurement of the code.

> HOLDS — cleanly, not vacuously: the corpus does start child processes
> (`? C is a host site of `node` from "node:child_process" at "spawn"` gives
> two rows, `analysis.ts:76` spawning `grafema-orchestrator` and
> `dev-proxy.ts:73` respawning `server.js`, both with an argv array, no
> `shell: true`), it just never does it through the two shell-parsing members.
>
> WHERE IT IS WEAKER THAN IT LOOKS: `handlers/query-handlers.ts:589` also
> runs a child process — `const { execFileSync } = await import
> ('child_process'); execFileSync('grep', args, ...)` — array args, so it is
> in fact safe, but asking the model directly for it comes back empty:

```rofl
? C is a host site of `node` from "node:child_process" at "execFileSync"
```

> Zero rows, for a real, live call site. `finding_note`: the host-effect
> layer resolves a *static* `import ... from 'node:child_process'`; a
> dynamic `await import('child_process')` (note: no `node:` prefix either)
> is invisible to it. This `never` holding is real for the sites it sees;
> for the one site that both matters most (it shells out to a real binary,
> `grep`) and is safe by inspection, the model has no opinion at all, and
> saying only "holds" would have overstated it.

## I5 · Configuration is read through one function

```natural
I5 Configuration is read through one function, not reimplemented ad hoc in whichever file happens to need a setting.
```

```rofl
A call C calls loadConfig if C resolves to a function F and F answers to "loadConfig".

? C calls loadConfig
```

> Zero rows — the same cross-file gap as I2: `loadConfig` (declared in
> `config.ts`) is called from `state.ts:282`, `analysis.ts:56` and
> `handlers/enox-handlers.ts:53`, three sites read directly, none seen by
> the model for the same reason `ensureAnalyzed`'s callers weren't. Not
> re-asked as a `never`, because a `never` that can only hold by not looking
> is exactly the failure this file is trying not to produce quietly (I2,
> I3's "Silence is not green" already made that point twice).
>
> What the reading supports instead, as a fact and not a model verdict:
> those three call sites are the only ones — `grep -rn "loadConfig(" src`
> — and every other file that needs a setting either takes it as a function
> argument or reads exactly one environment variable for an unrelated,
> non-project concern (`handlers/issue-handlers.ts:17`,
> `GITHUB_TOKEN`, for `report_issue`'s optional GitHub API call — not part
> of `MCPConfig`/`GrafemaConfig` at all). Behavioural, not modelled: this
> invariant is deferred to a grep-based check, `grep -c 'loadConfig(' -r src`
> staying 3, until cross-file resolution is fixed.

## I6 · Each file the server writes has exactly one writer

```natural
I6 Handlers do not write to disk except through the one place that owns each kind of file: one writer for the log, one for the generated config.
```

> Same shape as `examples/notebook/self.rofl.md`'s I4 (`the kernel writes
> nothing outside translation`), aimed at a different pair of files.

```rofl
A call C writes to disk either:
1. if C is a host site of `node` from "node:fs" at "writeFileSync";
2. if C is a host site of `node` from "node:fs" at "appendFileSync".

A call C writes to disk outside its owner if C writes to disk, a function F is the nearest function of C, and unless F answers to "log", and unless F answers to "handleWriteConfig".

never C writes to disk outside its owner
? C writes to disk
```

> HOLDS, and not vacuously — `? C writes to disk` names the real sites:
> `utils.ts`'s `log` (`appendFileSync`, the log line itself and its `/tmp`
> fallback) and `handlers/project-handlers.ts`'s `handleWriteConfig`
> (`writeFileSync`, the generated `.grafema/config.yaml`) — both already the
> named owners, so nothing is excused away to make this pass; it was
> already true.
> Not covered, by construction (only `writeFileSync`/`appendFileSync` are
> asked): `mkdirSync`, which appears in three more places
> (`utils.ts:49`, `state.ts:279`, `state.ts:341`) making directories, not
> writing file contents — a narrower claim than "no writer outside one
> place", named here rather than folded in silently.

## I7 · A secret read from the environment never reaches the client

```natural
I7 A secret read from the environment (GITHUB_TOKEN) never appears in a tool's returned text.
```

> Not expressible with this model, and said here instead of quietly
> narrowed. The model's dataflow is BACKWARD (`E may point to N`, "where did
> this read's value come from") and has no equivalent forward query ("where
> does this value end up") that would let a `never` follow `process.env
> .GITHUB_TOKEN` forward into a `textResult(...)` argument. Reading it
> directly is unremarkable: `handlers/issue-handlers.ts:17` reads it once
> into `githubToken`, uses it only inside an `Authorization` header
> (line 37) sent to `api.github.com`, and the text returned to the client on
> that branch is only `issue.number`/`issue.html_url` (line 51) or, on
> failure, whatever GitHub's own error body said (line 54-55, which is a
> separate, smaller concern: an upstream error body is relayed to the model
> unfiltered). What would close this properly is a taint check external to
> this model: assert no string built from `process.env.GITHUB_TOKEN` flows
> into any `content: [{ type: 'text', ... }]`.

---

> `npm run findings` was not run against this worktree's own ledger — this
> file's findings are about `/Users/vadimr/grafema`, a separate, read-only
> target, not about this ROFL tree, so they are reported in
> `examples/notebook/mcp.FRICTION.md` and this file's own prose rather than
> as `f_*` rows in `facts/findings.rofl`.
