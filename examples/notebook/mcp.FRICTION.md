# Friction — auditing the Grafema MCP server as a first-time notebook user

Context: `examples/notebook/mcp.rofl.md`, a 7-invariant reviewer's audit of
`/Users/vadimr/grafema/packages/mcp/src` (40 files, ~9.7k lines), written and
run from this worktree. `examples/notebook/small.rofl.md` and
`examples/notebook/self.rofl.md` were read first, per instructions, before
writing anything. Ordered by cost to me — time lost, wrong conclusions
almost drawn, or both.

## 1. A rule's conclusion can silently extend an EXISTING model sentence instead of declaring a new one — no error, wrong numbers, and they look plausible

Cost: highest. This is the failure mode that actually produced a wrong
belief, not just a stuck command.

I wrote:

```
A tool entry O is named T if a node P is among the `properties` of O, ...
```

expecting a brand-new relation. `"is named"` already exists in the base JS
model (`ast_name`: "a node is named a name", populated by the scanner for
every identifier). My conclusion did not create `tool_entry_is_named`; it
added a clause to `ast_name` itself. Asking `? O is named T` back returned
**12366 answers** — every named node in the whole 40-file corpus (variables,
functions, classes, every object-literal key) — with zero error, zero
warning, and output that *looks* like a real, if noisy, answer:

```
- The attribute `name` of [description at .../analysis-tools.ts:83] is "description", in the code
- The attribute `name` of [inputSchema at .../analysis-tools.ts:97] is "inputSchema", in the code
  ... 12354 more
```

`examples/notebook/self.rofl.md`'s I7 names exactly this behaviour ("a
well-formed cell that concludes a model sentence... extends the model, and
the page teaches this on purpose") as a *feature*, useful for teaching the
model new facts about an existing relation. It is also, with no way to tell
the two apart from the tool's own output, a silent trap the moment your new
sentence's wording happens to already be spoken for. The only way I noticed
was cross-checking against an independent `grep` count (I expected ~60, not
12366) — if I had expected a bigger, vaguer number I would have believed it.

Fix: rename to a phrase that collides with nothing (`has the tool name`).

## 2. Two DIFFERENTLY-WORDED sentences of the same shape can also collide

Cost: high, and it cost me twice because I did not expect a second collision
right after fixing the first.

Having renamed away from `is named`, I wrote two sentences of the identical
shape:

```
A node O has the tool name T if O is among the `elements` of some node, ...
A node SC has the dispatch label T if SC is of kind `switch_case` in file "...", ...
```

`? O has the tool name T` and `? SC has the dispatch label T` returned the
**exact same 110 rows**, tool names and all, the second query's output
printed under its own wording ("... has the tool name ...") even where I had
asked about dispatch labels. Nothing errored. I only caught it because the
two answer lists were suspiciously identical in content, not just in count.
Renaming both heads to differently-*shaped* sentences (`advertises the
tool` / `dispatches the case`) fixed it. I do not know the exact matching
rule that made two same-shaped-but-different-worded heads collide, only
that it happened, and that shape similarity — not just exact text — is
enough to trigger it.

## 3. The noun phrase in a rule's HEAD is not a condition

Cost: high (this is what caused #1 and #2's over-wide relations in the
first place).

```
A tool entry O is named T if [conditions that never mention "O is a tool entry"]
```

reads, to a newcomer, like "for O that is a tool entry, T is its name" —
`docs/md-world.md`'s own worked example, `A team T owns a module M`,
introduces T and M exactly this way, as *just* variables. The noun phrase
(`a tool entry`) is a documentation label for the parser, not a filter; if
you want the constraint, you write it out in the body:
`A node O has the tool name T if O is a tool entry, [rest]`. Nothing errors
when you forget — the relation is simply wider than you meant it to be, by
however much the omitted noun would have excluded. Combined with #1/#2,
this was the root cause of two of the three false starts in I1.

## 4. `never` on a head that failed to parse prints `FAILS · 0` — indistinguishable from a real result at a glance

Cost: high; this is a correctness trap for the READER of a notebook, not
just the writer.

Writing two alternative clauses of one head as two consecutive one-line
sentences (rather than the `either: 1. if...; 2. if...;` form) fused them
into one unreadable line and dropped the whole relation:

```
error: not read: C is a shell process start. A call C starts via a shell if C is a host site of `node` from "node:child_process" at "execSync"
error: left out: A call C starts via a shell: a condition was not read
never C starts via a shell  ->  FAILS · 0
```

`FAILS · 0` reads exactly like "checked, and there are zero violations
listed below" — it is in fact "this relation was never built, so `never`
is defined over nothing, and 'FAILS' here means the tool itself refuses to
call that a hold." A near-identical bug in a *different* relation
(`writes to disk`, same fused-clause mistake) produced the opposite verdict,
`holds`, because that `never`'s head *depended on* the broken relation
rather than *being* it — an empty precondition vacuously satisfies "no
exception". Two broken cells, two different verdicts (`FAILS · 0` and
`holds`), neither a measurement of the code, and the only tell in both
cases was the `error:`/`left out:` lines several lines above the verdict,
easy to miss when scanning straight for "holds" or "FAILS". I now read every
`error:`/`not read:`/`left out:`/`used but defined nowhere:` line before
trusting ANY `never`'s printed verdict, in either direction.

## 5. `?`/`never` take exactly one declared sentence — an inline conjunction is refused, cleanly, but the fix is not hinted

Cost: medium. Clean failure, no wrong belief, but three round trips to learn
the shape.

```
? C resolves to a function F, F answers to "ensureAnalyzed"
```

fails outright:

```
error: ? C resolves to a function F, F answers to "ensureAnalyzed": no sentence reads this question
```

Correct: the conjunction has to be a rule body, named once, asked about
by its own head (`A call C calls ensureAnalyzed if C resolves to a function
F and F answers to "ensureAnalyzed".` then `? C calls ensureAnalyzed`). The
error message is accurate but gives no hint that *this* is the fix — I only
found it by re-reading `docs/md-world.md`'s "a rule is HEAD if COND, COND"
vs. "a question is a sentence... with a variable" distinction closely.

## 6. Bare term equality is not a builtin

Cost: medium.

```
A tool name N is unwired for real if N is unwired, unless N is "onboard_project".
```

fails with `error: line 1: expected a literal or builtin` — `is` between a
variable and a plain string literal is not a generic equality test. The fix
is `examples/notebook/self.rofl.md`'s own `kernel_file` idiom: a one-row
`` `prompt_name` lists: `` table plus a positional reference,
`` unless `prompt_name`(N) ``. Having already read that file, this one cost
one round trip instead of several — worth calling out as a case where
reading the prior art first paid for itself directly.

## 7. `why`/`whynot` need a ground literal — a code AST node can never be one

Cost: medium, and easy to hit by default since almost everything in this
model is a code node.

`why C is unawaited` (C a call site) → `why needs a ground literal`. A call
site has no atom short of its internal id (`n7270fe94_17`), which is not
something you can type into a query. `why`/`whynot` are only usable on a
relation whose interesting argument is a plain string or atom — which
means, in practice, deciding this UP FRONT when designing the relation
(I1's `A tool name N is unwired`, named by the tool's string name rather
than the object node, specifically so `why "add_knowledge" is unwired`
would work) rather than discovering it after the fact.

## 8. No state carries between CLI invocations — every run re-scans and re-evaluates the whole model

Cost: cumulative, not per-incident, and already flagged in the brief as
expected. Measured here: ~9 full invocations over this session, each
40–90s (`model` time dominates; one run showed `load 82049`ms under
apparent contention from other agents' concurrent `npm` processes in the
same shared session), none of it reusable — roughly 8–10 minutes of pure
wait time for a 40-file, ~9.7k-line target. For a 20+-cell notebook refined
iteratively, batching several new/changed cells per run (rather than one at
a time) is the only lever available, and even then each round trip is
40–90s no matter how small the diff.

## 9. One run segfaulted outright (exit 139), unreproduced on immediate retry

Cost: low (a retry fixed it) but alarming the first time, with zero
diagnostic output — `npm run nb -- examples/notebook/mcp.rofl.md` exited
139 (SIGSEGV) with a truncated 4-line log and no error message at all,
immediately after another `npm run nb` invocation in the same session by a
different teammate agent. Retried seconds later against the identical file:
clean run, exit 2 (an ordinary "not everything was read"). Plausibly memory
contention from several agents running the same heavy model-evaluation
step concurrently on one machine, not a bug in this specific notebook — but
indistinguishable from one without the retry, and a crash with literally no
message is the worst version of "the tool went silent," per this project's
own standing rule that a silent failure is a fact about the tool, not proof
of anything about the code.

## 10. Reproducing a known, already-ledgered limitation on a second codebase

Not friction exactly, but worth flagging as a cost multiplier: cross-file
call resolution (`resolves_to`, and everything built from it — `may_throw`'s
interprocedural clause, any "who calls X" query across an import) does not
fire at all once the caller and callee are in different files, e.g.
`handlers/graph-handlers.ts` calling `ensureAnalyzed()` from `../analysis.js`.
This is not new: `examples/notebook/self.rofl.md`'s I5 already names it
(`f_a_call_across_directories_is_not_resolved`) on this tool's OWN source
tree. It reproduces identically on `/Users/vadimr/grafema`, an unrelated
40-file codebase, which is useful confirmation that it is a general model
limitation and not an artifact of this tree's own layout — but it means two
of my seven invariants (I2, I5) could not be checked as interprocedural
claims at all, only as single-hop ones, and I had to notice the zero-row
silence and cross-check it against a direct `grep` before trusting it either
way (see I2/I5 in the notebook itself for the full argument).

---

## What worked well

1. **`examples/notebook/self.rofl.md` earned its place as required reading.**
   Every idiom I ended up needing — the `host site of X from Y at Z` phrase,
   `F answers to "name"`, `a function F is the nearest function of C`, the
   one-row `` `table` lists: `` pattern, even the exact "a rule's conclusion
   can extend an existing sentence" trap from #1 above — was already
   demonstrated, and often explicitly warned about, in that one file.
   Reading it first (as instructed) is why I recognised several of the bugs
   above within one line of hitting them instead of several.
2. **Error messages are precise about WHERE and WHAT**, even when not about
   WHY-TO-FIX: `not read: <exact text>`, `left out: <exact head>: a
   condition was not read`, `no sentence in the vocabulary reads: <exact
   text>`. I never had to guess which line broke.
3. **`why` produces a real, file:line-anchored proof tree** once a query is
   shaped for it — see the notebook's I1 `why "add_knowledge" is unwired`,
   which walks from the tool definition's AST down to the two `[axiom]`
   scanner facts and the one `[finite failure]` that makes it unwired. This
   is exactly the debugging aid promised, and better than I expected from
   the docs alone.
4. **Pointing a notebook at a completely separate, external 40-file repo
   was a one-line front-matter change** — `code: - ../../../grafema/
   packages/mcp/src/**/*.ts` — and the `codeNames` deepest-common-directory
   naming rule produced short, stable, predictable labels
   (`grafema/packages/mcp/src/handlers/enox-handlers.ts`) with no manual
   per-file listing and no path-style mismatch (a trap I avoided only
   because `self.rofl.md`'s I6 names it explicitly).
5. **The JS model's existing vocabulary covered almost everything a
   reviewer would ask for out of the box** — host effects, `may_throw` /
   `throws_outright` / `caught_here`, `resolves_to`, `awaits`, `exported`,
   `reachable`, plus the fully generic `ast_child`/`ast_attr`/`ast_name`
   escape hatch for anything not yet named. Across 7 invariants I declared
   maybe a dozen new sentences total; the rest was composition of what was
   already there.
