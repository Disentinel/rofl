# DITTO — prove the refactoring preserved what it promised

*Pin the model, make the edit, and check the invariants the edit said it would
not touch.*

"This is a refactoring" is an assertion nobody checks. Tests check sampled
**outputs** on sampled **inputs** and everyone hopes that was enough. Nothing
checks **structure**, and nothing lets the author say *which subset* of the
structure was supposed to survive.

```
node --experimental-strip-types examples/ditto/demo.ts
```

---

## The thesis

A refactoring is an **equivalence class**, and different refactorings preserve
different things:

| edit | preserves | may change |
|---|---|---|
| extract method | external behaviour, reachability | internal structure |
| rename | everything | identifiers |
| data-structure change | outputs, effects | internal types |
| module move | behaviour, dependencies | file layout |
| service split | contracts, effects | process boundaries |

Existing tools cannot express "this may move and that may not". A golden master
compares whole outputs and fails on any legal internal rebuild; nothing compares
structure at all.

## Prior art, honestly

The field is dense. Characterization tests and golden master (Feathers,
*Working Effectively with Legacy Code*), snapshot testing, contract testing,
differential testing, shadow traffic and request replay, GitHub Scientist,
Twitter Diffy.

**All of them compare outputs.** None compares structure, and none lets you say
which subset of invariants has to survive. The gap is exactly there, and it is
narrow — that is what to claim, not "a new approach to refactoring".

## What cannot be proved

Program equivalence is undecidable. "Behaviour is identical" cannot be proved,
and promising it is a lie.

What *can* be proved is that the **declared and extractable** set of invariants
survived. That is strictly weaker than the informal promise and strictly more
useful, because it is checkable. The tool's own wording says exactly that, and
`undecidable/1` and `out_of_scope/1` are facts in the program so the boundary is
printed rather than implied.

---

## Why this example is cheap to build

Extraction is deterministic at both ends, which is the same reason
`examples/drip` is cheap: both models are the output of one dumb reader.

| | source | how it is read |
|---|---|---|
| the frozen model | `examples/ditto/before/` | `scanners/js.ts`, already in this repo |
| the current model | `examples/ditto/after/` | the same file, re-run |

`scanners/js.ts` parses TypeScript into `src_func`, `src_call`, `src_import`,
`src_export` facts and stops. It does not resolve an import specifier to a file,
because a scanner that resolved imports would be a compiler — so resolution
happens in **rules**, which is where `examples/moot` puts its operator semantics
for the same reason: the reader stays dumb and the meaning stays inspectable.

```
[before]  before/  7 files, 16 functions, 23 call sites, 12 exports, 86 facts
[after]   after/   7 files, 19 functions, 27 call sites, 12 exports, 93 facts
extractor: rofl_js_scanner @ 17e95752918c  (the content hash of scanners/js.ts)
```

**The extractor version is the content hash of the extractor.** Change the
reader and the version changes by construction, and a freeze taken with the old
one can no longer be compared — see §8.

---

## The ledgers

```prolog
authority(before, frozen_extract).
authority(after,  live_extract).
authority(claim,  engineer).
imports(main, before).
imports(main, after).
imports(main, claim).
```

`[before]` and `[after]` are the two models; `[claim]` is what the engineer
declared; every conclusion lives in `[main]` and reads all three through
declared imports. "Preserved" and "violated" are **derived**, never filed under.

The closest this comes to the perspective-per-run anti-pattern in
`docs/choosing-perspectives.md` is worth naming rather than glossing: these are
not one ledger per extractor execution. There are exactly **two**, always, by
construction — the pinned baseline and the current tree — and the next edit
re-freezes `[after]` as the new `[before]` rather than spawning a third.
`test/example-ditto.test.ts` pins the count at two.

---

## 1. The declared class — the one manual step

Declaring what counts as a refactoring is the human's job and cannot be
automated. Here that is not a convention, it is enforced: the *catalogue* of
classes belongs to the tool (it is what the words mean), and choosing one
belongs to the engineer, in `[claim]`, which the extractor has no authority
over.

```
e_dedupe_audit      dedupe           notifyOps stops writing a second audit line
e_extract_discount  extract_method   pull the discount arithmetic out of settle()
e_move_storage      module_move      db.ts moves under storage/
e_rename_customer   rename           findCustomer -> loadCustomer, everywhere
e_swap_price_index  data_structure   price lookup: linear scan -> Map

OBLIGED (must survive) : boundary, entry_effect, entry_reach, module_dep
WAIVED  (may change)   : identifier, internal, layout
```

### Mixing edits weakens the claim, monotonically

This falls out of the thesis rather than being added to it. If several
refactorings ship together you may promise only what **all** of them promise:
one permissive edit waives an invariant for the whole comparison. The report
names which promise each edit cost, so the price of a mixed change is a number
rather than a feeling.

```
identifier   promised by module_move
             waived   by data_structure, dedupe, extract_method, rename
internal     promised by module_move, rename
             waived   by data_structure, dedupe, extract_method
layout       promised by data_structure, dedupe, extract_method, rename
             waived   by module_move
```

The rename on its own promises the call graph will not move. Putting it in the
same change as the extraction takes that promise away, and the tool says so.

---

## 2. The verdict

```
INVARIANT      BEFORE  AFTER  LOST  GAINED  VERDICT
boundary       12      12     0     0       HELD
entry_effect   5       4      1     0       VIOLATED
entry_reach    7       6      1     0       VIOLATED
module_dep     14      14     0     0       HELD

36 of 38 declared tuples survived.
  VIOLATED  entry_effect  orders.ts:handleOrder -> db_write   (disappeared)
  VIOLATED  entry_reach   orders.ts:handleOrder -> storage/db.ts:persist   (disappeared)

and the changes that were licensed, which is most of the edit:
  identifier    2 removed, 5 added   (waived)
  internal      3 removed, 4 added   (waived)
  layout        1 removed, 1 added   (waived)
```

Two rows, one cause: extracting `applyDiscount` out of `settle()` took the
`persist(order, receipt)` line with it. The database write is no longer
reachable from the entry point, and an exported function is no longer reachable
either. The tests over this service would still pass — `handleOrder` returns the
same receipt.

Note the last block. Most of the edit *did* change something, and all of it was
inside the declared licence. A check that reported no legal change at all would
be checking nothing, and the suite asserts that too.

---

## 3. Was / is

The output the spec asks for: not "the diff did not match", but *the predicate
is no longer derivable, here is the chain that derived it, here is the link that
is missing*.

```
$ ditto why orders.ts:handleOrder -> db_write

WAS — every route in the frozen model that carried it:
  orders.ts:handleOrder -> orders.ts:settle -> db.ts:persist  [db_write]

  and it rested on 11 base facts — 9 read out of the source, the rest
  the effect catalogue and the ledger tag. Remove any one and it is gone:
    effect_api[main]("db.insert",db_write)
    resolves[before]("orders.ts","./db.ts","db.ts")
    side[main](before)
    src_call[before]("db.ts","persist","db.insert")
    src_call[before]("orders.ts","handleOrder","settle")
    src_call[before]("orders.ts","settle","persist")
    src_export[before]("db.ts","persist")
    src_func[before]("db.ts","persist",6)
    src_func[before]("orders.ts","handleOrder",9)
    src_func[before]("orders.ts","settle",31)
    src_import[before]("orders.ts","./db.ts")

IS — the chain stops one link short:
  orders.ts:handleOrder -> orders.ts:settle   (stops here)
```

The link itself, from `whynot`:

```
whynot edge[main](after,fn("orders.ts","settle"),fn("storage/db.ts","persist")):
  rule r87550593: edge[main](?S,fn(?P,?F),fn(?Q,?N))@now :- calls[main](?S,?P,?F,?N)@now, func[main](?S,?P,?F)@now, target[main](?S,?P,?N,?Q)@now
    failed premise: calls[main](after,"orders.ts","settle","persist")
      rule rda797ee2: calls[main](?S,?P,?F,?C)@now :- src_call[?S](?P,?F,?C)@now, side[main](?S)@now
        failed premise: src_call[after]("orders.ts","settle","persist")
          no rule concludes 'src_call' and no matching base fact exists
```

And nothing else calls it either — `whynot` enumerates every candidate rather
than asserting exhaustiveness:

```
whynot creach[main](after,fn("orders.ts","handleOrder"),fn("storage/db.ts","persist")):
  rule r9f50189f: creach[main](?S,?A,?B)@now :- edge[main](?S,?A,?B)@now
    failed premise: edge[main](after,fn("orders.ts","handleOrder"),fn("storage/db.ts","persist"))
  rule rfbd513bf: creach[main](?S,?A,?C)@now :- creach[main](?S,?A,?B)@now, edge[main](?S,?B,?C)@now
    failed premise: edge[main](after,fn("audit.ts","record"),fn("storage/db.ts","persist"))
    failed premise: edge[main](after,fn("audit.ts","stamp"),fn("storage/db.ts","persist"))
    failed premise: edge[main](after,fn("notify.ts","notifyCustomer"),fn("storage/db.ts","persist"))
    ...
```

The provenance list is Polynomial's row in the spec's semiring table: **which
parts of the code carried the invariant**, and therefore where the loss can be.
Tropical's row is the ranking — with two invariants broken, the cheapest proof
in the frozen model mentions the fewest extracted facts and is the nearest place
to look:

```
entry_reach   orders.ts:handleOrder -> storage/db.ts:persist    47 firings
entry_effect  orders.ts:handleOrder -> db_write                 78 firings
```

---

## 4. Probable cause — a hypothesis, and it stays one

Three calls disappeared in this change. Two of them were declared legal and one
was not, and the tool is **not told which**: it ranks them by the evidence it can
see, in three tiers, folded with Viterbi so confidence is the strongest evidence
available rather than the product of the weakest.

```
orders.ts:settle -> storage/db.ts:persist     confidence 0.8800  (HYPOTHESIS)
     edge_gone           0.4000   a call that used to exist does not
     edge_gone_orphan    0.7200   ... and its target is still exported, now called from nowhere
     edge_gone_effect    0.8800   ... and that orphaned target performs an effect
notify.ts:notifyOps -> audit.ts:record        confidence 0.4000  (HYPOTHESIS)
     edge_gone           0.4000   a call that used to exist does not
pricing.ts:priceOf -> pricing.ts:scanTable    confidence 0.4000  (HYPOTHESIS)
     edge_gone           0.4000   a call that used to exist does not
```

The defect comes out on top on evidence alone. That it stays a *hypothesis* is
structural, and it is checked against the kernel's own rule dependency graph
rather than against a promise in a comment — the discipline `examples/drip`
applies to its rename guess:

```
reach(violated,   <any guess relation>) -> empty
reach(held,       <any guess relation>) -> empty
reach(obliged,    <any guess relation>) -> empty
reach(lost,       <any guess relation>) -> empty
reach(obs,        <any guess relation>) -> empty
reach(checked,    <any guess relation>) -> empty
```

---

## 5. What a diff sees, and what the class sees

```
raw extraction, no declared identification at all:
  facts before / after            72 / 79
  identical                       50
  only in before / only in after  22 / 29
  files byte-identical            3 of 7
```

**51 facts moved.** A golden master, a snapshot test or a byte diff is looking at
exactly this and can only say "it all changed". Under the declared class the
same edit is **two violations** and everything else legal.

The rename and the module move are what make the raw number useless: they touch
every tuple that mentions the name or the path, and no tool can tell that from a
deletion without being told. Being told is the declaration —
`renamed[claim]("findCustomer", "loadCustomer")` and
`moved[claim]("db.ts", "storage/db.ts")`, two lines a human writes.

Those two lines are load-bearing and the suite proves it by deleting them.
Without the rename, `boundary` and `entry_reach` both fail and the tool reports a
refactoring as a rewrite. Without the move, `module_dep` and `boundary` fail.
That is the check saying **no**; two tests further on it says **yes**, on two
identical revisions, because a gate that has only ever answered one way is not a
gate.

---

## 6. Counting — the invariant that held and lost its spare

```
EFFECT        BEFORE  AFTER   READING
audit_write   2       1       held, and lost a route: RESERVE GONE
db_read       1       1       unchanged
db_write      1       0       VIOLATED — no route left
mail_send     1       1       unchanged
net_call      1       1       unchanged
```

`audit_write` is **not** a violation. It is still reachable from the entry point,
so the declared invariant holds and the tool says so. What changed is that two
independent routes wrote that audit line and now one does: the next edit that
touches the survivor removes the effect with nothing left to notice. A future
regression, visible today.

This is Counting's fourth domain reading in this set, and stating it is part of
shipping the number (`f_counting_reads_oppositely_by_domain`): the identical
count means robustness in NOPE and OOPS, ambiguity in AKA, fragility in DRIP,
and **reserve** here.

One thing the declaration cannot currently say: "and the number of routes must
not drop". Whether losing a spare should block the merge is a human call, and
the vocabulary has no way to express it. Named rather than quietly decided.

---

## 7. The fork — propose the repair, then verify it

```
$ ditto propose src_call[after]("orders.ts", "settle", "persist").
  violations before the fork : 2
  violations after the fork  : 0
  invariants held            : boundary, entry_effect, entry_reach, module_dep
  store.clone() of 10170 facts : 219 ms (21.5 us/fact)
  full re-evaluation         : 254 ms
  control — a FLAT store     : 136 ms for 10049 ground facts (13.5 us/fact)
```

The proposal is **checked**, not asserted: the store is cloned, the missing call
is put back, and the whole program runs again.

The control is printed alongside because a per-fact cost is not portable. 5836
of this store's 10170 facts are rule reflection and firing provenance carrying
nested terms, and they copy at about 1.6x the cost of a flat ground fact.
Neither figure reproduces the ~3 µs/fact recorded for `clone()` elsewhere in this
repository — **and the flat control here does not either**, so most of that gap
belongs to the measurement, not to this store. Printed rather than smoothed over.
The conclusion survives it: comparing two fixpoints costs a few hundred
milliseconds, which makes it an ordinary operation rather than a last resort.

---

## 8. The gate that can say no

The freeze and the check must be made by the same extractor. Two different
parsers produce two different models, and their diff is a fact about the parsers.

```
freeze taken with 17e95752918c, check run with a-different-parser

  ? refused(R)   -> version_skew
  ? checked(I)   -> -
  ? violated(I, T, D) -> 0 rows
  ? held(I)      -> -
```

Note the last line. A refused comparison must not be able to report **success**
either, and `checked/1` — which every verdict is guarded by — is what enforces
that. `held(I)` is empty, not "all four".

---

## The case this repository provided, on the day this was written

DITTO's thesis is not hypothetical here. Three refactorings landed inside `src/`
on 2026-08-30, and the acceptance gate for each of them was literally a golden
master: *the goldens must move zero bytes.*

- The **argument index** rewrote much of `src/store.ts`. The goldens moved zero
  bytes and the full suite was green. A legal internal rebuild, correctly
  accepted.
- The **meta-layer cache** passed its own fifteen tests, moved the goldens by
  zero bytes, **and still broke nine tests in `examples/wtf/`** — a creature's
  characteristics computed as 2/2 where they should be 3/3. Wrong answers, not
  flakes. The goldens could not see it because every golden program stops at one
  to three strata and `wtf` carries fourteen.

The lesson recorded that day, in `facts/findings.rofl`
(`f_acceptance_must_include_the_full_suite`), is that **a golden is not a
substitute for coverage; it is a substitute for a diff.**

That is DITTO's thesis with a receipt. The same evidence — "the goldens moved
zero bytes" — was produced by a change that preserved what mattered and by a
change that did not, and it could not distinguish them.

### What a declared class would have caught here, and what it would not

Being precise about this matters more than claiming the win.

**It would not have caught the meta-cache bug.** Both changes are legal internal
rebuilds by DITTO's structural measure: `Store`'s exported surface, the kernel's
entry points and the effects reachable from them did not move in either case. A
structural check over `src/` would have said HELD for both — agreeing with the
golden master, including the time the golden master was wrong.

**What it adds is that the claim becomes falsifiable.** Both authors made the
same acceptance argument and neither had to write down what it meant. Written
down, the meta-cache author's class is "the derived fact set of every loaded
program is preserved; the internal structure of the meta layer is not" — a
sentence that is *false*, and false in a way something can check. "The goldens
moved zero bytes" cannot be false in any interesting way, because it says nothing
at all about programs the goldens do not contain.

**And it names where the check has to run**: not over `src/` but over the derived
fact set of loaded programs, with `[before]` the pre-change evaluation and
`[after]` the post-change one. The finding `f_materialise_the_meta_layer` had
already written that acceptance in prose — "a permanent test asserting cached ==
uncached BYTE-IDENTICAL on `canonicalState()`, PLUS a negative test that mutates
a rule and proves the cache MISSED". It was implemented, it passed, and the bug
went through anyway, because the programs it ran on were the shallow ones.

So the honest general statement, which is this example's own boundary:

> **A declared equivalence class tells you WHAT to compare. It does not tell you
> WHAT TO COMPARE IT ON.**

Corpus coverage is an orthogonal axis and DITTO does not touch it. The correction
adopted that day — a change inside `src/` requires the full suite before a finding
is settled — is a coverage rule, and it is the one that would have caught the
meta-cache defect.

What DITTO *does* catch is the other failure: a change whose structure moved
while every sampled output stayed the same. That is the planted defect in this
example, and it is exactly the shape a golden master is blind to by construction,
not by bad luck — `handleOrder` returns the same receipt either way.

---

## What this does NOT prove

Stated in the tool's own output, not only here:

```
undecidable: program_equivalence — so the verdict is about the
declared and extractable set and nothing else. The model covers:
  + call_graph
  + effects_through_declared_apis
  + export_surface
  + module_dependency
  + reachability_from_entry_points
and is blind to, and does not claim to have ruled out:
  - anything_needing_symbolic_execution
  - concurrency_and_ordering
  - control_flow_and_data_values
  - dynamic_dispatch
  - higher_order_callbacks
  - performance_and_resource_use
  - reflection_and_eval

Extraction coverage, measured rather than assumed: 45 of 50 call
sites across both revisions resolve to a definition in the tree; the rest
are library and host calls the reader cannot place:
  after   orders.ts       applyDiscount -> endsWith
  after   pricing.ts      buildIndex -> index.set
  after   pricing.ts      flattenLines -> out.push
  before  pricing.ts      flattenLines -> out.push
  after   pricing.ts      lookupPrice -> index.get
ambiguous name resolutions: 0
```

Five of fifty call sites are not placed, and the number is printed rather than
assumed to be zero. The call graph is a **syntactic over-approximation**: a call
through an interface, a callback or a value is invisible to it, and on a codebase
that dispatches dynamically that is not a rounding error. The tool answers for
what the reader can see, and says so.

It also does not replace tests, and must not be sold as doing so: it checks a
different dimension — structure and effects — where tests check outputs.
Together they cover more than either.

---

## The oracles

Two more computations of the same violation, neither of which shares the first
one's reasoning.

```
(a) excise src_call[before]("orders.ts", "settle", "persist").
      removed: entry_effect  orders.ts:handleOrder -> db_write
      removed: entry_reach  orders.ts:handleOrder -> storage/db.ts:persist
    VERDICT: AGREE, tuple for tuple
```

Delete that one call from the **frozen** model, re-run the whole program from
scratch, and see which obliged observations disappear. If the model is right
about what carried the invariant, that set is exactly the set the edit lost.

```
(b) sample: 16 + 19 functions, 17 + 18 resolved edges, 50 call sites re-resolved by hand.

    boundary      engine lost []                        oracle lost []                        AGREE
    entry_effect  engine lost ["db_write"]              oracle lost ["db_write"]              AGREE
    entry_reach   engine lost ["storage/db.ts:persist"] oracle lost ["storage/db.ts:persist"] AGREE
    module_dep    engine lost []                        oracle lost []                        AGREE

    VERDICT: AGREE on every obliged invariant
```

An independent re-resolution of both call graphs in plain TypeScript, sharing
only the base facts — it reads the EDB relations back out of the store and never
touches a derived one. The suite also runs it on a fixture it has not seen
(delete the `mail.send` from the after model in both worlds), because an oracle
that agrees on one fixture proves very little.

---

## The fixture

Synthetic, and it should be. Seven small TypeScript files an order service could
plausibly have, with five declared edits in one change:

| edit | what it does |
|---|---|
| `e_extract_discount` | pulls `applyDiscount` out of `settle()` — **and drops the `persist` call** |
| `e_rename_customer` | `findCustomer` → `loadCustomer` |
| `e_move_storage` | `db.ts` → `storage/db.ts` |
| `e_swap_price_index` | price lookup: linear scan → `Map` |
| `e_dedupe_audit` | `notifyOps` stops writing a second audit line |

One planted defect (the dropped `persist`) and one planted loss of redundancy
(the de-duplicated audit line). `flattenLines` is recursive in both revisions on
purpose, so the cyclic case is exercised rather than avoided.

Three of the seven files are byte-identical across the change. That number is in
the output too, because "most of the tree did not move" is what makes a whole-
output comparison look reassuring.

---

## What fought back

### Two kinds of declaration, because one crossing cannot be an import

`boot.rofl` closes the flow graph transitively (`flows_to`), because a crossing
licensed hop by hop is not a licensed walk. Four walks surfaced here and all
four are now declared — but not in the same way, and the difference is the
point.

Three are ordinary `imports` facts in `ditto.rofl`: `imports(audit, before)`,
`imports(audit, after)`, `imports(audit, claim)`. Each says the audit ledger
may name the book it reports on, which is what an audit ledger is for.

The fourth could not be an import at all. The extraction rules are polymorphic
in the side — `file[S](P, H) :- src_file[S](P, H)` and its siblings serve
`[before]` and `[after]` both, which is the point, since two rules would be two
chances to extract the two sides differently — and the comparison rules read
`[S]` and write `[main]`. So `[main]` gathers from a ledger it does not name,
and `imports(main, From)` needs a **registered** perspective at both ends while
`$var("S")` has no `authority` fact and never will.

```prolog
collects(main).
```

is the sentence that can, said once at the ledger that does the gathering. It
is checked rather than assumed: `collected[audit](main)` is derived only if
`[main]` actually collected something, and `test/example-ditto.test.ts` asserts
that row instead of reading the licence off an empty audit.

It is narrow on purpose. `collects` covers a crossing only where the source is
not a registered ledger, so the three named walks above still needed their
`imports` facts and a crossing out of `[before]` that nobody declared would
still be reported.

### Negation cannot express "no repeated node" here

Counting routes to an effect is the whole of §6, and a recursive function puts
the call graph on a cycle: every trip round the cycle is another derivation and
the counting semiring answers `INFINITE`. Honest, and useless as a measure of
redundancy.

So routes carry the visited chain **inside the fact**, the technique
`examples/nope` uses for assume-role chains and `examples/drip` for metric
lineage:

```prolog
route[main](S, A, A, cons(A, nil))   :- node(S, A).
route[main](S, A, C, cons(C, Path))  :- route(S, A, B, Path), edge(S, B, C),
                                        fresh(S, C, Path).
```

`fresh` is positive, not a negation: the chain domain is generated by `chain`
from the routes already derived, so this is ordinary monotone recursion over
terms and the stratification checker is never argued with.

One detail that is not obvious and cost a debugging pass: **the chain has to be
keyed by side as well as by path.** One route that exists in both revisions would
otherwise carry two derivations of the same `chain` fact and double every count
through it. That is `examples/drip`'s helper-inflation lesson arriving through a
door drip did not have, because drip only ever had one model in the store.

### `target` is computed over every (module, name) pair, not over calls

The obvious spelling derives the resolution from the call sites:

```prolog
target(S, P, N, P) :- calls(S, P, _, N), func(S, P, N).
```

Two functions in the same file calling the same name gives that fact **two**
derivations, and `edge`, `route` and every route count multiply by it. Deriving
it from `func` and `visible` instead — over pairs that may not be called at all —
keeps every step single-derivation. The suite pins that as a property over eleven
relations rather than as a number.

### The clone figure did not transfer

The fork in §7 was written expecting the ~3 µs/fact recorded for `store.clone()`.
It measured 21.5 µs/fact, so a flat-store control was added in the same run, and
the control came out at 13.5 µs/fact — which means most of the gap is the
measurement rather than this store's shape. Both numbers and the control are
printed. Reporting the number the brief expected would have been the easy thing
and would have been wrong.

---

## Where the transcript is thinner than the claim

- **`@next` is not used at all.** The two revisions are two ledgers of
  observation, not two ticks: nothing is simulated forward, two extractions are
  compared. That also sidesteps `f_counting_breaks_under_ticks` entirely.
- **The equivalence classes are a fixed catalogue of five.** Real refactorings
  compose and specialise; nothing here supports "extract method, but the extracted
  function may become an export". The vocabulary is a set of predicates as the
  spec demands, but its *granularity* is a design choice, not a derivation.
- **Direction is per-invariant and hard-coded.** `entry_effect`, `boundary` and
  `module_dep` are exact; the others are no-loss. Whether a given class wants
  no-loss or exact on a given invariant should itself be declarable, and is not.
- **Attribution of a lost tuple to a specific edit is not derivable**, so it is
  not attempted. §4 offers a ranked guess about the *call site*, which is a
  different and answerable question.
- **The scanner cannot see method dispatch.** `src_method` and `src_class` are
  extracted and declared, and nothing in the model resolves a call through an
  object. The fixture uses free functions, which is honest for this fixture and
  not honest for most codebases.

---

## The files

| file | what it is |
|---|---|
| `ditto.rofl` | the three ledgers, the invariant vocabulary, the class catalogue and 74 rules |
| `before/`, `after/` | the two revisions, seven TypeScript files each |
| `demo.ts` | the freeze, the transcript above, and both oracles |
| `page.html` | the same argument at two levels, self-contained |
| `test/example-ditto.test.ts` | 22 tests, 11 s of CPU (about 16 s wall on a busy box) |

`npm test` runs the suite;
`node --experimental-strip-types examples/ditto/demo.ts` runs the transcript.
