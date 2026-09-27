---
world: ledger-health
books: main
default: main
model: none
reads:
  - ../../facts/findings.rofl
  - ../../rules/findings.rofl
  - ledger_facts.rofl
---

# Is the ledger healthy

> A notebook over the project's own organisational memory,
> `facts/findings.rofl` (~968 findings, rendered by `npm run findings`), with
> the disposition rules that already govern it, `rules/findings.rofl`
> (`settled`, `open_finding`, `proven`, `ready`, and a handful of audits:
> `note_lost`, `two_minds`, `corrected_unsettled`, `unproven_misaimed`). Both
> files are plain `.rofl`, so `reads:` appends them as-is (`notebook/world.ts`
> `assemble`: anything not ending `.rofl.md` is appended raw).

## A first probe

```rofl
? open_finding(F)
```

> 223 answers, matching `npm run findings`'s own count on the same checkout
> (`223 open, 745 settled`). The two derived rules that carry the ledger's own
> discipline, `settled/1` and `open_finding/1`, are already in
> `rules/findings.rofl` — this notebook does not redefine them, it asks
> questions of them the rendered report never prints: `runtime/report.ts`
> loads `rules/findings.rofl` (`FINDINGS_RULES`, `loadInquiryKernel`) for
> `open_finding` and `finding_action` alone, so every audit rule below —
> `note_lost`, `two_minds`, `corrected_unsettled`, `unproven_misaimed`,
> `ready`, `waiting` — is already computed on every `npm run findings` and
> printed nowhere. This notebook is the first thing that reads them.

## N1 · nothing sits undecided

```natural
N1 Every recorded finding has been given a disposition to work toward: it states what it demands. Nothing sits in the backlog, open or not, with no stated need at all.
```

> `demands(F, What)` is the ledger's own "what this needs" column
> (`rule_and_test | kernel_test | doc | decision | ...`); a finding with none
> is one nobody has yet decided how to close.

> First step, written the way a `rofl` sentence-form cell reads a condition
> (a declared sentence, not a bare `predicate(Args)`), and it does not load:

```rofl
A finding F is undecided if F demands nothing.

never F is undecided
```

> `error: not read: F demands nothing` — "demands" is not a declared
> sentence over `demands/2` (only the positional form is, from plain
> Datalog), and the sentence form has no built-in for "no such row exists"
> outside a proper `not`-condition on a *declared* sentence. **Second step**,
> moved to a `datalog` cell, where a rule body is a literal ROFL clause and
> `not` is the engine's own negation:

```datalog
undecided(F) :- finding(F, _), not demands(F, _).

never undecided(F)
```

> **FAILS · 148 — I was wrong, not the ledger.** I had assumed (and first
> wrote here) that this holds, because CLAUDE.md's ledger convention reads
> as if every finding gets a disposition; I had even "confirmed" 0 with an
> ad-hoc query: `Rofl.query('finding(F, _), not demands(F, _)')` called
> directly (`src/api.ts`) answers `{ rows: [], error: "line 1: expected
> 'eof', got ','" }` on this exact tree — `query()` takes one literal, a
> conjunction is refused, and I read only `.rows.length`, never `.error`,
> so a refusal looked exactly like a legitimate zero. Asking the *same
> clause* as a named rule's body, the way this cell now does, is not a
> workaround for a bug — it is simply the one form `query()` accepts — and
> it answers **148**, verified a third way with plain `comm` over two
> `grep` extractions on `facts/findings.rofl`, no engine involved: 148.
> **The friction is real even though the engine is not wrong**: a refused
> ad-hoc conjunction and a genuine empty answer share the same `rows: []`
> shape, and nothing prompts a caller to check `.error` before trusting it.
> `npm run findings` never asks an ad-hoc negated conjunction
> (`runtime/report.ts`'s `col()` always queries a single already-named
> relation), so the rendered ledger report was never at risk — only my own
> exploratory probes, which read `.rows.length` alone, were.
>
> `whynot` on one of the 148, asked of the *notebook's own* relation:

```datalog
whynot undecided(f_1_05_is_the_form_as_a_source_and_the_ring_1_reader_is_background_refactoring)
```

> answers `` `f_...` is undecided holds; nothing to demonstrate `` — `whynot`
> only has something to say about an absence, and this one is present.
>
> Narrowed to what actually matters for triage — an OPEN finding with no
> stated need is worse than a settled one nobody bothered to backfill it for:

```datalog
open_undecided(F) :- open_finding(F), undecided(F).

? open_undecided(F)
```

> 15, not 0 — and they are already visible without this notebook, just
> unlabelled: `npm run findings` prints `[Kind → unspecified]` for exactly
> these, `wants || 'unspecified'` in `runtime/report.ts`'s
> `findingsSection`. `grep -c '→ unspecified\]' ` on a fresh render: 15.
> Real, open, undemanded findings, among them
> `f_the_tick_log_is_the_one_key_order_the_loosening_does_not_free`,
> `f_determinism_covers_the_engine_not_the_host_loop`, and
> `f_a_fork_of_the_js_model_rederives_everything_so_a_run_costs_the_same_on_one_line`
> — nobody has yet said what closing them would take. `finding_note` and
> `recorded` are, separately, universal over all 968 (checked the same
> way, as named rules, not shown twice) — this specific gap is `demands`
> alone.

## N2 · a settlement is single-minded

```natural
N2 A finding's settlement is single-minded: it is not both repaired and refused, however the refusal is spelled.
```

> `rules/findings.rofl` already derives `two_minds[audit]` for
> `addressed_by` against `dismissed`. `artifact_removed` is a second way to
> say "no longer being repaired" (the repair's artifact left the tree), so
> the same contradiction can hide behind it too, unchecked by that rule.

```datalog
two_minds_extra(F) :- addressed_by(F, _), dismissed(F, _).
two_minds_extra(F) :- dismissed(F, _), artifact_removed(F, _).

never two_minds_extra(F)
```

> Both hold, empty. `addressed_by` and `artifact_removed` DO overlap — 93
> findings whose repair was later removed from the tree — and that overlap
> is the ledger working as designed (`note_lost[audit]` exists precisely so
> that case keeps its `finding_note`), not a contradiction; the invariant
> above is about the *refused* side, which never crosses either.

## N3 · a dismissal gives a reason, not a placeholder

```natural
N3 A dismissed finding's reason is worth reading: no dismissal is closed with an empty or one-word placeholder standing in for an argument.
```

> Not expressible over `facts/findings.rofl` alone: the sentence form's only
> built-ins are `X is Y`, `X differs from Y`, `N > M`, `N is A + B` — no
> length or substring primitive over a string or atom (checked in
> `src/engine.ts`; nothing there is reachable from a ROFL program). `Reason`
> is also written two different ways with no declared discriminator —
> `dismissed(F, bun_is_ci_only)`, a bare atom, for 31 of 38 rows, and
> `dismissed(F, "the cost gates were removed: ...")`, a quoted string, for
> the other 7 — so even "is it a string" cannot be asked directly.
>
> Bridged the same way the filesystem is bridged below: a length cannot be
> computed inside the model, so it is computed once outside it and read in
> as a fact (`examples/notebook/gen_ledger_facts.ts`, run by hand, writes
> `examples/notebook/ledger_facts.rofl`: `reason_len(F, N)`, the character
> count of whichever of the two Reason wrote as; `reason_shape(F, atom|string)`
> alongside it, since the split itself is worth seeing).

```datalog
thin(F) :- reason_len(F, L), L < 10.

never thin(F)
? reason_shape(F, S)
```

> Holds — the shortest reason on the tree is `bun_is_ci_only` at 14
> characters, itself a complete claim, not a placeholder; no threshold up to
> 14 finds anything. `reason_shape` lists 31 `atom` against 7 `string`,
> confirmed by direct count on `facts/findings.rofl` (`grep -c`); the split
> is real but not a health problem — every dismissal argues its refusal
> either way, the seven quoted ones happening to be the longer, more
> discursive reasons (up to 152 characters, one text shared verbatim by six
> findings dismissed together in one sweep — a legitimate batch, not
> copy-paste laziness: checked by hand that the six are the same "cost gates
> were removed" cluster).

## N4 · unproven work is never silently offered

```natural
N4 A finding that demands code or a test is never queued as ready to work until someone has run the premise it stands on and written down what it returned.
```

> Already the point of `witness`/`proven`/`unproven` in `rules/findings.rofl`
> (three real DEFECTS this exact machinery was built to stop recurring, per
> its own comments), and `unproven_misaimed[audit]` guards the guard: an
> unproven item that demands neither `rule_and_test` nor `kernel_test` would
> mean the refusal is firing on the wrong `demands` value.

```rofl
? unproven(F)
```

> `? unproven(F)` is positional form in a `rofl` cell and reads fine (48
> answers, matching `rules/findings.rofl`'s own definition) — "the positional
> form still works everywhere" (docs/md-world.md) is demonstrated for `?`.
> `never unproven_misaimed(F)`, same cell, same form, does not:
> `error: not read`, and the REPL says more plainly why —
> `never unproven_misaimed(F)` alone gives `line 1: expected '(', got
> 'unproven_misaimed'`. Positional form is not, in fact, everywhere: `?`,
> `why`, `whynot` take it; `never` wants a declared sentence unless it is
> asked from a `datalog` cell, where a directive line is read the way the
> whole cell is — as a literal clause, not prose. Moved:

```datalog
never unproven_misaimed(F)
```

> Still not what it looks like: `FAILS · 0` — zero rows, and still refused
> as a hold, because `rules/findings.rofl` writes the head as
> `unproven_misaimed[audit](F)`, a PERSPECTIVE-qualified relation (`[audit]`
> is a book, `docs/md-world.md`'s "A book is a block"), and the bare name
> without it is a *different*, genuinely empty-by-construction relation that
> nothing in the model concludes into at all — `unpopulatable`, in the
> engine's own word, which is exactly why the notebook refuses "holds" here
> (I3 in `examples/notebook/self.rofl.md`: "a relation nothing can populate
> is a failure, not a hold"). The bare `? unproven_misaimed(F)` at the REPL
> answers `(empty)` just as cleanly as the real one would, with nothing to
> tell the two apart — this check is the only reason I noticed the
> perspective was dropped. Correctly qualified:

```datalog
never unproven_misaimed[audit](F)
```

> Holds. 48 unproven, 0 misaimed. `ready_proven(F)` (ready and not unproven) has 173
> rows against 221 `ready` — 48 open, ready-by-priority findings are
> nonetheless held back for want of a witness, which is the mechanism
> working, not a gap.

## N5 · a settlement points at something real

```natural
N5 A finding settled by pointing at an artifact points at something that still exists — unless its disappearance is itself on the record.
```

> The one invariant this ledger states about itself in words
> (`rules/findings.rofl`'s own comment on `note_lost`) and cannot state in
> ROFL: "a settlement must cite something that exists" is a fact about the
> **host filesystem**, and no relation in `facts/findings.rofl` or
> `rules/findings.rofl` ever asks the disk anything — `addressed_by(F, P)`
> is a string, not a lookup. Bridged the only way available: a generator run
> by hand, outside the notebook (`examples/notebook/gen_ledger_facts.ts`,
> the same one N3 uses), reads every path cited by `addressed_by` or
> `artifact_removed` in `facts/findings.rofl`, checks each once with
> `existsSync`, and writes `path_exists(P)` for the ones still there. The
> notebook's `reads:` appends the result (`ledger_facts.rofl`) as a plain
> `.rofl` file, same as the ledger itself — from inside the model, a
> generated fact and a hand-written one are indistinguishable, which is
> exactly what makes the bridge work at all.

```datalog
stale_repair(F, P) :- addressed_by(F, P), not path_exists(P), not artifact_removed(F, _).
removed_but_present(F, P) :- artifact_removed(F, P), path_exists(P).

never stale_repair(F, P)
never removed_but_present(F, P)
```

> Both hold. Every one of the 217 distinct paths `addressed_by` cites is on
> disk right now, and every one of the 129 distinct paths `artifact_removed`
> cites is gone — checked twice, once through the model here and once
> outside it entirely with a shell loop over `[ -e "$p" ]`, matching row for
> row. This is the ledger convention (CLAUDE.md's `addressed_by`/`dismissed`
> discipline, and the ledger's own `note_lost[audit]`) actually holding on
> disk, not just in the note beside it — the one invariant in this notebook
> where the answer is "clean" without any caveat about what the model could
> not see, because the generator looked at literally every candidate path
> the ledger names.

## N6 · the priority queue cannot deadlock

```natural
N6 The order the ledger works its backlog in has no cycle: a finding that blocks another is never itself waiting on it, directly or through a chain.
```

> `rules/findings.rofl`'s own comment claims the strong form of this for
> free: "a circular queue would be refused by the same machinery that
> refuses a circular program." `blocks/2` is ground data (`edb`, not a
> derived rule), and `waiting`/`ready`/`blocked_by` only ever look at the
> *direct* blocker of a finding, so nothing about the rules themselves is
> recursive — which means nothing about them can detect a cycle in the data
> either. The real graph is small (10 edges) and a DAG: checked three ways
> outside this file (`comm`/`python3` over `grep`, no engine; and
> `Rofl().query('deadlocked(A,B)')` over the two source files alone) because
> it cannot be checked *inside* it — the next cell adds a synthetic cycle as
> plain data, and a notebook's cells are not a session: `notebook/kernel.ts`
> assembles every cell's clauses into ONE model and loads it once
> (`assemble`, then a single `host.init`) *before* any cell's directive
> lines run, so a `never` in an earlier cell still sees data a later cell
> adds — there is no "before" to show inside one file, only inside two.

> **Broken on purpose** — the same way a planted mutant proves an oracle can
> say no (CLAUDE.md's own rule for a gate): two real, currently-unrelated
> open findings, made to block each other. This is DATA added in a cell,
> the same standing as any other fact a notebook cell contributes — it is
> not editing `facts/findings.rofl`, and it is why this file's own overall
> exit stays non-zero even once every real invariant above holds (like
> `examples/notebook/self.rofl.md`'s I7, deliberately false and said so).

```datalog
deadlocked(A, B) :- waiting(A), waiting(B), blocks(A, B), blocks(B, A).
blocks(f_a_blindness_can_have_no_cell, f_a_budget_kill_decays_into_a_green_gate_that_says_nothing).
blocks(f_a_budget_kill_decays_into_a_green_gate_that_says_nothing, f_a_blindness_can_have_no_cell).

never deadlocked(A, B)
```

> **FAILS.** The load does not refuse it — no error, no diagnostic, the file
> is accepted exactly as written, and the two findings are now each
> permanently `waiting` on the other:

```datalog
? waiting(f_a_blindness_can_have_no_cell)
why waiting(f_a_blindness_can_have_no_cell)
? ready(f_a_blindness_can_have_no_cell)
whynot ready(f_a_blindness_can_have_no_cell)
```

> `waiting` holds, and `why` gives the whole proof down to the facts:
> `blocks(f_a_budget_kill_decays_into_a_green_gate_that_says_nothing,
> f_a_blindness_can_have_no_cell)` as an axiom, then `not settled(...)`,
> itself explained by a nested `whynot` over the three ways to settle —
> `addressed_by`/`artifact_removed`/`dismissed` — none holding, which is
> just true (the finding is genuinely open). `ready` does not hold, and
> `whynot` names exactly why: the failed premise is `not
> waiting(f_a_blindness_can_have_no_cell)` — which is also, symmetrically,
> true of the other one. **The comment in
> `rules/findings.rofl` is wrong as stated**: nothing refuses a circular
> `blocks` pair, the load succeeds, and the two findings simply vanish from
> `ready` forever, silently, with no audit relation flagging the pair the
> way `note_lost`/`two_minds`/`corrected_unsettled` flag their own hazards.
> `deadlocked/2` above is not in `rules/findings.rofl` — I wrote it here, for
> this notebook, because nothing already there would have caught this.
> There is no cycle in the real 10 edges today, so this is a latent gap, not
> a live incident — but the mechanism that was believed to prevent one does
> not exist.

## N7 · the ledger's own schema describes the ledger

```natural
N7 The vocabulary the ledger's schema comment documents is the vocabulary the ledger actually uses: every Kind a finding is recorded with, and every What a finding demands, is one the header names.
```

> `rules/findings.rofl`'s header comment is the closest thing this ledger
> has to a schema: `finding(F, Kind) Kind: insight | pitfall | question |
> idea` and `demands(F, What) What: rule_and_test | kernel_test | doc |
> decision`. Declared here as the same four-and-four, so the check is
> against the documented words, not a copy of the data:

```datalog
documented_kind(insight). documented_kind(pitfall). documented_kind(question). documented_kind(idea).
documented_demand(rule_and_test). documented_demand(kernel_test). documented_demand(doc). documented_demand(decision).

undocumented_kind(F, K) :- finding(F, K), not documented_kind(K).
undocumented_demand(F, W) :- demands(F, W), not documented_demand(W).

never undocumented_kind(F, K)
never undocumented_demand(F, W)
```

> **Both FAIL, and by a lot.** 292 findings (of 968) carry a `Kind` the
> header never mentions — every one of them `decision` (55) or `defect`
> (237); `defect` is not a typo, it is the second most common Kind on the
> whole tree, ahead of `question` and `idea` combined. 47 `demands` rows (of
> 820) name a `What` the header never mentions either: `test` (19), `code`
> (9), `demo` (9), `kernel_change` (5), `none` (2), `requeue` (2),
> `test_repair` (1). The ledger's discipline (React / dismiss / defer,
> CLAUDE.md) is being followed — every finding still gets a Kind and, almost
> always, a What — the vocabulary just grew past its own one-line
> documentation a long time ago and nothing here re-reads it. `npm run
> findings` renders every one of these findings correctly (the report reads
> the values, not the comment), so this is invisible in the one place
> anyone actually looks; it only shows up by asking the schema's own claim
> as a question, which is what this notebook is for.

## Trying the translator

> `npm run nb -- translate examples/notebook/ledger.rofl.md` is meant to
> write a `rofl` cell under every natural cell with none — N2 and N3 above
> qualify (their answer is hand-written directly as a `datalog` cell, which
> `translated()` in `notebook/front.ts` does not recognise: it checks
> `cells[c.index + 1]?.kind === 'rofl'` specifically, so a correct
> `datalog` answer still reads "not translated yet"). Tried three times
> against this file's own N1 text, standalone (`claude -p --model sonnet
> --tools ''`, what `notebook/cli.ts`'s `claude` calls): a bare one-line
> prompt returns in 15–40s; the same call fed the translator's real prompt
> shape (the sentence-form rules, the notebook's own text, a request to
> "answer inside one ```rofl fence") returns nothing and is still running
> at 110s, and again at 280s — `10.9s` of CPU time against 4m40s of wall
> time, i.e. blocked, not computing. Reproduced with a 14-line synthetic
> prompt with no ledger content in it at all, so it is not this file's
> size; a prompt with the same instructions but no fenced code block in it
> answers in under 25s, so a triple-backtick fence in the prompt is
> implicated, not proven. This may be specific to running a nested `claude
> -p` from inside an already-running Claude Code session (this one, itself
> part of a multi-agent team) rather than a defect of `translate` as code —
> I did not reproduce it outside that setting. Either way: **the translator
> could not be exercised in this environment**, so there is no "what it got
> right and wrong" to report — only that it never returned.

## Where this leaves the ledger

> N1 real gap (15 open findings with no `demands` at all — already
> rendered as `→ unspecified` by `npm run findings`, just never counted).
> N2 clean. N3 clean, and only checkable at all once a length is brought
> in from outside. N4 clean once asked under the right perspective
> (`unproven_misaimed[audit]`, not the bare name). N5 clean, and the one
> invariant with no caveat, because the filesystem bridge sees every
> candidate path there is. N6 clean on the real data, but the mechanism
> believed to enforce it does not exist — a latent gap in
> `rules/findings.rofl`, not a live one. N7 a real, structural gap: the
> ledger's only schema documentation is stale over 292 `Kind` rows and 47
> `demands` rows, invisible to `npm run findings` because the report reads
> data, never the comment beside it.
>
> Found along the way, not about the ledger: `Rofl.query()` refuses an
> ad-hoc conjunctive query and reports it in an `error` field a caller has
> to know to check — indistinguishable from a real zero if they don't
> (repro under N1);
> `never` does not accept positional form outside a `datalog` cell, unlike
> `?`/`why`/`whynot` (repro under N4); a perspective-qualified relation
> (`rel[book]`) asked by its bare name answers "empty" instead of an error
> (repro under N4); a notebook's cells share one flat, fully-assembled
> model rather than accumulating like a session, so no single file can show
> a "before" and an "after" (found writing N6); a plain `.rofl` file's atoms
> are bare words, not the sentence form's backtick-quoted ones (found
> writing the generator, `examples/notebook/gen_ledger_facts.ts`). All five
> are written up with reproductions in `examples/notebook/ledger.FRICTION.md`.
