# HUH — How'd yoU get Here

Provenance on the object every engineer touches daily: a shell pipe.

```
$ cat access.log | grep 4xx | awk '{print $7}' | sort | uniq -c | sort -rn | head
     47 /api/v2/checkout
```

Two questions that pipe cannot answer about itself:

- **why** — *which* 47 lines made that number, through which stages;
- **whynot** — the lines you *expected* are not in it, and **which stage ate
  them**.

The second is the one people answer by re-running the pipe five times,
chopping one stage off the end each time. HUH answers it in one call, and the
answer is not "somewhere in grep" but the exact comparison that failed on the
exact value.

HUH is not a system. It is `examples/huh/huh.rofl` — four rules — plus a
tokenizer. The provenance is the kernel's; nothing here computes any.

## What the demo shows

1. **The counted result.** `uniq -c` is not a rule. The bucket fact is the
   rule; the *count* is the counting semiring folded over the support
   hypergraph the kernel already recorded, so 47 is the number of derivations
   of `s_uniq("/api/v2/checkout")`.
2. **why**: one derivation of that bucket, down to the axioms the host
   tokenized.
3. **Which lines**: the provenance semiring, with the base annotation set to
   name only the `line/1` facts, so a monomial *is* a log line.
4. **whynot**: a line you expected, and the chain down to `500 <= 499`
   — the comparison inside stage 1 that dropped it.
5. **whynot again**, on a row grep *kept*: this time the failing premise is
   the `awk` projection, so a different stage is named. Same call.
6. **excise**: delete one log line, see exactly what falls with it (the line
   and its three stage rows — not the bucket), and the count go 47 → 46.

Every number above is computed twice: once by the engine, once by running
the actual `grep | awk | sort | uniq -c` pipeline over the same file through
`/bin/sh`. The demo prints both and compares them. HUH's ground truth is free
and deterministic, so there is no excuse for asserting the engine is right
instead of checking it.

## How to run it

```sh
node --experimental-strip-types examples/huh/demo.ts
```

No arguments, no build step, no dependencies. It writes a generated
2000-line access log into a temp directory, prints its path, and leaves it
there so you can run the pipe against it yourself.

The assertions also run as a test, on a 400-line prefix of the same log:

```sh
node --experimental-strip-types --test test/example-huh.test.ts
```

## The rules

```
s_grep(N)    :- line(N), status(N, C), C >= 400, C <= 499.
s_awk(N, P)  :- s_grep(N), field(N, 7, P).
s_sort(N, P) :- s_awk(N, P).
s_uniq(P)    :- s_sort(_, P).
```

The host emits three facts per log line — `line(N)`, `status(N, C)`,
`field(N, 7, "…")` — and that is the entire mapping. See `huh.rofl` for the
commented version.

## The transcript

Real output of `node --experimental-strip-types examples/huh/demo.ts`, pasted
unedited. The temp path is the only thing that differs between machines.

```
HUH — How'd yoU get Here
provenance on a shell pipe, computed by the ROFL kernel

log     /var/folders/k9/dst30b8n5rs6x6nny6__7s6w0000gn/T/rofl-huh-demo/access.log
sample  2000 lines, generated deterministically (seed 920)
facts   2000 line + 2000 status + 2000 field, from examples/huh/demo.ts
rules   examples/huh/huh.rofl — grep, awk, sort, uniq as four rules
pipe    cat /var/folders/k9/dst30b8n5rs6x6nny6__7s6w0000gn/T/rofl-huh-demo/access.log | grep -E '" 4[0-9][0-9] ' | awk '{print $7}' | sort | uniq -c | sort -k1,1nr -k2,2

== 1. the counted result ===================================================
counting semiring folded over the support hypergraph: the value of a bucket
fact is the number of derivations of it, i.e. the number of lines that got
there. `uniq -c` is not a rule and does not need to be.

      47  /api/v2/checkout
      27  /api/v2/cart
      23  /api/v2/refund
      22  /healthz
      20  /static/app.js
      14  /api/v2/login

the same file through /bin/sh:
      47  /api/v2/checkout
      27  /api/v2/cart
      23  /api/v2/refund
      22  /healthz
      20  /static/app.js
      14  /api/v2/login
  oracle: AGREE — all 6 buckets over 2000 lines

== 2. why is it 47? ========================================================
$ why s_uniq("/api/v2/checkout")
s_uniq[main]("/api/v2/checkout")  <= r682af6c8 @tick 0
  s_sort[main](1057,"/api/v2/checkout")  <= r4af65fc3 @tick 0
    s_awk[main](1057,"/api/v2/checkout")  <= r9aa262d3 @tick 0
      s_grep[main](1057)  <= r82171c0f @tick 0
        line[main](1057) [axiom]
        status[main](1057,404) [axiom]
        404 >= 400 [builtin]
        404 <= 499 [builtin]
      field[main](1057,7,"/api/v2/checkout") [axiom]

one derivation of the bucket, down to axioms. There are 47 of them; the tree renders the canonical one.

== 3. WHICH lines? =========================================================
provenance semiring, base annotation = the line fact, so a monomial is a
log line. Shown for a smaller bucket on purpose (see the cap note below).

  /api/v2/refund  (23 lines)
  176 256 300 322 410 459 480 604 624 682 765 1042 1106 1178 1199 1372 1411 1414 1717 1732 1742 1799 1896
  grep -n over the same file: 23 line numbers
  oracle: AGREE — the 23 source lines behind /api/v2/refund

the same question about /api/v2/checkout returns 32 of its 47 lines:
provenanceSemiring keeps at most PROVENANCE_MAX_TERMS = 32 monomials, so above
32 sources the answer is a documented under-approximation, not the whole set.

== 4. whynot: which stage ate my line? =====================================
line 102 of the log is
  10.0.3.97 - - [30/Aug/2026:12:01:41 +0000] "GET /api/v2/checkout HTTP/1.1" 500 793
it is a /api/v2/checkout request, so you expect it in that bucket. It is not there.

$ whynot s_sort(102, "/api/v2/checkout")
whynot s_sort[main](102,"/api/v2/checkout"):
  rule r4af65fc3: s_sort[main](?N,?P)@now :- s_awk[main](?N,?P)@now
    failed premise: s_awk[main](102,"/api/v2/checkout")
      rule r9aa262d3: s_awk[main](?N,?P)@now :- s_grep[main](?N)@now, field[main](?N,7,?P)@now
        failed premise: s_grep[main](102)
          rule r82171c0f: s_grep[main](?N)@now :- line[main](?N)@now, status[main](?N,?C)@now, ?C >= 400, ?C <= 499
            failed premise: 500 <= 499 [builtin fails]

the leaf is the answer: "500 <= 499" is false, and that comparison
is stage 1. grep ate it. Nothing had to be re-run to find that out.

line 3 (status 304, same path) dies at the same stage but on the
other comparison: "304 >= 400". The answer is the condition,
not just the stage.

== 5. whynot again, and a different stage answers ==========================
line 2 of the log is
  10.0.2.106 - - [30/Aug/2026:12:00:01 +0000] "GET /api/v2/cart HTTP/1.1" 404 490
it IS a 4xx, so grep kept it. It is still not in the /api/v2/checkout bucket.

$ whynot s_sort(2, "/api/v2/checkout")
whynot s_sort[main](2,"/api/v2/checkout"):
  rule r4af65fc3: s_sort[main](?N,?P)@now :- s_awk[main](?N,?P)@now
    failed premise: s_awk[main](2,"/api/v2/checkout")
      rule r9aa262d3: s_awk[main](?N,?P)@now :- s_grep[main](?N)@now, field[main](?N,7,?P)@now
        failed premise: field[main](2,7,"/api/v2/checkout")
          no rule concludes 'field' and no matching base fact exists

this time the failing premise is field(2, 7, …) under the awk rule:
stage 2 projected /api/v2/cart, so the row went to another bucket.
Same question, same call, different stage named. That is the whole point.

== 6. excise: delete one log line ==========================================
$ excise line(96)   -- 10.0.3.90 - - [30/Aug/2026:12:01:35 +0000] "GET /api/v2/checkout HTTP/1.1" 404 847
  - line[main](96)
  - s_awk[main](96,"/api/v2/checkout")
  - s_grep[main](96)
  - s_sort[main](96,"/api/v2/checkout")
  4 facts fall; s_uniq[main]("/api/v2/checkout") is not among them —
  the bucket has 47 supports and only lost one.

  count on the excised world: 47 -> 46
  the shell, with the same line deleted: 46
  oracle: AGREE — the blast radius of deleting line 96

== oracle summary ==========================================================
3 comparisons against the real pipe over 2000 log lines:
  AGREE     all 6 buckets over 2000 lines
  AGREE     the 23 source lines behind /api/v2/refund
  AGREE     the blast radius of deleting line 96

the engine and /bin/sh compute the same numbers.
```

## What in the kernel makes it work

Nothing in this directory is a provenance implementation. Four kernel
mechanisms do all of it.

**The support hypergraph.** Every rule firing is recorded as a witness
(`Store.support`, `Store.witnessesOf`): the rule that fired and the premise
facts it consumed. A fact derivable 47 ways keeps 47 witnesses, not one. That
is the structure everything below reads.

**`why` is a walk over recorded witnesses**, not a re-derivation. It follows
the canonical witness of a fact down to base facts (`[axiom]`) and builtin
premises (`[builtin]`), so a why tree is a *record* of what happened, not a
plausible reconstruction of it.

**`whynot` is the mirror image, and it recurses.** For a literal that does
not hold, it takes each rule that could conclude it, walks the body under the
head substitution, and names the premise instances that fail. Then it does
the same to each of those. On a four-stage pipe that walk *is* the chain
`s_awk → s_grep → 500 <= 499`. Three guards make it terminate and each
announces itself: a literal already being explained higher up is marked
`[cycle]`, `depth` shapes the tree, `nodes` caps it outright.

**Semirings fold over that same hypergraph** (`src/semiring.ts`, instances in
`runtime/semirings.ts`). The Boolean fixpoint is untouched — annotation
changes a fact's *value*, never whether it holds — so the engine runs first,
unchanged, and the fold reads the support the store already recorded:

- `countingSemiring` (⊕ = +, ⊗ = ×) → *how many* derivations → `uniq -c`.
- `provenanceSemiring` (⊕ = ∪, ⊗ = pairwise ∪, with superset absorption) →
  *which sources* → which lines.

Both are declared instances of one generic fold; neither is named anywhere in
`src/`. Swapping `uniq -c` for "cheapest route" is swapping the semiring, not
editing the pipe.

**`excise` is a clean re-evaluation** on the EDB minus one fact, and the diff
against the current store *is* the blast radius. That is why deleting a line
can be shown to cost exactly its own stage rows and one unit of the count,
with no incremental-maintenance machinery to be wrong about it.

## What this does NOT do

**There are no string builtins in the kernel, and `is` is integer-only.**
So `grep 4xx` and `awk '{print $7}'` cannot be rules. The host splits each
line and emits `field(N, 7, "…")`; the rules are the pipe *over* the split.
This is architecturally right — it is exactly what `scanners/` exists for —
but be clear about what it costs: **the why-boundary sits one step higher
than HUH.md draws it.** HUH.md's tree starts inside the line ("`grep 4xx`
skipped 47 of 128340"); this one bottoms out at `field(N, 7, P)` as an axiom.
Section 5 of the transcript shows the boundary in the open:

```
        failed premise: field[main](2,7,"/api/v2/checkout")
          no rule concludes 'field' and no matching base fact exists
```

That is the honest floor. Everything above it is inferred and provenanced;
everything below it was decided by `String.prototype.split` and is outside
the kernel's account of itself. In exchange, the tokenizer is 3 lines and
the pipe is 4 rules.

**The regex is not the shorthand.** `grep 4xx` matches nothing literally, so
the demo — engine and oracle alike — uses `grep -E '" 4[0-9][0-9] '`, which
anchors on the quote closing the request and can only match the status field.

**`sort -rn | head` is presentation, not inference.** v0 has no aggregation
(LIMITS.md), so ranking the buckets is host-side sorting of the annotations.
`sort` itself is in the rules only as a nameable stage: order is not a fact
here, so it is the identity on the multiset.

**Provenance is capped at 32 source sets.** `PROVENANCE_MAX_TERMS = 32` in
`runtime/semirings.ts` bounds the polynomial, and the cap is applied before
superset pruning. The 47-line bucket therefore reports 32 of its 47 lines —
a documented under-approximation, printed as such in section 3, and the
reason the demo lists sources for a bucket that fits under the cap. Counting
is unaffected: it is one bigint per fact.

**One tick, no time.** The pipe is a single fixpoint at tick 0. Nothing here
exercises `@next`, perspectives, or negation, so `boot.rofl` is not loaded —
there is no negation to stratify.

**Cost is not measured here.** HUH.md's readiness list asks for overhead
honestly measured on a million-line log; this demo runs 2000 lines and makes
no performance claim. Loading 6000 facts and reaching fixpoint takes about a
second on a laptop, which is a fact about this example, not a benchmark.

## Findings this example touches

- **`f_no_string_builtins_moves_why_boundary`** (open, question → decision).
  This example takes the second of the two options that finding names — a
  deliberately redrawn demo boundary rather than mode-checked string builtins
  — and shows the redrawn line in the output instead of hiding it (see "What
  this does not do", and section 5 of the transcript). It does not settle the
  decision: it makes the cost of one branch concrete.
- **`f_store_index_insert_quadratic`** (open, pitfall → kernel_test). That
  finding names HUH's own million-line acceptance criterion as breaking the
  300-second budget on index inserts alone. This example therefore does not
  attempt it, and makes no performance claim at all. Knowingly deferred.
- **`f_counting_reads_oppositely_by_domain`** (open, insight → doc). It asks
  every example to state which reading of "number of derivations" applies.
  `huh.rofl` states it at the `s_uniq` rule: here the count is a plain
  magnitude, not robustness and not ambiguity.
- **`f_witness_forest_dropped`** (open, pitfall → kernel_test). Its symptom
  was that only the first structured witness survived, so "which 47 lines"
  could not be answered. It can be now: `Store.witnessesOf` returns the whole
  forest, and this demo's counted result — 47, agreeing with `uniq -c` — is
  exactly the evidence that finding was waiting for.
