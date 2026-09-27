# Friction log: auditing facts/findings.rofl with a ROFL notebook

Written while building `examples/notebook/ledger.rofl.md`. Ordered by what it
cost me, most expensive first. Every command below was run in this worktree
(`/Users/vadimr/rofl-nb-ledger`, branch `notebook-ledger`) with `timeout 120`
or less.

## 1. `npm run nb -- translate` hangs forever in this environment (cost: ~15 min, task item lost)

```
$ time (timeout 280 npm run nb -- translate examples/notebook/_translate_test.rofl.md 2>&1)
Exit code 124
( ... )  10.88s user 2.36s system 4% cpu 4:40.06 total
```

10.9s of CPU time against 4m40s of wall time: the process is blocked, not
computing. `notebook/cli.ts`'s `claude` helper is `spawnSync('claude', ['-p',
'--model', 'sonnet', '--tools', ''], { input: prompt, timeout: 300_000 })`.
Called directly with a trivial prompt it returns in 15–40s:

```
$ echo "say hi in one word" | timeout 60 claude -p --model sonnet --tools ''
Hi
( ... )  9.32s user 1.81s system 75% cpu 14.829 total
```

Fed a 14-line synthetic prompt shaped like the translator's real one — the
sentence-form rules, "the notebook as it stands", a request to "answer with
the cell alone inside one \`\`\`rofl fence" — the *same* bare `claude -p`
call (no node, no notebook code involved) hangs the same way:

```
$ time (timeout 90 claude -p --model sonnet --tools '' < /tmp/bigprompt.txt 2>&1)
Exit code 124
( ... )  10.36s user 2.19s system 13% cpu 1:30.41 total
```

Isolated further: a prompt with the same instructions but *no* triple-
backtick fence in it answers in ~23s; the prompt shape and length alone
(without a fence) are not the trigger, and re-testing the trivial prompt
immediately after a hang still returns in 15-25s, so it is not a stuck lock
on shared session state either. The fence is implicated, not proven — I
could not narrow further within budget. **This may be specific to invoking a
nested `claude -p` from inside an already-running Claude Code session that
is itself part of a multi-agent team** (this task was run that way); I have
no way to test the unnested case from here. Either way, the practical result
was the same for a user of this tool: the translator could not be exercised,
so the notebook records the attempt and its evidence rather than the "what
it got right/wrong" the task asked for.

## 2. `Rofl.query()` silently drops rows on an ad-hoc conjunctive query with `not` (cost: ~20 min, a real correctness bug)

Minimal repro, no ledger involved:

```
$ node --experimental-strip-types probe.ts   # p(1). p(2). p(3). q(1).
ad-hoc  p(X), not q(X)      => 0 (want 2: X=2,3)
as rule r(X)                => 2 (want 2)
ad-hoc  not q(X), p(X)      => 0 (reordered)
```

Calling `Rofl.query('p(X), not q(X)')` directly answers **0** (silently
wrong: the two correct rows just never appear); loading the identical clause
as a named rule (`r(X) :- p(X), not q(X).`) and querying `r(X)` answers **2**
(correct). No error, no warning, no diagnostic either way — just a wrong
number where the count is later checked against ground truth. On the real
ledger this cost real time: I first "confirmed" `finding(F,_), not
demands(F,_)` was empty (0) with an ad-hoc query, wrote the notebook's N1
around that belief, and only caught it because the *notebook itself*
(which forces the rule-then-`never` pattern, see #3) answered 148 for the
same clause. Re-checked every other "0" I had gathered the same way; two
more turned out wrong too (`open_finding(F), not demands(F,_)` — really 15,
not 0; and I had never even tried the multi-artifact case, which is 116, not
0). This is not about the notebook — it lives in `src/api.ts`'s ad-hoc query
path — but anyone exploring a `.rofl` world with a throwaway script (which
`npm run repl` and any custom probe both invite) will hit it, and it will
look like a legitimate, if surprising, negative result.

## 3. `never <bare predicate>` parses in a `datalog` cell, not in a `rofl` cell or the REPL (cost: ~10 min)

```
$ printf '? unproven_misaimed(F)\nnever unproven_misaimed(F)\n' | node --experimental-strip-types src/repl.ts facts/findings.rofl rules/findings.rofl
rofl> (empty)
rofl> line 1: expected '(', got 'unproven_misaimed'
```

`docs/md-world.md` states "The positional form still works everywhere: `?
blocked(C, T)`" — true for `?`, and for `why`/`whynot`, but not for `never`:
a bare `relation(Args)` after `never` is a parse error at the REPL and an
`error: not read` inside a `rofl`-fenced notebook cell. It works fine inside
a `datalog`-fenced cell, where the whole line is read as a literal clause
rather than through the sentence-form grammar. Nothing in the docs or the
error message says "move this to a `datalog` cell"; I found the fix by
noticing `? unproven(F)` (same cell) worked while `never unproven_misaimed(F)`
didn't, and testing the REPL to isolate which directive kind was the problem.
Practical rule for a world with no declared sentences (like this ledger,
where every relation is plain Datalog): **`rofl`-fenced cells are close to
unusable for anything beyond `?`; write `datalog` cells instead.**

## 4. A perspective-qualified relation answers "empty" instead of an error under its bare name (cost: ~10 min, and it would have shipped a false "holds")

```
examples/notebook/ledger.rofl.md:213: never unproven_misaimed(F)  ->  FAILS · 0
```

`rules/findings.rofl` defines `unproven_misaimed[audit](F) :- ...` — a
relation in the `audit` book/perspective. Asking about the *bare* name
`unproven_misaimed(F)` (no `[audit]`) is asking about a different,
genuinely-unpopulated relation. `?`/`why` at the REPL answer this bare name
with a clean, unremarkable `(empty)` — indistinguishable from a real zero —
and only the notebook's own `never` handling caught it, because it separately
tracks "0 rows" from "nothing in the model can conclude this at all"
(`unpopulatable`) and refuses to call the second case a hold. That refusal is
the single reason I noticed the perspective was dropped; without a `never`
line specifically, I would have shipped "holds, 0 misaimed" on a relation
that cannot ever answer anything. This is the tool's own "silence is not
green" design working exactly as intended (`examples/notebook/self.rofl.md`
I3) — flagged here as friction only because the *positive* case (`?`/`why`)
gives no such protection, so the same mistake elsewhere would go unnoticed.

## 5. A notebook's cells share one flat, pre-assembled model — there is no "session" (cost: ~10 min, changed the notebook's structure)

`notebook/kernel.ts`'s `run()` calls `assemble()` once over the *whole* file
and loads the result in a single `host.init` before any cell's directive
lines execute. I had written N6 as "first, `never deadlocked(A,B)` on the
real data (holds); now inject a synthetic cycle in the next cell; recheck
(fails)" — and the *first* cell already reported the post-injection answer,
because by the time either cell's directives run, both cells' data is
already loaded. `self.rofl.md`'s own I1–I8 read as sequential narration
("Step 1... Step 2...") but never actually rely on an EARLIER cell seeing a
state a LATER one hasn't added yet, so this doesn't show up there. Fixed by
combining the injection and the failing check into one cell and sourcing the
"clean" baseline from outside the file (a separate `Rofl()` instance over
just the two source files). Worth a line in the docs: cells accumulate
declaratively for the whole file, not incrementally as you'd read top to
bottom.

## Smaller items

- **Plain `.rofl` atoms are bare words; the sentence form's backtick-quoted
  atoms (`docs/md-world.md`: "An atom is in backticks, `` `true` ``") are a
  parse error outside it.** `examples/notebook/gen_ledger_facts.ts` first
  generated `` reason_shape(F, `atom`). `` and the whole generated file was
  rejected: `line 267: unexpected character '\`'`. Fixed by emitting bare
  `atom`/`string` instead. Cost: one debug cycle, caught immediately by
  testing the generated file in isolation before trusting it in the
  notebook.
- **`translated()` (`notebook/front.ts`) only recognises a `rofl`-fenced
  cell as an answer to the natural cell above it** (`cells[c.index +
  1]?.kind === 'rofl'`) — a correct, working `datalog` answer still reports
  "not translated yet: \`npm run nb -- translate\` writes the rofl cell
  below it". Cosmetic (the check still runs and holds), but confusing:
  it reads as "this invariant has no answer yet" when it does.
- **Error line numbers for a `reads:`-appended plain `.rofl` file are
  reported against the whole assembled model, not the source file** — an
  early debugging session saw `error: line 7895: unexpected character
  '\`'` with my own file barely 300 lines long; the real location
  (`examples/notebook/ledger_facts.rofl:267`) had to be found by loading
  that file alone through the REPL instead.
- **`node_modules` was not installed in this worktree** (`git worktree`
  copies tracked files only) — `npm run nb` failed with
  `ERR_MODULE_NOT_FOUND '@babel/parser'` before anything notebook-specific
  ran. `npm install` (2s) fixed it; not a tool defect, just the first thing
  anyone opening a fresh worktree will hit.
- **The ledger's own data is not perfectly uniform**, which the generator
  had to handle defensively: one `dismissed(...)` call
  (`facts/findings.rofl:4598`) wraps its second argument onto an indented
  second line, unlike every other occurrence; a few `addressed_by`/
  `artifact_removed` rows have irregular spacing after the comma. A regex
  written against the common case (`, "` — comma, one space, quote) silently
  undercounted by a handful of rows until loosened to `,\s*"`. This is a
  fact about `facts/findings.rofl`'s history (~6955 lines, hand-edited over
  a long time), not about the notebook tool, but it is exactly the kind of
  gap a positive control catches and a spot-check misses.

## What worked well

- **Reading two large, unrelated plain `.rofl` files via `reads:` just
  works**, appended verbatim (`notebook/world.ts` `assemble`: anything not
  ending `.rofl.md` is appended as-is) — no adaptation needed to point a
  notebook at an existing project's rule files.
- **The load+run loop is fast even over the whole ~7000-line assembled
  model**: consistently `load ~700-1100ms, run <1s` for every version of
  this notebook, an easy loop to iterate in.
- **`why`/`whynot` produce genuinely legible, complete proof trees**,
  including a `whynot` nested inside a `why` when a negated premise itself
  needs explaining (N6) — this is what actually let me find the real cause
  behind each surprising answer, not just that it was surprising.
- **The "silence is not green" design is not a slogan here — it caught two
  of my own mistakes** (the dropped `[audit]` perspective in #4, and would
  have caught the `Rofl.query()` bug in #2 too, had I written that check as
  a notebook `never` from the start instead of a throwaway script).
- **`examples/notebook/self.rofl.md` is a genuinely good model to copy**:
  its convention of keeping a deliberately-false invariant with a prose note
  explaining why, rather than deleting it, is exactly what let N1 and N6 stay
  honest about what didn't work on the first try.
