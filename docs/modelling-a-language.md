# Modelling a language, and the process of modelling one

What this document fixes: the shape of a research programme, the one measurement
that decides whether it is science or bookkeeping, and — separately and more
urgently — the rule that keeps it OFF the critical path of everything else.

Opened 2026-09-01, from a conversation with the owner. Nothing here is built.

## The problem, stated as it was paid for elsewhere

Grafema's research note `declarative-semantic-rules.md` (2026-03-03) states it
exactly, and states it from three months of being bitten:

> Graph completeness depends on every AST node type that participates in data
> flow creating the correct edges. Currently visitors are written manually —
> gaps are discovered through bugs, months after the code is written.
>
> Data flow trace is a CHAIN. One missing edge = chain breaks.

The failure mode is **silent under-reporting**. A rule that misses a call shape
returns a smaller answer that looks correct. Nothing goes red.

Their remedy is a MATRIX: AST node type × semantic layer → rule, with all node
types enumerated from the parser's own declarations, and the invariant that an
**empty significant cell is a guaranteed gap**. Seven layers named: data flow,
control flow, call graph, module graph, scope graph, type graph, structure.

## What is worth taking, and what is not

**Not the alphabet.** A companion note reduces 97 edge types to 7 archetypes
with dotted modifiers — `→ .data.in`, `∋ .member`, `◁ .contract`. That
compression exists because a graph edge carries ONE type name, so 97 names or 7
names plus a modifier mechanism are the only two options. A relational language
has neither problem: the modifier is an argument, and a derived relation is a
rule rather than a new edge type. ROFL already has `flow/2` and its transitive
closure `flows_to/2` as one rule where a graph store needs two materialised
edge types.

**The distinctions, which are the expensive part.** These are semantic content
and do not fall out of any AST:

- **DEPENDS is potential, FLOWS is actual.** "If B changes, A might break"
  against "at runtime this value travels from A to B". A module can depend on
  another with nothing ever flowing — a type-only import.
- **DERIVES is identity, DEPENDS is function.** A IS a kind of / part of /
  projection of B, against A NEEDS B to work.

**And the matrix itself, made two-dimensional.** A one-dimensional coverage
list — "is this node kind handled" — reports success while `CallExpression` is
modelled for the call graph and missing from data flow. That was the first
design considered here and it was wrong.

## What changes because the host is a relational language

**Adding a layer must be one fact.** This is the whole argument for doing it
here rather than anywhere else:

    layer(taint).
    unaccounted[audit](K, L) :- node_kind(Lang, K), layer(L),
                                not handled(K, L, _), not ignored(K, L, _).

One fact adds a dimension and the audit immediately reports every cell the new
layer needs, with no change to any rule and no code at all. A generated matrix
cannot do this: there the layers live in the pipeline.

**The matrix must be DERIVED, not filled.** 252 node kinds by 7 layers is 1764
cells for JavaScript alone; twenty-one languages is thirty-seven thousand.

> **CORRECTED 2026-09-01, and the correction is threefold.** The collapse into
> 63 classes measured from babel's ALIAS SETS does not survive contact with the
> guardrail that calls it a hypothesis. Compared by NODE_FIELDS instead — which
> is total rather than sampled, and is what a walking rule actually needs —
> `Expression+Standardized` has twelve members and ELEVEN distinct shapes, while
> `TSBaseType` has sixteen and three. The recount is **63 alias classes to 146
> structural ones**, a collapse of 1.27 rather than 3, and **1022 cells at seven
> layers rather than 441**. Both numbers are real and only one is usable: an
> alias says these play the same ROLE, a field set says these have the same
> SHAPE, and no rule walks `[elements]` and `[left, operator, right]` alike. A
hand-filled table does not solve "nobody can hold the language model in their
head", it renames it to "nobody can hold the table". Most cells are answerable
from the node's own structure — whether it binds a name, moves a value, changes
control. What rules cannot decide must be ENUMERABLE, which is what the audit
above is for.

**Divergence between languages is declared, never silent.** Rust lifetimes,
Haskell laziness, Lean's dependent types have no counterpart elsewhere. The
same discipline the findings ledger uses: a cell is either derived, or handled,
or ignored WITH A REASON, and silence is not one of the options.

## The measurement that decides it

**Where is the oracle?**

Every honest piece of work in this repository has had one. When the range
restriction check moved into rules, the oracle was `Evaluation.rules[].safe` —
the same property computed by the host — and the two agreed set for set with
nothing on either side. The work was trustworthy because of that and not
because the rules read well.

A language model has no oracle by default. The rule that applies is one already
recorded here: **if the modelled thing is executable, the oracle is to run it.**
Data flow is checkable by execution, scope by what the compiler says about a
name, a call graph by tracing. So the first layer to model is not the most
interesting one — it is **the one whose oracle exists**.

Without that, filling the matrix produces a large, confident, unfalsifiable
artefact, which is worse than no artefact.

## The smallest step that proves or refutes the whole thing

**One layer, two languages, and then a third layer added as a single fact.**

If adding the layer really does light up the work with no code change, the
premise holds and the rest is volume. If it needs a code change, the premise is
false, and two languages is a much cheaper place to learn that than twenty-one.

## THE DECOUPLING RULE — this is the operative part

**This programme must not block the kernel's minimisation or a native port.**
It is research; those are engineering, and they are already measured and queued.

Two ways to keep them apart, both legitimate:

1. **Derive from the AST only what is needed now.** A scanner that answers one
   question completely is not a partial language model, it is a complete answer
   to one question.
2. **A DIRTY SCANNER — one contaminated with semantics — is allowed, on one
   condition: the contamination is DECLARED, in the artefact, as something that
   goes away when the language model is built.** An undeclared shortcut is
   debt; a declared one is a dated loan. The repository already has the form for
   this — `dismissed(F, reason)` in the ledger, `ignored(K, Reason)` in the
   audit above — and the discipline is the same: say what you did and why, and
   the thing stops being invisible.

The distinction that makes rule 2 safe is not cleanliness. It is that a
declared contamination can be QUERIED — every dirty scanner is a row somewhere,
the rows can be counted, and the count going to zero is what "the language model
is built" means, measurably.

## What the finished model actually is — and what it is not

Closing thought of 2026-09-01, from the owner: a complete language model is an
abstract interpreter, and feeding it inputs would execute the program while
carrying a full provenance chain for every conclusion — a debugger, only more.

The frame is right and is not new: Grafema's own research states the derived
graph as "declaratively-specified abstract interpretation (Cousot) computed as
a Datalog fixpoint". Two precisions matter, because they set the target.

**Abstract interpretation is not execution.** Cousot's construction runs over an
ABSTRACT domain — signs, intervals, types — yielding "x is positive" rather than
"x is 7". Substituting concrete inputs and running is CONCRETE interpretation,
i.e. an interpreter, and that hits a wall this repository measured on
2026-08-31: a loop counter is `N is M + 1`, which is the single place where a
Datalog fixpoint stops being finite by construction. **The modelled program's
non-termination becomes the model's.** That is a property, not an obstacle to
route around.

**The abstract reading is exactly what a fixpoint is good at**, because the
abstract domain is finite (or carries a widening). That IS Cousot's trade:
precision for termination. So the honest target is

> decide PROPERTIES of JS programs over a finite abstract domain, with a
> why-tree for every conclusion and an honest UNDEFINED where the domain cannot
> tell them apart.

**Three things make that more than a debugger, and two of them already exist.**
A debugger reports the state; a why-tree reports why the state is what it is,
as a chain down to axioms. `whynot` answers why something is NOT the case, a
question no debugger asks. And the third value here is EARNED — every static
analyser has a "cannot determine" case and almost none say WHY, whereas an
UNDEFINED that carries the firing that derived it names the exact place the
domain lost a distinction. Semiring tags add the fourth dimension, precision
and confidence travelling with the conclusion; Grafema's notes name that as an
intention and it is running code here.

## Prior art that changes the target — checked, not recalled

**A complete JS model with an execution oracle exists and is ten years old.**
KJS (Park, Stefanescu, Roșu, PLDI 2015) is a complete formal semantics of
JavaScript in the K framework, executable, passing all 2,782 core tests of the
ECMAScript 5.1 conformance suite. Its authors then found the conformance suite
itself incomplete, wrote further tests, and used them to find bugs in V8,
WebKit and SpiderMonkey. K carries the same for C, Java, Python, Rust, EVM and
x86-64. Kythe (~2012) covers the other half of the idea: a language-agnostic
graph schema with per-language indexers, which is "different languages converge
on a common abstract semantics" already shipped.

**Taking a K semantics whole does not work, and the middle reason is not an
engineering one.** Format: K is rewriting logic with configurations and
matching modulo axioms, not Datalog, so adopting it means either depending on K
— against the zero-dependency cell this kernel occupies — or translating.
**Translatability: a complete execution semantics is Turing-complete of
necessity, and a stratified fixpoint is not.** That is a category difference,
the same wall this repository measured on `N is M + 1`, and no amount of work
crosses it. Purpose: K answers what a program DOES, while the target here is
what its structure IMPLIES — flows, calls, modules — which are abstractions
OVER a semantics rather than the semantics itself.

**What is takeable is worth more than it sounds.**

- **The case analysis.** A complete semantics enumerates every syntactic form
  and says what each one does. That is the first column of the matrix, filled
  by people rigorous enough to find bugs in production engines.
- **The DESUGARING CORE, and this is the prize.** K semantics reduce a language
  to a small core, with the reduction explicit. That is the collapse this
  document predicts — but JUSTIFIED rather than guessed. The alias-based
  estimate here (252 kinds to 63 classes) is a hypothesis about behaviour; a
  desugaring is a proof that one form unfolds into another, checked against a
  conformance suite.
- **test262 as the oracle, independently of K.** 2,782 tests written by the
  standards body beat any fixture set an agent writes overnight, and KJS
  documents where that suite is thin.

**Consequence for the programme: do not invent fixtures.** But the cost of the
alternative was understated here when it was written, and corrected within the
hour by trying it: test262 is a tc39 GIT REPOSITORY, not an npm package
(`npm view test262` is a 404, unpublished 2021; `test262-stream` exists at 1.4.0
and reads a checkout). So FINDING the suite is a lookup and CONSUMING it is a
clone of many thousands of files plus an integration — two tasks an order of
magnitude apart, written into one sentence here as though they were one. The
same caution applies to the desugaring.

**What is genuinely cheap, and was done first instead:** the premise test. It
needs no corpus at all, because it asks whether the MECHANISM works rather than
what any cell contains — and it is the step this document already calls
decisive.

## The premise, tested — 2026-09-01, first loop tick

**It holds.** Thirteen node kinds across two languages, two layers, eight cells
modelled and four deliberately ignored with reasons: the audit reported 26 cells,
12 covered, 14 unaccounted. Adding `layer(scope).` — one fact, with
`rules/js-model.rofl` byte-identical afterwards — gave 39 cells and 27
unaccounted, both up by exactly 13, one per kind.

Two controls, because growth alone proves nothing. A foreign fact moves neither
count, so it is not that any assertion grows the table. And adding a NODE KIND
grows cells by exactly the number of layers, which says the matrix is genuinely
two-dimensional and that both dimensions work — only one had been tested.

> **Those three numbers were measured by an ad-hoc run and are already stale.**
> A later tick added `variable_declarator`, so the tree reads **28 cells, 14
> covered, 14 unaccounted** — and `unaccounted` is 14 AGAIN, by coincidence,
> while both other numbers moved. A stale figure that happens to still match is
> the one an eye cannot catch, and an ad-hoc run cannot notice it at all. They
> are now pinned in `test/js-model.test.ts`, which is where a number in this
> document should have been from the start.

**What this settles is the ENUMERATION of work, not the work.** 1022 cells remain
1022 cells. The oracle question is untouched by this result.

## The default verdict — `not_modelled` as an abstract class

Adding a layer being one fact settles that the matrix ENUMERATES. It does not
settle what the model SAYS about a cell nobody has modelled, and until this tick
the answer was: nothing. `unaccounted[audit]` is named for what is missing, so an
empty result reads as "nothing is missing" and a model that has stopped answering
reads exactly the same. That is this repository's own standing rule — an empty
result is a fact about the query until proven otherwise — sitting unfixed inside
the coverage model itself.

The repair is a TOTAL FUNCTION over the cell space. Every cell carries a verdict
and `not_modelled` is the one it is born with:

    verdict[audit](Lang, K, L, modelled)     :- handled(Lang, K, L, _).
    verdict[audit](Lang, K, L, waived)       :- ignored(Lang, K, L, _).
    verdict[audit](Lang, K, L, not_modelled) :- cell[audit](Lang, K, L),
                                                not handled(Lang, K, L, _),
                                                not ignored(Lang, K, L, _).

**The unknown is TYPED, and only one of the four types is irreducible.**
`runtime_dependent` is the program's property; `not_yet`, `budget_exhausted` and
`out_of_scope` are ours. "247 unknowns" is a number nobody can act on; "3
irreducible, 244 ours" is a work queue. The tree currently reads **2 irreducible
against 12 ours**, and the two irreducible rows are `import_expression` at the
dataflow and call-graph layers — a dynamic import whose specifier is not known
until run time.

**And the default is EXPLAINABLE, which is the part that is not bookkeeping.**

    why verdict[audit](js, yield_expression, dataflow, not_modelled)
      cell[audit](js, yield_expression, dataflow)
        node_kind[main](js, yield_expression) [axiom]
        layer[main](dataflow) [axiom]
      not handled[main](js, yield_expression, dataflow, ?0) [finite failure]
      not ignored[main](js, yield_expression, dataflow, ?0) [finite failure]

and on a cell that IS modelled, `whynot` names the blocking fact rather than
shrugging: *blocked: handled[main](js,call_expression,dataflow,r_call_args_flow)
holds*. Every static analyser has a "cannot determine" case and almost none say
why. This one names the two premises that failed and the axioms under them.

**What the mutant set says the gate covers.** Six run, five killed, one slept
through and was closed: a reason naming a kind and a layer that do not exist
LOADED, HELD, and moved no count at all — the same vocabulary hole `orphan_claim`
was written for, silently reopened by one new relation over the same
`(Lang, Kind, Layer)` arguments. The check is per-relation and hand-copied, so
the next such relation will have it again. The remedy is a schema derived once
from the rules by reflection rather than another hand-written copy, and that is
recorded as an open decision rather than done.

Two known gaps, both declared rather than filled: `reason` is not a function —
two reasons for one cell are accepted and both buckets project the reason away,
so the headline count stays right while the contradiction is invisible — and
`budget_exhausted` and `out_of_scope` have no honest row in the facts file,
because no evaluation here hit a bound and everything deliberately outside the
model is already a waiver. They are exercised in the test instead of being
filled with plausible-looking rows.

Files: `facts/js-kinds.rofl`, `rules/js-model.rofl`. Cross-language agreement is
derived rather than asserted — `converges[audit](Layer, Rule, A, B)` reports the
eight places two languages are modelled by the same rule in the same layer.


## Reference material held locally, and why it is not in the tree

The sources named above are not recalled from memory; they are on this machine,
fetched and checksummed, under **`reference/`** — which is **gitignored**. It is
read-only reference: nothing there is built, imported, or vendored, and
`reference/kjs/PROVENANCE.md` records for each piece where it came from and how
that was verified (clone URL and commit, HTTP status and byte count, the dead
URL the repository itself prints, and the control that ruled out the network as
the cause).

Held today: the KJS repository at `d5aca308` (2015-02-19) and the PLDI 2015
paper. **KJS carries no LICENSE or COPYING file**, so its terms are unknown and
the rule while they stay unknown is strict — it may be READ, and nothing from it
may be copied into `src/`, `rules/` or `scanners/`. What is takeable from a
reading is the case analysis and the shape of the desugaring, both of which are
facts about JavaScript rather than expression owned by anyone. Babel's transform
plugin and its `helper-remap-async-to-generator` are MIT and carry no such
restriction.

The directory is ignored rather than committed for two reasons and only one of
them is size: an unlicensed corpus should not enter a repository's history,
where removing it later is not removal.

## The file import, modelled — and what it dragged in

The owner's step: take the AST scanner, model exactly two constructs — the
function call and the file import — watch what they drag in, and make
`not_modelled` the default. The import half is reported here.

**The scanner was rewritten to judge nothing, completely.** Four relations and
no fifth:

    ast_node[code](Id, Kind, File, Line)
    ast_child[code](Parent, Field, Index, Child)
    ast_attr[code](Id, Key, Value)
    ast_file[code](RootId, File)

`ast_attr` captures EVERY scalar own property — booleans and numbers bare,
strings quoted — which is what makes `computed`, `async` and `importKind`
available to a rule instead of to a special case in the walker. The `Index`
argument exists because the previous version passed the same field name for
every member of an array field, so **argument order was silently lost**. The
completeness check walks the AST with its own recursion, sharing no code with
the scanner but the entry point, and compares id-blind signatures.

### DEPENDS is potential, FLOWS is actual — and that is one relation short

Confirmed as real, in numbers: **`depends` 10, `flows` 6, gap 4** across the
fixtures. The four that depend without flowing are two type-only imports (one
declaration-level, one inline) and two side-effect imports.

But those two groups are **opposites at run time**. A type-only import is erased
before the program starts; a side-effect import EXECUTES A FILE. Two relations
put them in one cell, so a third was forced by the data rather than designed:

    depends[code](From, To)     -- if To changes, From might break
    flows[code](From, To)       -- a value travels
    evaluates[code](From, To)   -- To's top level runs

**And the syntactic marker lies.** Measured against babel 8 rather than
recalled: `import type { T }` produces an `ImportDeclaration` with
`importKind: "type"` whose `ImportSpecifier` carries `importKind: "value"`. The
specifier of a type-only declaration says the opposite of the truth, so a model
reading either marker alone gets one of the two forms wrong — and the two forms
are 3.5% and 6.4% of this corpus. A one-dimensional reading passes its own
tests.

### The oracle: node's resolver, and three probe bugs before it could be trusted

17 sites, 13 resolved. **0 wrong answers, 2 under-reports, both declared** — a
bare specifier waived `out_of_scope` and a subpath import left `not_yet`, the
latter a measured gap rather than a hypothetical, since the fixture's
`package.json` carries an `imports` map that node really does honour.

Three bugs in the probe itself were caught first, each returning a **confident,
well-formed wrong answer** rather than an error:

- `import.meta.resolve` **silently ignores its `parentURL` argument** without
  `--experimental-import-meta-resolve`, resolving everything relative to the
  script. That alone would have read as 16 false "wrong answers".
- macOS `os.tmpdir()` is `/var/…` while the resolver answers the `/private/var/…`
  realpath, so every in-tree file read as outside the tree.
- Filing a `node_modules` hit as agreement would have let the model decline every
  package in the repository and still come out clean.

The oracle **enumerates its own sites from babel** rather than taking the site
list from the model — otherwise a site the model missed could never appear as a
miss.

### THE FRONTIER THAT IS NOT A CELL — the first structural limit found

The programme rests on cells of node kind × semantic layer, with the invariant
that an empty significant cell is a guaranteed gap. Modelling one construct
produced four frontier items **that are not cells**, which the matrix therefore
cannot hold, count, or report as missing:

1. **The kernel has no string builtins.** Its whole vocabulary is
   `= != is < <= > >=`, so **no rule can decompose a path**. Resolution needs
   `str_seg`, `str_char0`, `str_scheme` from the host, declared as
   `host_emitter(js, modules, str_algebra, a_kernel_has_no_string_builtins)` —
   countable, with the count reaching zero being what "the kernel grew a string
   primitive" would mean. This is a row about OUR ENGINE inside a model of
   someone else's language, and it binds every language model that resolves
   anything.
2. **Which resolver is being modelled.** The oracle is CJS, because
   `import.meta.resolve` cannot be aimed at a parent without a node flag. CJS and
   ESM diverge on extension guessing and directory index — invisible here because
   every relative specifier carries an extension, and a real hole on a corpus
   that does not.
3. **`evaluates` depends on a compiler setting**, not on the source:
   `import { type T } from './x'` erases entirely under default TypeScript and
   leaves a bare side-effect import under `verbatimModuleSyntax`.
4. **A rule can be correct and dead against the corpus.** All 371 builtin imports
   here are `node:`-prefixed and none is bare, so the bare-builtin branch is
   exercised only by a fixture and never by real input.

None of the four is a kind × layer. The matrix's invariant — silence is not an
option — is silent about all of them.

### The net frontier delta, and a correction to the guardrail that demanded it

A guardrail recorded before this work required that any claim of a stable
position print the NET FRONTIER DELTA, on the argument that if modelling one cell
opens more than one, the per-cell process diverges. A prediction was
pre-registered with it: closing two cells would open 10–15.

**Measured: one construct took cells from 28 to 57 and unaccounted from 14 to 36
— 29 new cells, 22 newly unaccounted.** The prediction was low by a factor of
two. But the decomposition **refutes the guardrail rather than confirming it**:

| of the 22 newly unaccounted | count | what it is |
|---|---|---|
| naming 5 new node kinds × the layers | 10 | the matrix's arithmetic |
| kinds that do not participate in a module graph | 12 | closes cheaply as `ignored` |
| **needs judgement** | **1** | `py import_from × modules` |

The guardrail counts CELLS, and cells are vocabulary × layers, so **any growth in
vocabulary inflates the delta regardless of how much thinking is left**. A model
that names more kinds looks like it is diverging while doing identical work. The
corrected rule: split the delta into **judgement cells** and **arithmetic
cells**, and only the first is a rate. Here that is 1 against 21.

## The function call, modelled — and the number that justifies the whole design

The other half of the owner's step. Modelled at the **call graph** layer against
an **execution oracle**: V8 stack frames, read by a probe that enumerates its own
call sites from babel rather than taking the list from the model, so a site the
model missed can still appear as a miss.

### 83 call sites, 17 shapes, and the census as the deliverable

> Read as of that tick. The fixture has since grown three functions (see *Three
> of four mutants survived*), so the census is now **93 sites, 71 of them a
> plain identifier callee**, with the same 17 shapes.

The classification is TOTAL — every site gets exactly one shape, and the
catch-all is reachable and tested. 61 of 83 are a plain identifier callee; the
rest spread across sixteen shapes with one or two sites each. Nine further
verdicts are recorded for shapes **the grammar allows and this corpus does not
contain** — the denominator from the grammar, the work order from the corpus.

### THE RESULT THAT MATTERS

    oracle 37 edges  |  model 26 edges
    UNSOUND under-report (oracle saw, model missed):  11
    over-approximation (model derived, oracle never ran):  0

**The model misses 30% of the edges the program actually executed** — and every
single miss is attributed to a shape, at the line V8 reported:

    useDeep -> dig      alpha.mjs:75   <- s_member_on_member
    useCall -> peek     alpha.mjs:90   <- s_member_on_call
    useClass -> Box     alpha.mjs:110  <- new_expression
    both -> get         alpha.mjs:105  <- s_member_on_this
    useDyn -> pick      alpha.mjs:123  <- s_computed_dynamic_key
    apply2 -> leaf      alpha.mjs:152  <- s_identifier
    apply2 -> mid       alpha.mjs:152  <- s_identifier
    …

This is the whole argument for the programme, in one table. Grafema paid three
months for **silent** under-reporting: a rule that misses a call shape returns a
smaller answer that looks correct, and nothing goes red. A model quietly
returning 26 edges with no frontier would be **indistinguishable from a complete
one**. This one returns 26 edges and a list of the 11 it knows it cannot see.

> **Those figures are this tick's and two of the eleven have since been closed;
> the table below stands as the measurement that found them.** The current
> reading is 43 / 34 / 9 — see *The higher-order hole, closed* below.

### Two rows in that table are worth more than the other nine

**`apply2 -> leaf` and `apply2 -> mid` are attributed to `s_identifier` — a shape
the model CLAIMS TO HANDLE.** An identifier callee resolves when the identifier
names a declaration and does not when it names a **parameter**. So higher-order
calls are a hole *inside* a handled shape, and **no shape census can show it**:
the classification axis is syntactic and this gap is not.

**`useClass -> Box` is attributed to `new_expression` — a call site that is not a
`CallExpression` at all.** The callee-shape axis cannot see it, because it is a
different node kind entirely.

Both say the same thing in two registers: **the frontier is finer than the
classification**, and the census exposed that rather than hiding it.

### The higher-order hole, closed — 2026-09-04, and what the kernel had to say

The two rows above are now edges. `s_identifier` gained a third tier: an
identifier callee that names a PARAMETER resolves through the value the caller
passed at that index.

    param_bind[code](F, PName, G) :- resolves[code](C, F),
                                     passes_function[code](C, I, G, _),
                                     ast_child[code](F, params, I, P),
                                     ast_name[code](P, PName).

    resolves[code](C, G) :- shape[code](C, s_identifier), callee_of[code](C, N),
                            ast_name[code](N, Name), nearest_fn[code](Fn, C),
                            param_bind[code](Fn, Name, G).

    oracle 43 edges  |  model 34 edges
    UNSOUND under-report:  9   (was 11)
    over-approximation:    0   (unchanged)

**THE QUESTION THIS ANSWERED WAS ABOUT THE KERNEL, NOT ABOUT JAVASCRIPT.** The
two rules are a CYCLE — `param_bind` reads `resolves` to know which function a
call site goes to, and `resolves` reads `param_bind` to answer a parameter
callee — inside a program that already carries negation (`not closer`, `not
has_shape`). Whether a stratified fixpoint would take it was measured before a
line was written, and it does: the recursion is positive, the negations it
stands on sit outside the cycle, `unstratified` stays empty and the fixpoint
settles in about 2.7 s over the fixture. A KILL SET — `not rebound` inside the
cycle, which is what a dataflow with strong updates needs — is REFUSED with a
precise diagnostic naming every relation that can never settle, and ACCEPTED
under `semantics(well_founded)` at about five times the cost. So the thing that
looked like an expressive wall is a price, not a wall; what remains genuinely
outside the language is aggregation (§8, so a non-powerset lattice has no join)
and string CONSTRUCTION (`N is M + 1`'s defect, deliberately excluded).

The analysis is **context-insensitive and says so**: a function called twice
with two different callbacks binds its parameter to both, at every site. That is
tier 1's scope blindness in a second register, and it is visible rather than
averaged away — `ambiguous_call[audit]` reports a site resolving two ways.

### Three of four mutants survived, and the remedy was the FIXTURE

Written by asking where the oracle is structurally unable to look, which is the
question this repository already records as the highest-yield one. The answer
came back: at almost all of it.

| mutant | what it targets | against the old fixture | after |
|---|---|---|---|
| drop the argument index | slot is content | **survived** (edge set identical) | +`applyFirst -> mid` |
| sever the cycle | which call site targets F | **survived** (bindings 5 → 89, edges unmoved) | +2 invented edges |
| resolve a parameter by name alone | which function encloses the call | **survived** | +2 invented edges |
| delete tier 3 | liveness | killed, −4 edges | killed |

The cause is one property of `apply2(leaf, mid, n)`: it calls BOTH of its
function parameters, so leaf and mid run either way and the edge set cannot
distinguish a model that carries the index from one that does not. **An oracle
this precise was blind to three separate defects because of what the fixture
happened to contain.**

The remedy was therefore not a stronger assertion. `applyFirst`, handed `mid`
and never calling it, and `useCb`, whose parameter shares the name `f` with
apply2's and is handed a different function, each turn one of those defects into
an edge the runtime never ran — the one thing an execution oracle can see. All
four mutants now die, and one dies TWICE OVER: `ambiguous_call` moves 0 → 6 on
the index mutant, which is the audit seeing what the oracle could not.

**The rule that generalises**: when a mutant survives an exact oracle, ask what
the CORPUS cannot express before touching the check. A fixture in which two
defects have the same observable consequence is a fixture that cannot tell them
apart, and no assertion written over it can either.

### The price of the cell, measured a second time

    js node kinds:  9 -> 33   (+24)
    cells:         28 -> 76   (+48)
    unaccounted:   14 -> 50   (+36)

24 new kinds × 2 layers = exactly 48. **Every added cell is arithmetic; not one
is a new question.** The judgement actually left is not in the matrix at all — it
is the 16 shapes with a residue, 1 irreducible against 15 ours.

Measured twice now, on two different constructs, the conclusion is the same:
**cells are vocabulary × layers, so the delta grows whenever a model names more
of the language — which is what progress looks like.** A model that named
nothing would have a perfect delta and no content. The rate that means anything
is judgement cells per closed cell.

### The second structural limit: the matrix is coarser than the frontier

The call graph's frontier lives at **shape** granularity — 17 shapes over 83
sites (93 today) — while the matrix lives at **kind** granularity. `member_expression` is
ONE KIND and SIX DISTINCT SHAPES, each with its own verdict and its own reason.

So the coverage matrix and the working frontier are not the same object, and the
matrix is the coarser one. Together with the four frontier items that are not
cells at all (kernel string builtins, resolver identity, compiler config, dead
branches), that is two structural limits found in one tick — both by MODELLING,
neither by inspecting the design.

## What this tick settles, and what it does not

**Settled.** The mechanism works end to end on two constructs and two oracles:
scanner → rules → verdict → frontier → oracle, with the under-reporting
enumerated rather than silent. `not_modelled` is a positive, typed, explainable
default. Adding a layer remains one fact. Four executors ran 26 mutants between
them; three of them extended their own mutant set past the brief, and every
survivor found came from those extensions rather than from mine.

**Not settled.** The matrix's two dimensions do not hold the frontier, and both
limits were found from inside. Whether to widen the matrix (a shape axis, a
non-cell frontier table) or to accept it as a coarse index over a finer working
set is a DECISION, and it is the first question the next tick has to answer —
before any more cells are filled, because filling them at the wrong granularity
is the expensive mistake this document was written to avoid.
