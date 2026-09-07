# Self-application: what it costs, measured

Opened 2026-09-04, from a conversation with the owner about writing ROFL's
parser in ROFL. Nothing here is shipped; every number below came from a probe
run against the live kernel, and the probes are reproduced inline so they can
be re-run.

The session began with a claim I made from memory — *a grammar cannot be
loaded by itself* — and the owner asked for the exact dependency. It was
wrong as stated, and the four walls below are what is actually there.

## The four walls

| # | wall | where | applies to a parser | applies to a macro |
|---|---|---|---|---|
| 1 | no string → atom | `STR_ARITY`, `src/reflect.ts` | yes | no |
| 2 | `conclusion_lit` is write-protected | load path | yes | yes |
| 3 | no substring by range | `evalStrOp` | yes | no |
| 4 | `reifyTerm` is not injective | `src/reflect.ts:432` | yes | partly |

Walls 1 and 3 are absences rather than decisions: a substring of a string the
program already holds has a finite image, so both `str_sub(S, I, Len)` and
`atom_of(S)` pass the criterion recorded in
`f_string_destructors_are_free_and_constructors_are_not` exactly as the five
existing destructors do. Wall 2 is a host-side veto of the same class as the
`$` ban that was lifted on 2026-09-01.

Wall 4 was found by a control that fired:

    hit(C)  :- gen(C, $lit(R, main, $cons($var("X"),   T), $now)).   -- 1 row
    miss(C) :- gen(C, $lit(R, main, $cons($var("QQQ"), T), $now)).   -- 1 row

Both matched, so neither matched a name — `unreifyTerm` had rewritten the
literal into a variable. A rule may *transport* and *construct* a reified
variable when the name arrives through the body; it may not write one as a
literal, nor match one by name.

## Ring 0 does not shrink usefully

`Rofl.fromSnapshot` already bypasses the parser, so ring 0 need not be a ROFL
parser at all. The question is how small it gets, and it was measured against
a working ring 1 — grammar as facts, tokenizer and chart parser as rules —
that parses `q(X) :- p(X), r(X, b).` into a tree.

- Surface enumerated from `src/parser.ts`: **28 features**.
- Ring 1 uses **20**; a saturation walk adds back escaping, because the
  character-class table needs `cls("\"", quote).` — **21 of 28**.
- Dropped: `$`-names, wildcards, negative literals, `* / mod`, parenthesised
  expressions, **perspectives**, **temporal markers**. The last two go
  because ring 1 parses text rather than reasoning about a world.
- Oracle, exact and free: a parser with those seven cut out gives a
  byte-identical `97848ee2e4bb3c96d3a7707e39b0c88a` over ring 1's canonical
  clauses.
- Negative control: it rejects `boot.rofl` on `$`, `js-modules.rofl` on `[`,
  `findings.rofl` on `\`, and accepts 21 of the corpus 67.
- Code: 231 → 177 lines, **54 saved, 23%**.

**The 23% is on the wrong side of the book.** Ring 0 loses 54 lines while the
host gains a promoter and the kernel gains two operations. As a way to get the
parser out of the engine, it does not pay.

What survives is the justification recorded on 2026-09-01 — a why-tree for a
parse, a `whynot` for a failure, ambiguity as a counted number — and the last
of those was *observed* on the first run rather than promised: the chart
returned a spurious `factnode` at index 14, correctly seeing `r(X, b).` as a
fact inside the rule.

## A macro layer, by contrast, is free

A term-level macro never touches text, so only wall 2 applies, and it costs one
host promoter of about twenty lines built from `unreifyLit` and `addClause`.

    closure(reaches, edge).          -- the whole user program

    ?- reaches(X, Y)  ->  a→b | a→c | a→d | b→c | b→d | c→d

    why reaches(a, d):
      reaches[main](a,d)  <= ra025e2f9
        reaches[main](a,c)  <= ra025e2f9
          reaches[main](a,b)  <= r537887ae
            edge[main](a,b) [axiom]

The why-tree walks the generated rules: the macro is not opaque, and every
existing audit applies to a generated rule for free because a generated rule is
an ordinary row of reflection.

Open: **provenance** — the installed rule's trail names `ra025e2f9` with no
link back to the declaration that produced it; and **hygiene** —
`vars("X", "Y", "Z")` is a manual gensym, and two nested sugars will capture
each other.

### It is not syntactic sugar, and calling it that was the error

`closure(reaches, edge).` is an ordinary fact. Nothing about the grammar
changed. Measured against the real parser afterwards, the free category is
anything expressible as a **term**:

| accepted today | refused today |
|---|---|
| `closure(reaches, edge).` | `reaches := edge+.` |
| `define(reaches, transitive_of(edge)).` | `reaches <- edge, edge.` |
| `project(r, cols(a, b, c)).` | `edge(X, *, Z)` |
| `macro("reaches := edge+").` | `group { … }`, `p :- q ; r.` |

So the free category is new **vocabulary**, not new syntax — wide only because
ROFL's surface is thin, which is the Lisp bargain and not a property of this
design. The join is the last row of the left column: a string is a legal term,
so arbitrary surface syntax travels inside one with no parser change, and the
thing that reads it is ring 1 — at which point the cost is exactly `str_sub`
and `atom_of`.

## What the owner's notation exposed

Asked for an example of why sugar is wanted, the owner wrote testimony:

    [alice]
    * bob is jerk
    * alice delivered pizza yesterday at 20:00

Today a perspective is a bracket on **every literal**, which says the book is a
property of each statement. It is a property of the **source** — a witness, a
document, a session. The block form is not brevity; the current notation
misplaces where the perspective lives.

Then the sharper version, separating author from book:

    @alice
    [tells]   * bob is a jerk
    [thinks]  * bob is cute

The model already holds half of this: `authority(tells, alice).` and
`authority(thinks, alice).` both load, and `isa[B](bob, W)` returns
`tells/jerk` beside `thinks/cute`. A nested proposition rides along as a term.

What does not hold is the namespace. A book is a flat atom carrying no owner,
so two authors granted `tells` share **one** book and nothing says whose
statement is whose. The repair is blocked in both directions: a compound
perspective `isa[tells(alice)](…)` is refused by the parser (`expected ']',
got '('`), and the flattened `alice_tells` is accepted but cannot be
*generated*, because building it is concatenation.

The way out that fits this repository's own shape is a **host emitter**: rules
emit `book_of(alice, tells)`, the promoter mints the atom, the audit counts the
loan, and the kernel does not grow. The better answer on the merits — a
perspective as a compound term — is deeper than the parser, because the store
keys a perspective by string.

This also gives `f_naming_yourself_is_itself_a_forgery` a reading it did not
have: when the book is `tells` and the author is `alice`, the self-signature on
the preamble disappears, because author and book have stopped being one name.

## Two process notes, both paid for here

**A demo without a *before* is not a measurement.** The first sugar run used
`flow` and `flows_to`, both already defined in `boot.rofl`, so the closure was
computed by boot's rules and the demo would have been reported as a success
while proving nothing. What caught it was the negative control being
*implausible* — `before promotion: 1 rows`, when the whole point was 0 — and
not a test and not reading the output.

**A working demo answers the question it answers, not the one that was asked.**
I built the macro, priced it, and called it sugar throughout; the tell was one
grep away and I never ran it. The question that would have settled it before
the first line of code: **which token is new?**

---

# Addendum, same day: the denominator was wrong

Everything above measures ring 0 by asking what syntax *my* ring 1 happened to
be written in. That denominator is circular — ring 1's source uses whatever I
chose to write it in — and the owner supplied one that is not:

> **Keep only what maps directly to a host operation and is inexpressible
> otherwise.**

## `:-` is provably sugar

A snapshot was hand-extended with rows for a rule that never passed through the
parser, and restored through `Rofl.fromSnapshot`:

    rule(r_step).
    concludes(r_step, reaches).
    conclusion_lit(r_step, 1, $lit(reaches, main, [$var("X"), $var("Z")], $now)).
    premise_lit(r_step, 1, $lit(reaches, main, [$var("X"), $var("Y")], $now)).
    premise_lit(r_step, 2, $lit(edge,    main, [$var("Y"), $var("Z")], $now)).

It runs — the full closure of a three-edge chain, 6 rows — and the why-tree
names `r_step` and `r_base` down to `edge[main](a,b) [axiom]`.
`src/engine.ts:2` already said the evaluator reads rules only from the
reflected store; this is that sentence made visible from outside.

So `:-` is an encoding over facts, and so are variables (`$var`), perspectives
and tenses (arguments of `$lit`), negation (`$not`) and every builtin
(`$builtin`). None is a host operation.

## Ring 0 is then 60 lines, not 177

A reader of **terms and facts only** — atoms, integers, negative integers,
strings with escapes, `$`-names, nested compounds, argument lists, `rel(args).`
— is **60 code lines against 231**, a saving of **74%**, and it reads a
reflection-only program correctly. Thirteen of the twenty-eight surface
features survive; the fifteen that go are every encoding over a term.

| criterion | features | ring 0 | saving |
|---|---|---|---|
| what ring 1's source happens to use | 21 / 28 | 177 lines | 23% |
| **what the host cannot do without** | **13 / 28** | **60 lines** | **74%** |

The tell that the first number was incidental was in its own output: the seven
droppable features were perspectives, tenses, wildcards, arithmetic — a list
with no principle in it. A principled boundary states itself in one sentence;
an incidental one can only be enumerated.

## Three relocations, not savings

1. **Ring 0 must be allowed to write `conclusion_lit`**, which the load path
   refuses today. The protection becomes *trusted caller* rather than *nobody*.
2. **Ring 1 stops being optional.** Nobody hand-writes
   `conclusion_lit(r, 1, $lit(…))`, so the ergonomics of the whole language
   move into a layer that does not exist yet — where today a person can write
   ROFL with no layer at all.
3. **Ring 1 ships as a snapshot, not as source**, since it cannot be written in
   its own subset without being hand-encoded. `Rofl.fromSnapshot` already
   supports this, and it is how a self-hosting compiler ships its bootstrap
   image anyway.

Also moved rather than removed: the language-level refusals (`'@next' is not
allowed in rule bodies`) stop being parser errors and become rules — auditable,
and unwritten.

And the criterion has one step left in it: a fact is itself
`$fact(Rel, Book, Args)`, so a ring 0 reading **one** form — a term, asserted —
would be smaller still. That is S-expressions.

---

# Addendum: escapes are C-style, and the change was a no-op

Decided by the owner and landed the same hour. The number that made it safe was
measured **before** the change: the corpus held **88 escape sequences over 69
files, and every one was a quote or a backslash** — zero `n`, `t`, `r`, `0`,
`x`, `u` — so C-style could not alter one existing string.

The oracle is the same one the two earlier host-to-rules migrations used: the
canonical clauses of all 69 files, md5 `31b3b8bb…` before and after, byte for
byte.

The table is five entries — `\n \t \r \\ \"` — and deliberately no `\xNN`, no
`\uNNNN`, no `\0`. **An unknown escape is now an error**, which is the one
backward-incompatible part and the point: dropping the backslash leaves the
program running with a value nobody wrote, and the corpus contains none, so
refusing costs nothing today and catches every typo from here on.

Beyond closing the trap, this closes a real gap: **a carriage return is now
expressible.** It was not — a literal CR is refused by `text_check` as a lone
CR, and no escape produced one, so CRLF data could not be written at all.

## Round-tripping is not the same as being writable

The first sweep reported **37 of 37 round-tripping exactly**, and that green was
hiding something the check could not look at. `escapeString` writes a character
with no named escape as *itself*, so a NUL came back through the parser
perfectly — the pair really is inverse — while the source text it produced
carried a raw control byte that `text_check` refuses.

The property tested was **inversion**; the property that mattered was
**writability**, and a value can round-trip out of a file nobody can commit.
The repair is in the escaper, not the test: it now refuses a character it
cannot write legally and names it. And `test/escapes.test.ts` sweeps the whole
boundary — every byte of C0 plus SPACE plus DEL, one at a time — asserting the
writable set **by name** as exactly TAB, LF, CR and SPACE, and comparing the
escaper against `text_check`'s own predicate byte for byte: **zero
disagreements over 34 bytes**.

## A test about escaping, written with escaping, is wrong twice

Three failures in one hour, all the same shape and all mine. Generating the
character-class table through Python put four backslashes where two were meant,
so the file declared a two-character sequence to be the quote class. Writing the
escape test through a heredoc produced literal backslash-quote pairs and the
file would not lex. And a shell heredoc for the boundary sweep was **refused by
the tool itself for containing a literal DEL** — the exact byte the sweep was
about.

When the subject of a file is escaping and its notation is also escaping, a
mistake in the notation looks exactly like a finding about the subject, and no
reading of the source separates them. `test/escapes.test.ts` therefore contains
**not one backslash in its own literals**: every sequence is assembled from
character codes. An instrument must not be built out of the material it
measures.
