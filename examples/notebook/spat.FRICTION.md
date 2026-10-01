# Friction log: reviewing a household week with a ROFL notebook

Written while building `examples/notebook/spat.rofl.md`, a parent's review of
`examples/spat/week.example.rofl`. Ordered by cost, most expensive first.
Every command below was run in this worktree
(`/Users/vadimr/rofl-nb-spat`, branch `notebook-spat`) with `timeout 120` or
less. Neither `examples/spat/spat.rofl` nor `examples/spat/week.example.rofl`
was edited to produce any of this — everything below is either a query over
them unchanged, or a fact added in a file under `examples/notebook/`.

## 1. `why`/`whynot` are a complete, trustworthy audit trail and not remotely legible to a parent (cost: no time lost, but this is the central finding the task asked for)

The task asks directly how this reads to the tool's stated audience. It does
not: `why uncovered(nico, thu, 1080)` — the exact question `spat whynot nico
thu 18:00` in `examples/spat/README.md` is built to answer for a parent —
gives, correctly and completely:

```
uncovered[main](nico,thu,1080)  <= r4890a8bb @tick 0
  needs_cover[main](nico,thu,1080)  <= r5ea808c7 @tick 0
    awake_at[main](nico,thu,1080)  <= r665d3537 @tick 0
      awake[main](c_sleep,nico,alldays,420,1200) [axiom]
      applies_on[main](alldays,thu)  <= r7933e3ca @tick 0
        day[main](thu,4) [axiom]
      slot[main](thu,1080)  <= r41dff8c5 @tick 0
        day[main](thu,4) [axiom]
        hh[main](18) [axiom]
        mm[main](0) [axiom]
        1080 is +(*(18,60),0) [builtin]
      ...
      not waived[main](c_sleep) [finite failure]
        whynot waived[main](c_sleep):
          no rule concludes 'waived' and no matching base fact exists
    not at_sup[main](nico,thu,1080) [finite failure]
      whynot at_sup[main](nico,thu,1080):
        rule r277d76b1: at_sup[main](?Ch,?D,?S)@now :- span[main](?_$0,?_$1,?Ch,?Pl,?D,?F,?T)@now, ...
          failed premise: 1080 < 810 [builtin fails]
    ...
  not any_duty[main](thu,1080) [finite failure]
    whynot any_duty[main](thu,1080):
      rule rc348a7bb: any_duty[main](?D,?S)@now :- on_duty[main](?_$0,?D,?S)@now
        failed premise: on_duty[main](?_$0#2,thu,1080)
```

(full tree in `/tmp/spat_final.out`, cell 6). This is *correct* — every step
checked against the source rules and facts by hand while writing R1 — and it
is *complete*: it goes down to axioms, and nests a `whynot` inside the `why`
exactly where a negated premise itself needs unpacking. But the actual
answer a parent wants ("nobody was there because Alex was at Acme and Robin
was swimming") is not in this tree at all — it is one level further out, in
`out_why`, a *different* relation the model's author built specifically to
carry the attribution `why`/`whynot` do not. Reading the tree itself
requires knowing: `[main]` is a book qualifier, `@tick 0` is an artifact of
an engine discipline that does not otherwise matter here (`spat.rofl`'s own
"no `@next` ticks"), `?_$0#2` is a fresh existential the reader renamed,
`[finite failure]` and `[builtin fails]` are engine vocabulary, and
`1080 is +(*(18,60),0)` is prefix arithmetic for `18:00`. None of that is
addressed to the person asking "why wasn't anyone with my kid" — it is
addressed to whoever wrote the rules. The tool's actual answer to a parent's
question lives in a sibling relation (`out_why`) built by the model's
*author*, not surfaced by `why`/`whynot` themselves; the general-purpose
explanation facility and the domain's own purpose-built one are two
different things wearing the same command name.

## 2. Every answer is minutes since midnight, with no help converting back (cost: small each time, paid on every single answer)

`uncovered(kit, thu, 1060)` — every time. `week.example.rofl` ships a
lookup table in its own header comment (`07:00 = 420 ... 22:00 = 1320`)
precisely because the numbers are not readable on sight, and that table is
prose, invisible to the engine, so it never reaches an answer. Writing R1
required manually computing `1060 / 60 = 17.67` → 17:40 for every row, by
hand, for a file whose stated audience is a parent glancing at their week,
not a programmer comfortable converting base-60 by eye. `spat.ts` (outside
this notebook) presumably has a formatter for its own CLI output
(`spat whynot` in the README shows `18:00`, not `1080`) — none of that
reaches a `.rofl.md` notebook's own `?`/`why` output, which prints exactly
what the engine returns.

## 3. A `rofl`-fenced (sentence-form) cell cannot reference a relation a plain `.rofl` file only ever *derives* — so almost none of `spat.rofl`'s ~90 relations are reachable from the form the notebook is named after (cost: ~15 min, and it reshapes the whole file)

```
$ npm run nb -- examples/notebook/spat.rofl.md   # (R1's first attempt, kept in the file)
error: not read: uncovered(Ch, D, S)
error: left out: A child Ch is left alone at day D slot S: a condition was not read
  never Ch is left alone at day D slot S  ->  FAILS · 0 · nothing in the model can put a row here: check the name, the book and the number of arguments
```

`examples/notebook/ledger.rofl.md` hit the same wall over `facts/findings.rofl`
(its own friction #3) and the fix there was "write `datalog` cells instead."
That fix is available here too, and this file uses it throughout — but it is
worth stating plainly what it costs specifically for SPAT: `spat.rofl` is a
large (~520-line), carefully-commented, genuinely well-designed rule file
about exactly the kind of thing a parent would ask about in plain language
("is anyone covering my kid"), and precisely because it was written as plain
Datalog rather than as sentence-form, a notebook cannot ask it a plain-
language question about *any* of its own derived relations (`uncovered`,
`out_why`, `sole`, `run_fragile`, `zero_slack`, ...) without either (a)
writing `datalog` cells with positional Datalog syntax — the same syntax the
`.rofl.md` form exists to move away from — or (b) hand-declaring a sentence
for every relation worth asking about, which is real, upfront authoring work
nobody has done for this file. `docs/md-world.md`'s own worked example
(`review.rofl.md`) only avoids this because its handful of relations are
declared as sentences from the start, in the same file. A domain module this
size, written the way `spat.rofl` actually is, is exactly where the
`.rofl.md` form is least available — the opposite of where its own pitch
("general invariants a family would want... in plain language") points.

## 4. No "session": a what-if needs a second file, not obvious until it silently fails to show one (cost: ~10 min, known in advance from `ledger.FRICTION.md`, still cost real time to work around correctly)

`notebook/kernel.ts`'s `run()` assembles the *whole* file into one model
before any cell's directives execute, so a fact asserted in a late cell
already applies to an early one. Confirmed again here, independently of the
prior finding in `examples/notebook/ledger.FRICTION.md` #5: a first attempt
at R1's what-if, sketched as "assert `waived(c_swim).` in a later cell, then
point at the earlier `uncovered` query as the before", would have shown the
*after* answer in both places, silently — no error, no warning, just one
number where two were expected. The working fix is the same one `ledger`
used: put the "after" in a separate sibling file
(`examples/notebook/spat_whatif.rofl.md`, reading the same two `examples/spat`
files plus one added fact in `whatif_waive_swim.rofl`) and treat the
unmodified `spat.rofl.md` as the "before". This works cleanly and is a
reasonable idiom once known — the friction is entirely that nothing in
`docs/md-world.md` says a notebook cannot show a before/after itself, so the
natural way to write a what-if (one file, two moments) has to be discovered
by hitting the wall, not read in advance.

**Directly answering the brief's question** — is a what-if possible within
one notebook: no, not within one file's cells; yes, trivially, across two
files that both `reads:` the same base world and differ by one small fact
file. That is a usable pattern, not a limitation that blocks the task, but
it means "notebook" here is closer to "one fixed lens over a world" than to
"a scratchpad you narrate step by step," despite the file's own prose
reading as sequential narration.

## 5. `node_modules` was not installed in this worktree (cost: ~1 min, first thing anyone hits)

```
$ npm run nb -- examples/notebook/review.rofl.md
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@babel/parser' imported from .../scanners/js_ast.ts
```

`git worktree` copies tracked files only. `npm install` (a few seconds)
fixed it. Same finding as `examples/notebook/ledger.FRICTION.md`'s smaller
items — recorded again here only because it is the very first command this
task's brief tells a new user to run, and it fails on a fresh worktree every
time until this is known.

## Smaller items

- **`reads:` paths are relative to the notebook file's own location, not the
  process's cwd** (`docs/md-world.md` does say this). A scratch probe placed
  in `/tmp` with `reads: [examples/spat/spat.rofl, ...]` (paths that are
  correct relative to the repo root) failed with a clear, specific `ENOENT`
  naming the exact wrong path it tried — good error, self-inflicted mistake,
  fixed by moving the probe file into the tree. Worth a line only because it
  is an easy trap when scripting a one-off check anywhere other than beside
  a real notebook.
- **A `natural` cell answered only in prose (no code cell under it) reports
  "not translated yet" (R6 here)** — the exact cosmetic gap
  `examples/notebook/ledger.FRICTION.md`'s smaller items already named
  (`translated()` in `notebook/front.ts` only recognises a `rofl`-fenced
  cell as an answer). Reconfirmed independently in this file rather than
  assumed from the prior report.

## What worked well

- **`never`, and here also the plain `?`, correctly refuse to call an
  unpopulatable relation a hold or a real zero**, inside the notebook: R1's
  first attempt (`uncovered` never declared as a sentence) reports
  `0 answers · nothing in the model can put a row here: check the name, the
  book and the number of arguments` on the bare `?` line, not a silent
  `(empty)`. `examples/notebook/ledger.FRICTION.md`'s #4 found the opposite
  at the raw REPL for a different cause (a dropped book qualifier) — the
  notebook layer's own handling is the safer one, confirmed again here.
- **Reading two large, unrelated plain `.rofl` files via `reads:` just
  works**, appended verbatim, no adaptation — `spat.rofl` (~520 lines) and
  `week.example.rofl` (~300 lines) loaded together with zero friction, same
  as `ledger.FRICTION.md` found for its own two files.
- **Fast**: `load ~450-1150ms, run 150-460ms` for every version of this
  notebook, including the 20-cell final file and both what-if runs — an easy
  loop to iterate in, even while re-deriving a ~90-relation model each time.
- **`why`/`whynot` are genuinely complete and correct** (see #1's caveat on
  *legibility*, not correctness) — nested `whynot`-inside-`why` for a failed
  negated premise (`any_duty` inside R1's tree) is exactly the tool this
  task needed to find the real cause behind a surprising answer, not just
  that it was surprising.
- **The model's own source comments were accurate predictions of what it
  would compute**, checked, not assumed: `week.example.rofl`'s comment on
  moving the swim to Thursday ("the evening Алекс is at Acme and the няня
  does not come") is exactly R1's finding, independently derived by the
  engine; `travel(physio, sadik, 5)`'s comment ("INFERRED, and load-bearing:
  see `spat fragile`") is exactly R2's finding. The tool's authors had
  already spotted both problems in prose; the notebook reproduces both
  computationally, with the two exact minutes attached.
- **The sibling-file what-if pattern (see #4) is clean once known**: two
  files, one added fact, directly comparable numbers, no editing of either
  source file in `examples/spat`.
