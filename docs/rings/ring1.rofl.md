---
world: ring1
books: main
default: main
---

# ring1

> ring1.rofl — the ROFL front end, written in ROFL.
> 
> A token is a PAIR OF INDICES and never text: the kernel has no
> substring-by-range destructor and extending a string is concatenation,
> which the finiteness proof forbids. Names therefore travel to the host
> promoter as ranges, and keywords are matched CHARACTER BY CHARACTER
> against `str_char`, which needs no kernel change at all.
> 
> What this covers: comments, facts, rules, `not`, perspective brackets with
> an atom OR a variable, temporal markers, builtins and arithmetic with
> precedence and parentheses, compound terms, clause-local wildcards, and
> string literals with C-style escapes. What it does NOT cover is one thing:
> a NEGATIVE INTEGER LITERAL, left out on purpose because `X - 1` and `X, -1`
> are genuinely ambiguous and the host resolves them by parsing greedily from
> the left, which a chart does not do.
> 
> Coverage over the corpus is MEASURED by test/example-ring1.test.ts rather
> than claimed here.

> THE GRAMMAR SEALS ITS OWN RULE REFLECTION, and this line is the tower's
> floor declaration. Everything below it is a parser: 126 rules that nobody
> audits and nobody reflects on, forked once per clause of every file parsed
> (examples/ring1/demo.ts, `parseFile`). MEASURED on the image: 461 of 2450
> facts are the four rows this withholds, 18.8% of what the fork copies, and
> the parse is byte-identical without them -- ablated cold, with `safetyMemo`
> forced to miss, against the canonical clauses.
> 
> IT MUST STAND BEFORE THE FIRST RULE. `addClause` reads the declaration off
> the store as each clause arrives, so boot.rofl -- loaded first by `world()`
> -- keeps its reflection whole and only the floor above it is sealed. That
> order IS the mechanism rather than an artefact of it.
> 
> WHAT IT COSTS, written here because it is a real loss: boot.rofl's
> `malformed`, `leak` and `unmoded` audits can no longer see these 126 rules,
> and `rule_known` no longer counts them. They do not go quietly -- the kernel
> writes `hole($sealed(rules), reflection_sealed)` into the store, so an audit
> that comes back empty here stands beside a fact saying why, and a query for
> one of the four relations refuses instead of answering nothing.

Reads:

- from charclass: [cls](charclass.rofl.md#cls)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="opens_str"></a>A position opens a string if [the character at](#kind) it is a `quote`.
- <a id="code_at"></a>A position is code if [the scanner is in](#st) `code` before it.
- <a id="tokstart"></a>A position starts a token if [a token runs from](#tok) it to a position J.
- <a id="preceded"></a>A position follows a token if [the token after](#nexttok) a position J starts at it.
- <a id="p"></a>There is a K at a position I if [the punctuation at](#punct) I is a K.
- <a id="keyword"></a>A position starts a keyword if it [spells the keyword for negation](#kw_not).
- <a id="consumed"></a>A position ends a two-character operator if [the two-character operator](#op2) Op runs from a position I to it.
- <a id="starts_op2"></a>A position starts a two-character operator if [the two-character operator](#op2) Op runs from it to a position J.
- <a id="parses_at"></a>A position starts a clause that parses if [the clause from](#clause_at) it to a position D has the head H and the body B.
- <a id="in_tok"></a>A position is inside a token if [the token at](#spanto) a position I spans it.
- <a id="has_prev_wild"></a>In the clause at a position C0 some wildcard comes before a position I if [in the clause at](#prev_wild) C0 the wildcard before I is at a position J.
- <a id="wild"></a>The wildcard at a position I is number N if [in the clause at](#wild_rank) a position C0 the wildcard at I is number N.

<a id="sealed"></a>`sealed` includes `rules`.

Declared as facts:

- <a id="src"></a>`src` — no rows: declared so a rule may read it
- `cls` — no rows: declared so a rule may read it

> ---------------------------------------------------------------- characters

<a id="len"></a>The source is N characters long if [the source is](#src) S and N is the length of S.

<a id="at"></a>A position E is in the source either:

1. if [the source is](#len) N characters long, 0 < N, and E is 0;
2. if all of:
   - a position I [is in the source](#at);
   - [the source is](#len) N characters long;
   - E is I + 1;
   - E < N.

<a id="ch"></a>A character stands at a position I if I [is in the source](#at), [the source is](#src) S, and it is the character I of S.

<a id="kind"></a>The character at a position I is a K if a character C [stands at](#ch) I and C [is a](charclass.rofl.md#cls) K.

> ------------------------------------------------------- the scanner state
> A QUOTE INSIDE A COMMENT USED TO OPEN A STRING. The first version paired
> quotes across the whole file and detected comments separately, which is a
> chicken and egg: a comment is only a comment outside a string, and a string
> only starts outside a comment. Measured cost: examples/cram/flight_log.rofl
> and examples/jopa/calibration.rofl both carry a quoted phrase in prose, and
> both were refused at the comment rather than at anything real.
> 
> The fix is what a hand-written lexer does: ONE LEFT-TO-RIGHT WALK carrying a
> state. `st(I, S)` is the state BEFORE reading position I, and the walk is
> positive recursion with the character tests as its only negation, so there
> is no cycle at all.

<a id="st"></a>The scanner is in `code` before 0 if 0 [is in the source](#at).

> `step` BEFORE the position it is about. `step(I, S, S2)` reads only I and S,
> both already bound by `st(I, S)`, and it is the premise that fails: on a
> 34-byte clause 101 states enter and 34 leave. Asking `at(I2)` first pays the
> successor check on all 101. MEASURED: 271 accumulator elements against 237.

The scanner is in a state S2 before a position I2 if all of:
  - [the scanner is in](#st) a state S before a position I;
  - reading I in S [leaves the scanner in](#step) S2;
  - I2 is I + 1;
  - I2 [is in the source](#at).

<a id="opens_cmt"></a>A position opens a comment if all of:
  - [the character at](#kind) it is a `dash`;
  - a position I1 is it + 1;
  - [the character at](#kind) I1 is a `dash`.

<a id="step"></a>Reading a position I in a state N leaves the scanner in a state E either:

1. if I [opens a string](#opens_str), N is `code`, and E is `str`;
2. if all of:
   - I [opens a comment](#opens_cmt);
   - N is `code`;
   - E is `cmt`;
   - unless I [opens a string](#opens_str);
3. if all of:
   - I [is in the source](#at);
   - N is `code`;
   - E is `code`;
   - I neither [opens a string](#opens_str) nor [opens a comment](#opens_cmt).

> a backslash escapes the next character, so it cannot close the string

Reading a position I in a state N leaves the scanner in a state E either:

1. if [the character at](#kind) I is a `backslash`, N is `str`, and E is `esc`;
2. if [the character at](#kind) I is a `quote`, N is `str`, and E is `code`;
3. if all of:
   - I [is in the source](#at);
   - N is `str`;
   - E is `str`;
   - unless [the character at](#kind) I is a `quote`;
   - unless [the character at](#kind) I is a `backslash`;
4. if I [is in the source](#at), N is `esc`, and E is `str`;
5. if [the character at](#kind) I is a `nl`, N is `cmt`, and E is `code`;
6. if all of:
   - I [is in the source](#at);
   - N is `cmt`;
   - E is `cmt`;
   - unless [the character at](#kind) I is a `nl`.

> ------------------------------------------------------------ string tokens
> QUOTES ARE RARE AND `code` IS NEARLY EVERYTHING. Written `st(I, code),
> kind(I, quote)` this builds one solution per code position and throws all of
> them away at the second premise on a clause with no string in it: 135
> accumulator elements for zero conclusions, against 68 this way. `str_close`
> below is left as it stands - there both premises are rare, and swapping it
> measured at zero.

A position

- <a id="str_open"></a>starts a string literal if [the character at](#kind) it is a `quote` and [the scanner is in](#st) `code` before it.
- <a id="str_close"></a>ends a string literal if [the scanner is in](#st) `str` before it and [the character at](#kind) it is a `quote`.

<a id="close_between"></a>A string literal ends between a position I and J if all of:
  - I [starts a string literal](#str_open);
  - J [ends a string literal](#str_close);
  - a position K [ends a string literal](#str_close);
  - I < K;
  - K < J.

<a id="strtok"></a>A string token runs from a position I to a position J if all of:
  - I [starts a string literal](#str_open);
  - J [ends a string literal](#str_close);
  - I < J;
  - unless [a string literal ends between](#close_between) I and J.

> -------------------------------------------------------------------- tokens
> word tokens
> 
> THE GROWING RELATION LEADS, and this is the opposite of the rule of thumb
> that says put the rarest premise first. `code_at` holds one fact per code
> position and `kind(I, lower)` nine on a 34-byte clause, so "rarest first"
> names `kind`. Written that way the three rules cost 377 + 272 + 68
> accumulator elements; written this way, 135 each. The reason is semi-naive
> evaluation: `st` is a left-to-right walk that yields ONE fact a round, so
> every round hands this rule a `code_at` delta of one - and a delta only
> narrows the position it stands at. With `kind` first the rule rescans all
> nine letters per round and probes `code_at` nine times; with `code_at`
> first it starts from the single new position. MEASURED: 7106 -> 6794 total
> width for the three lines.
> 
> It does NOT generalise to `punct` below, and that was measured too: the same
> swap there costs 95 elements, because `kind(I, comma)` holds two facts to
> `code_at`'s thirty-four and the scan it saves is smaller than the one it
> adds. The rule is therefore "lead with the relation whose delta the round
> actually carries, when it is not much bigger than the other" - not "lead
> with the rarest".

<a id="wordch"></a>A position is a word character if it [is code](#code_at) and [the character at](#kind) it is a `lower` or `upper` or `digit`.

> READ FROM THE WORD CHARACTER, NOT FROM EVERY POSITION - `dollar_before`'s
> defect, in the rule two lines above the comment that records it. Written as
> `at(I), 0 < I, J is I - 1, wordch(J)` this asks EVERY position of the source
> whether a word character stands behind it: 49 firings, 516 solutions off
> `at`, and 500 of them thrown away by `wordch` at the last premise for 15
> conclusions. Inverting `J is I - 1` to `I is J + 1` frees the rare premise
> to lead and drops the whole accumulator to one element per word character;
> the `0 < I` guard goes with it, since `wordch(J)` already gives J >= 0.
> MEASURED with scanners/eval_cost.ts: 549 accumulator elements against 94,
> 6.0% of the parse's entire join work, for the same 15 conclusions and a
> byte-identical parse.

A position

- <a id="prevword"></a>follows a word character if a position J [is a word character](#wordch), it is J + 1, and it [is in the source](#at).
- <a id="word_start"></a>starts a word if it [is a word character](#wordch) and it neither [follows a word character](#prevword) nor [follows a dollar sign](#dollar_before).

> AND A `$` SWALLOWS WHAT FOLLOWS IT. Without this both `$cons` and `cons`
> were word starts - `$` is no `wordch`, so the letter after it had no word
> character before it - and the chart returned the inner one as a SECOND
> clause. The host has this for free by consuming left to right; a chart has
> to say it.
> READ FROM THE `$`, NOT FROM EVERY POSITION, and the order is the whole of
> it. Written as `at(I), 0 < I, J is I - 1, kind(J, dollar), code_at(J)` this
> rule starts at EVERY position of the source and asks each one whether a `$`
> stands behind it -- an accumulator as wide as the input, filtered to nothing
> at the fourth premise, since most clauses hold no `$` at all. MEASURED with
> scanners/eval_cost.ts: 1881 accumulator elements against 101, and 20% of the
> whole parse's join work for zero conclusions. Starting from the RARE thing
> and computing the position forward costs one element per `$`. End to end,
> three interleaved arms on an 88-byte clause: 89.5 ms against 72.8, 19%.
> 
> `planBody` cannot do this for us, and it is worth saying why: the arithmetic
> pins the order. `J is I - 1` needs I bound, so `at(I)` had to lead; only
> INVERTING it to `I is J + 1` frees the rare premise to go first, and that is
> a rewrite of the rule rather than a permutation of its body.

<a id="dollar_before"></a>A position follows a dollar sign if all of:
  - [the character at](#kind) a position J is a `dollar`;
  - J [is code](#code_at);
  - it is J + 1;
  - it [is in the source](#at).

> `$` STARTS A NAME AND NEVER CONTINUES ONE, which is src/parser.ts's rule to
> the letter: every reflected name the kernel builds - $lit, $cons, $var, $nil,
> $not, $builtin, $fact and the tense atoms - carries the marker first and
> nowhere else, so admitting it in leading position makes the reflection
> readable from the language that produces it while leaving `_$0`, the parser's
> own name for an anonymous variable, unwritable by hand.
> 
> MEASURED BEFORE IT WAS WRITTEN: ring 1 refused `p($kernel).` outright while
> the host read it, and `$kernel` stands in boot.rofl - so the front end could
> never have parsed the kernel's own program. The new character-level coverage
> is what made that loud instead of odd.

A position starts a word if [the character at](#kind) it is a `dollar` and it [is code](#code_at).

<a id="wext"></a>A word starting at a position I reaches a position N either:

1. if I [starts a word](#word_start) and N is I;
2. if all of:
   - [a word starting at](#wext) I reaches a position J;
   - N is J + 1;
   - N [is a word character](#wordch).

<a id="word"></a>A word runs from a position I to a position J if all of:
  - [a word starting at](#wext) I reaches J;
  - a position J2 is J + 1;
  - unless J2 [is a word character](#wordch).

> punctuation tokens

<a id="punct"></a>The punctuation at a position I is a N either:

1. if [the character at](#kind) I is a `lpar`, I [is code](#code_at), and N is `lpar`;
2. if [the character at](#kind) I is a `rpar`, I [is code](#code_at), and N is `rpar`;
3. if [the character at](#kind) I is a `lbrack`, I [is code](#code_at), and N is `lbrack`;
4. if [the character at](#kind) I is a `rbrack`, I [is code](#code_at), and N is `rbrack`;
5. if [the character at](#kind) I is a `comma`, I [is code](#code_at), and N is `comma`;
6. if [the character at](#kind) I is a `dot`, I [is code](#code_at), and N is `dot`;
7. if [the character at](#kind) I is a `at`, I [is code](#code_at), and N is `at`.

> the neck `:-` is one token

<a id="neck"></a>The neck runs from a position I to a position J if all of:
  - [the character at](#kind) I is a `colon`;
  - I [is code](#code_at);
  - J is I + 1;
  - [the character at](#kind) J is a `dash`.

<a id="tok"></a>A token runs from a position I to a position J either:

1. if [a word runs from](#word) I to J;
2. if [a string token runs from](#strtok) I to J;
3. if [the punctuation at](#punct) I is a K and J is I;
4. if [the neck runs from](#neck) I to J.

> ------------------------------------------------------------- the tok chain

> THE FIRST VERSION OF THIS WAS CUBIC AND IT KILLED THE PARSE. `follows` over
> all pairs of token boundaries plus `blocked` over all triples costs O(n^3)
> in tokens; on rules/strata.rofl - 123 tokens, 2207 characters - the
> evaluation came back PARTIAL with hole(space_exhausted), and the parse
> returned zero clauses and no complaint. Walking forward one character at a
> time instead is linear per token: `scan(J, K)` is "K is reachable from
> boundary J without meeting a token start".

<a id="scan"></a>The scan after the token ending at a position J has reached a position K if [a token runs from](#tok) a position I to J, K is J + 1, and K [is in the source](#at).

The scan after the token ending at a position J has reached a position K2 if all of:
  - [the scan after the token ending at](#scan) J has reached a position K;
  - K2 is K + 1;
  - K2 [is in the source](#at);
  - unless K [starts a token](#tokstart).

<a id="nexttok"></a>The token after a position J starts at a position K if [the scan after the token ending at](#scan) J has reached K and K [starts a token](#tokstart).

<a id="first_tok"></a>The first token starts at a position I if I [starts a token](#tokstart), unless I [follows a token](#preceded).

> ---------------------------------------------------------------- token kinds

<a id="identtok"></a>A name runs from a position I to a position J if [a word runs from](#word) I to J and [the character at](#kind) I is a `lower` or `dollar`.

<a id="vartok"></a><a id="inttok"></a>A variable/numeral runs from a position I to a position J if [a word runs from](#word) I to J and [the character at](#kind) I is a `upper`/`digit`.

> Keywords, matched CHARACTER BY CHARACTER against `str_char`. No kernel
> change is needed for this and no token ever carries its text.

A position

- <a id="kw_not"></a>spells the keyword for negation if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 2;
  - "n" [stands at](#ch) it;
  - a position K is it + 1;
  - "o" [stands at](#ch) K;
  - "t" [stands at](#ch) J.
- <a id="kw_is"></a>spells the keyword for evaluation if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 1;
  - "i" [stands at](#ch) it;
  - "s" [stands at](#ch) J.
- <a id="kw_mod"></a>spells the keyword for the remainder if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 2;
  - "m" [stands at](#ch) it;
  - a position K is it + 1;
  - "o" [stands at](#ch) K;
  - "d" [stands at](#ch) J.
- <a id="kw_init"></a>spells the keyword for the first tick if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 3;
  - "i" [stands at](#ch) it;
  - a position K is it + 1;
  - "n" [stands at](#ch) K;
  - a position L is it + 2;
  - "i" [stands at](#ch) L;
  - "t" [stands at](#ch) J.
- <a id="kw_now"></a>spells the keyword for this tick if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 2;
  - "n" [stands at](#ch) it;
  - a position K is it + 1;
  - "o" [stands at](#ch) K;
  - "w" [stands at](#ch) J.
- <a id="kw_next"></a>spells the keyword for the next tick if all of:
  - [a word runs from](#word) it to a position J;
  - J is it + 3;
  - "n" [stands at](#ch) it;
  - a position K is it + 1;
  - "e" [stands at](#ch) K;
  - a position L is it + 2;
  - "x" [stands at](#ch) L;
  - "t" [stands at](#ch) J.

> ONLY `not` IS A KEYWORD IN TERM POSITION. `is` and `mod` are operators, and
> the host recognises them ONLY where an operator can stand - so `optok(I, J,
> is)` has `is` as an ordinary ATOM in an argument. Excluding all three from
> `term` meant ring 1 COULD NOT PARSE ITS OWN SOURCE, which is the defect
> self-application was supposed to find and did, the first time L1 was pointed
> at L2. `not` stays excluded because it opens a negated literal.

> ------------------------------------------------------------------ operators
> Two-character operators first; their second character must not also become
> a token of its own, which is what `consumed` is for.
> `consumed` must read the TWO-CHARACTER operators ONLY. Deriving it from
> `optok` and then negating it inside `optok` is a negative cycle, and the
> round evaluator refused the whole program for it: `round 4 settled nothing
> while ... remained`. Splitting the two-character forms into their own
> relation puts the negation between two strata instead of inside one.

<a id="op2"></a>The two-character operator N runs from a position I to a position J either:

1. if all of:
   - [the character at](#kind) I is a `bang`;
   - J is I + 1;
   - [the character at](#kind) J is a `eq`;
   - I [is code](#code_at);
   - N is `ne`;
2. if all of:
   - [the character at](#kind) I is a `lt`;
   - J is I + 1;
   - [the character at](#kind) J is a `eq`;
   - I [is code](#code_at);
   - N is `le`;
3. if all of:
   - [the character at](#kind) I is a `gt`;
   - J is I + 1;
   - [the character at](#kind) J is a `eq`;
   - I [is code](#code_at);
   - N is `ge`.

> AND THE FIRST CHARACTER TOO. `consumed` marks the SECOND character of a
> two-character operator, so guarding a lone `<` with it checks the wrong
> index and `<=` was read as `<` followed by a stray `=` - both parses
> survived and the clause count came out 137 against the host's 131. Found
> by pointing L1 at L2's own source, which is full of `<=`.

<a id="optok"></a>The comparison Op runs from a position I to a position J either:

1. if [the two-character operator](#op2) Op runs from I to J;
2. if all of:
   - [the character at](#kind) I is a `eq`;
   - I [is code](#code_at);
   - J is I;
   - Op is `eq`;
   - I neither [ends a two-character operator](#consumed) nor [starts a two-character operator](#starts_op2);
3. if all of:
   - [the character at](#kind) I is a `lt`;
   - I [is code](#code_at);
   - J is I;
   - Op is `lt`;
   - I neither [ends a two-character operator](#consumed) nor [starts a two-character operator](#starts_op2);
4. if all of:
   - [the character at](#kind) I is a `gt`;
   - I [is code](#code_at);
   - J is I;
   - Op is `gt`;
   - I neither [ends a two-character operator](#consumed) nor [starts a two-character operator](#starts_op2).

> A KEYWORD OPERATOR SPANS ITS WHOLE WORD. `nexttok` is keyed on a token's
> END, so returning the START of a two- or three-letter word leaves the next
> lookup with no boundary to stand on and the clause silently fails to form.

The comparison `is` runs from a position I to a position J if I [spells the keyword for evaluation](#kw_is) and [a word runs from](#word) I to J.

<a id="arithtok"></a>The arithmetic operator E runs from a position I to a position N either:

1. if [the character at](#kind) I is a `plus`, I [is code](#code_at), N is I, and E is `plus`;
2. if [the character at](#kind) I is a `star`, I [is code](#code_at), N is I, and E is `star`;
3. if [the character at](#kind) I is a `slash`, I [is code](#code_at), N is I, and E is `slash`;
4. if all of:
   - I [spells the keyword for the remainder](#kw_mod);
   - [a word runs from](#word) I to N;
   - E is `mod`.

> A LONE DASH IN CODE IS MINUS, and the two exclusions are both load-bearing.
> `--` opens a comment, but the scanner's state BEFORE the first dash is still
> `code`, so without `not opens_cmt(I)` every comment in the corpus began with
> a spurious minus token and all 23 files were refused - measured, after eight
> hand-written cases all passed. `:-` is the neck, and the colon before the
> dash is what tells them apart.

The arithmetic operator `minus` runs from a position I to I if all of:
  - [the character at](#kind) I is a `dash`;
  - I [is code](#code_at);
  - a position I1 is I - 1;
  - unless I [opens a comment](#opens_cmt);
  - unless [the character at](#kind) I1 is a `colon`.

<a id="addop"></a><a id="mulop"></a>The additive/multiplicative operator Op runs from a position I to a position J if [the arithmetic operator](#arithtok) Op runs from I to J and Op [adds/multiplies](#plusminus).

<a id="plusminus"></a>`plusminus` includes `plus`, `minus`.

<a id="timesdiv"></a>`timesdiv` includes `star`, `slash`, `mod`.

A token runs from a position I to a position J either:

1. if [the comparison](#optok) Op runs from I to J;
2. if [the arithmetic operator](#arithtok) Op runs from I to J.

> --------------------------------------------------------------- the names
> WHERE THE RANGES BECOME NAMES, and until 2026-09-04 they could not: the
> kernel had no substring-by-range destructor and no string-to-atom, so a
> token knew WHERE it was and never WHAT it said, and the host had to slice
> the source for every name. `str_sub` and `atom_of` moved that here.
> 
> The consequence is not brevity. The promoter used to know TWELVE shapes of
> this grammar's tree; now it knows the atoms these rules put in it, so the
> bottom of the tower stopped depending on the levels above it.

<a id="tok_text"></a>The text from a position I to a position J is S if all of:
  - [a token runs from](#tok) I to J;
  - [the source is](#src) Src;
  - L is J - I + 1;
  - S is the substring of Src from I of length L.

> ONLY AN IDENT BECOMES AN ATOM. Run over every token, `atom_of` is asked
> for a name from a bracket, a neck, a quoted string and a capitalised
> variable, and each is a loud `atom_unwritable` hole - which is how the
> new guard announced that it was being called on the wrong things, the
> first time it ran.

<a id="tok_name"></a>The name from a position I to a position J is an atom X if all of:
  - [a name runs from](#identtok) I to J;
  - [the text from](#tok_text) I to J is S;
  - X is the atom of S.

> ---------------------------------------------------------------------- terms

<a id="term"></a>The term from a position I to a position J is a term X if all of:
  - [a name runs from](#identtok) I to J;
  - [the name from](#tok_name) I to J is X;
  - unless I [starts a keyword](#keyword).

> A WILDCARD KEEPS ITS INDEX and an ordinary variable keeps its name. The
> rank of `_` is clause-local and positional, so text alone cannot carry it.

The term from a position I to a position J is a term N either:

1. if all of:
   - [a variable runs from](#vartok) I to J;
   - [the text from](#tok_text) I to J is S;
   - N is $var(S);
   - unless I [holds a wildcard](#wildtok);
2. if I [holds a wildcard](#wildtok), J is I, and N is the wildcard at I;
3. if all of:
   - [a numeral runs from](#inttok) I to J;
   - [the text from](#tok_text) I to J is S;
   - N is the integer written S.

> A NEGATIVE INTEGER LITERAL, read exactly where src/parser.ts reads one: in
> PRIMARY position, a dash whose next token is an integer. `expr` takes a dash
> as a binary operator only AFTER a left operand, so a dash reaching a term has
> none - which is the host's positional rule restated as a production instead
> of as a greedy scan. The digits travel alone and the promoter negates, rather
> than the text of the whole span travelling: the host is token-based, so it
> reads `- 1` as -1 too, and a span carrying the space would not parse.
> Measured before it was written: 24 negative literals in the 71 .rofl files,
> in goof, npc, sensors, slop and three more.

The term from a position I to a position K is a term N either:

1. if all of:
   - [the arithmetic operator](#arithtok) `minus` runs from I to I;
   - [the token after](#nexttok) I starts at a position J;
   - [a numeral runs from](#inttok) J to K;
   - [the text from](#tok_text) J to K is S;
   - N is the negative integer written S;
2. if all of:
   - [a string token runs from](#strtok) I to K;
   - [the text from](#tok_text) I to K is S;
   - N is the string written S.

> compound: f(args)

The term from a position I to a position C is comp(an atom N, a list X) if all of:
  - [a name runs from](#identtok) I to a position J;
  - [the name from](#tok_name) I to J is N;
  - [the token after](#nexttok) J starts at a position K;
  - [there is a](#p) `lpar` at K;
  - [the token after](#nexttok) K starts at a position S;
  - [the arguments from](#args) S to a position E are X;
  - [the token after](#nexttok) E starts at C;
  - [there is a](#p) `rpar` at C;
  - unless I [starts a keyword](#keyword).

<a id="args"></a>The arguments from a position I to a position J are $cons(a term T, `$nil`) if [the term from](#term) I to J is T.

The arguments from a position I to a position J2 are $cons(a term T, a list R) if all of:
  - [the term from](#term) I to a position J is T;
  - [the token after](#nexttok) J starts at a position K;
  - [there is a](#p) `comma` at K;
  - [the token after](#nexttok) K starts at a position I2;
  - [the arguments from](#args) I2 to J2 are R.

> ---------------------------------------------------------- arithmetic, typed
> Left-associative BY CONSTRUCTION: the right operand of each level is the
> level below, so `a - b - c` has exactly one parse and the chart reports no
> ambiguity. Getting this wrong would show up as a silent divergence, which
> the corpus oracle pins at zero.

<a id="prim"></a>The operand from a position I to a position J is an expression T either:

1. if [the term from](#term) I to J is T;
2. if all of:
   - [there is a](#p) `lpar` at I;
   - [the token after](#nexttok) I starts at a position S;
   - [the expression from](#expr) S to a position E is T;
   - [the token after](#nexttok) E starts at J;
   - [there is a](#p) `rpar` at J.

<a id="mul"></a>The product from a position I to a position J is an expression T if [the operand from](#prim) I to J is T.

> THE OPERATOR LEADS ALL THREE INFIX RULES (`mul`, `expr`, and `belem`'s
> builtin form). `mul(I, J, L), nexttok(J, K), mulop(K, K2, Op)` builds every
> parse of a left operand and its following token before asking whether that
> token is an operator at all - 71, 71 and 95 accumulator elements for zero
> conclusions on a clause with no arithmetic in it, against 29 each.

The product from a position I to a position C is op(OpS, an expression L, an expression R) if all of:
  - [the multiplicative operator](#mulop) Op runs from a position K to a position K2;
  - [the text from](#tok_text) K to K2 is OpS;
  - [the token after](#nexttok) a position J starts at K;
  - [the product from](#mul) I to J is L;
  - [the token after](#nexttok) K2 starts at a position S;
  - [the operand from](#prim) S to C is R.

<a id="expr"></a>The expression from a position I to a position J is an expression T if [the product from](#mul) I to J is T.

The expression from a position I to a position C is op(OpS, an expression L, an expression R) if all of:
  - [the additive operator](#addop) Op runs from a position K to a position K2;
  - [the text from](#tok_text) K to K2 is OpS;
  - [the token after](#nexttok) a position J starts at K;
  - [the expression from](#expr) I to J is L;
  - [the token after](#nexttok) K2 starts at a position S;
  - [the product from](#mul) S to C is R.

> ------------------------------------------------------------------- literals
> The literal is built from PARTS so that book and tense do not multiply into
> a rule per combination: three books times two tenses would be six copies.

<a id="relbook"></a>The relation from a position I to a position J is an atom X in the book `$bare` if all of:
  - [a name runs from](#identtok) I to J;
  - [the name from](#tok_name) I to J is X;
  - unless I [starts a keyword](#keyword).

> THE BRACKET IS THE RARE THING, so it leads both bracketed forms. Reading
> `identtok(I, J), ... nexttok(J, K), p(K, lbrack)` walks every name in the
> clause and its following token before discovering there is no `[` at all -
> 61 accumulator elements for zero conclusions on a clause with no book
> bracket, against 4 with `p(K, lbrack)` first. `nexttok(J, K)` is read with K
> bound and J free, which it can be: nothing here is arithmetic, so this is a
> permutation of a body and not a rewrite of one.

The relation from a position I to a position R is an atom X in the book BA either:

1. if all of:
   - [there is a](#p) `lbrack` at a position K;
   - [the token after](#nexttok) a position J starts at K;
   - [a name runs from](#identtok) I to J;
   - [the name from](#tok_name) I to J is X;
   - [the token after](#nexttok) K starts at a position B;
   - [a name runs from](#identtok) B to a position B2;
   - [the name from](#tok_name) B to B2 is BA;
   - [the token after](#nexttok) B2 starts at R;
   - [there is a](#p) `rbrack` at R;
   - unless I [starts a keyword](#keyword);
2. if all of:
   - [there is a](#p) `lbrack` at a position K;
   - [the token after](#nexttok) a position J starts at K;
   - [a name runs from](#identtok) I to J;
   - [the name from](#tok_name) I to J is X;
   - [the token after](#nexttok) K starts at a position B;
   - [a variable runs from](#vartok) B to a position B2;
   - [the text from](#tok_text) B to B2 is BS;
   - [the token after](#nexttok) B2 starts at R;
   - [there is a](#p) `rbrack` at R;
   - BA is $var(BS);
   - unless I [starts a keyword](#keyword).

<a id="lit0"></a>The call from a position I to a position C names an atom R in the book Bk with the arguments X if all of:
  - [the relation from](#relbook) I to a position J is R in the book Bk;
  - [the token after](#nexttok) J starts at a position K;
  - [there is a](#p) `lpar` at K;
  - [the token after](#nexttok) K starts at a position S;
  - [the arguments from](#args) S to a position E are X;
  - [the token after](#nexttok) E starts at C;
  - [there is a](#p) `rpar` at C.

<a id="tmark"></a>The tense mark from a position I to a position E says a tense N either:

1. if all of:
   - [there is a](#p) `at` at I;
   - [the token after](#nexttok) I starts at a position J;
   - J [spells the keyword for the first tick](#kw_init);
   - [a word runs from](#word) J to E;
   - N is `$init`;
2. if all of:
   - [there is a](#p) `at` at I;
   - [the token after](#nexttok) I starts at a position J;
   - J [spells the keyword for this tick](#kw_now);
   - [a word runs from](#word) J to E;
   - N is `$now`;
3. if all of:
   - [there is a](#p) `at` at I;
   - [the token after](#nexttok) I starts at a position J;
   - J [spells the keyword for the next tick](#kw_next);
   - [a word runs from](#word) J to E;
   - N is `$next`.

<a id="tensed"></a>A position is followed by a tense mark if all of:
  - [the call from](#lit0) a position I to it names an atom R in the book Bk with the arguments X;
  - [the token after](#nexttok) it starts at a position K;
  - [the tense mark from](#tmark) K to a position C2 says a tense T.

<a id="lit"></a>The literal from a position I to a position C is $lit(an atom R, a book Bk, a list X, `$now`) if [the call from](#lit0) I to C names R in the book Bk with the arguments X, unless C [is followed by a tense mark](#tensed).

The literal from a position I to a position C2 is $lit(an atom R, a book Bk, a list X, a tense T) if all of:
  - [the call from](#lit0) I to a position C names R in the book Bk with the arguments X;
  - [the token after](#nexttok) C starts at a position K;
  - [the tense mark from](#tmark) K to C2 says T.

> ---------------------------------------------------------------- body & rule

<a id="belem"></a>The condition from a position I to a position C is a condition L if [the literal from](#lit) I to C is L.

The condition from a position I to a position C is $not(a literal L) if all of:
  - I [spells the keyword for negation](#kw_not);
  - [a word runs from](#word) I to a position J;
  - [the token after](#nexttok) J starts at a position K;
  - [the literal from](#lit) K to C is L.

The condition from a position I to a position C is $builtin(OpS, $cons(an expression L, $cons(an expression R, `$nil`))) if all of:
  - [the comparison](#optok) Op runs from a position K1 to a position K2;
  - [the text from](#tok_text) K1 to K2 is OpS;
  - [the token after](#nexttok) a position J starts at K1;
  - [the expression from](#expr) I to J is L;
  - [the token after](#nexttok) K2 starts at a position S;
  - [the expression from](#expr) S to C is R.

<a id="body"></a>The body from a position I to a position C is $cons(a condition B, `$nil`) if [the condition from](#belem) I to C is B.

The body from a position I to a position C2 is $cons(a condition B, a list R) if all of:
  - [the condition from](#belem) I to a position C is B;
  - [the token after](#nexttok) C starts at a position K;
  - [there is a](#p) `comma` at K;
  - [the token after](#nexttok) K starts at a position I2;
  - [the body from](#body) I2 to C2 is R.

<a id="clause_at"></a>The clause from a position I to a position D has the head L and the body N either:

1. if all of:
   - [the literal from](#lit) I to a position C is L;
   - [the token after](#nexttok) C starts at D;
   - [there is a](#p) `dot` at D;
   - N is `$nil`;
2. if all of:
   - [the literal from](#lit) I to a position C is L;
   - [the token after](#nexttok) C starts at a position K;
   - [the neck runs from](#neck) K to a position K2;
   - [the token after](#nexttok) K2 starts at a position S;
   - [the body from](#body) S to a position E is N;
   - [the token after](#nexttok) E starts at D;
   - [there is a](#p) `dot` at D.

> TOP LEVEL. The chart sees every sub-parse - `tag(Y, "hot")` inside a rule
> body is a well-formed fact on its own - so a clause counts only if it starts
> where the previous one ended. This is the chain, and the AMBIGUITY IT DROPS
> IS COUNTABLE rather than silently resolved: `clause_at` minus `parsed` is
> exactly the set of sub-parses, and the coverage test prints it.

A position

- <a id="top"></a>starts a clause of the file if [the first token starts at](#first_tok) it.
- starts a clause of the file if all of:
  - a position I [starts a clause of the file](#top);
  - [the clause from](#clause_at) I to a position D has the head H and the body B;
  - [the token after](#nexttok) D starts at it.

<a id="parsed"></a>The file has the clause from a position I to a position D with the head H and the body B if I [starts a clause of the file](#top), and [the clause from](#clause_at) I to D has the head H and the body B.

> what the chart saw and the chain rejected

<a id="subparse"></a>The clause from a position I to a position D lies inside another if [the clause from](#clause_at) I to D has the head H and the body B, unless I [starts a clause of the file](#top).

> ------------------------------------------------------------- completeness
> WITHOUT THIS THE PARSER LIES. The top-level chain walks clause to clause, so
> the first construct the grammar does not cover ends the walk and every later
> clause simply never appears - measured on examples/counter.rofl and
> rules/strata.rofl, where the host reads 3 and 10 clauses and ring 1 returned
> ZERO with no error of any kind. A prefix that looks like a whole file is the
> silent under-report this repository exists to refuse.
> 
> `stuck_at(I)` names the token where the walk stopped, so the host can refuse
> the parse and say where, instead of handing back what it managed.

<a id="stuck_at"></a>The parse is stuck at a position I if I [starts a clause of the file](#top), unless I [starts a clause that parses](#parses_at).

> `stuck_at` catches a walk that STOPPED. It does not catch a walk that never
> STARTED - measured on rules/strata.rofl, which returned zero clauses, zero
> stuck and no error, because when the first clause fails there is nothing for
> the chain to stand on. The invariant that catches both is coverage: every
> token must lie inside some accepted clause.

<a id="covered"></a>A position is covered by a clause if all of:
  - [the file has the clause from](#parsed) a position I to a position D with the head H and the body B;
  - it [starts a token](#tokstart);
  - I <= it;
  - it <= D.

<a id="uncovered"></a>No clause covers the token at a position K if K [starts a token](#tokstart), unless K [is covered by a clause](#covered).

> AND COVERAGE OVER TOKENS CANNOT SEE A CHARACTER THAT MAKES NO TOKEN.
> Measured: `p({a}).` parsed to `p[main](a)@now` while the host refused it with
> `expected a term, got '{'`, and `p(#a).` did the same - a divergence in the
> PERMISSIVE direction, which the corpus oracle cannot catch because it only
> compares files the host accepts. The brace and the hash were unclassified,
> an unclassified character makes no token, and `uncovered` quantifies over
> `tokstart`. So the invariant has to be stated over CHARACTERS.
> A SPAN WALK, not a cross join. `tok(I, J), at(K), I <= K, K <= J` asks the
> evaluator for every (token, character) pair and throws away all but the ones
> inside — 30 tokens times 82 characters on one clause. Walking each token's
> own span is linear in the file. MEASURED, arms interleaved in one process:
> 88.0 ms with the cross join, 85.0 with this, 81.4 with no character coverage
> at all — so the invariant costs 7.4% and this pays half of it back.

<a id="spanto"></a>The token at a position I spans a position N either:

1. if [a token runs from](#tok) I to a position J and N is I;
2. if all of:
   - [the token at](#spanto) I spans a position K;
   - [a token runs from](#tok) I to a position J;
   - K < J;
   - N is K + 1.

<a id="white"></a>A position is white space if [the character at](#kind) it is a `space` or `nl`.

> The two dashes of a comment stand in `code` state - the scanner only enters
> `cmt` after them - so they belong to no token and are not stray either.

A position K is white space either:

1. if K [opens a comment](#opens_cmt);
2. if a position K1 [opens a comment](#opens_cmt) and K is K1 + 1.

> THE SHARPER NEGATION FIRST. Both are ready as soon as K is bound, so the
> order is free, and `not in_tok` refuses far more than `not white` does. What
> reaches the SECOND negation is the whole of the difference: 12 elements this
> way, 56 the other way round. MEASURED: 125 accumulator elements against 81,
> for the same (empty) answer.

<a id="stray"></a>A position holds a stray character if it [is code](#code_at) and it neither [is inside a token](#in_tok) nor [is white space](#white).

> ------------------------------------------------------------------ wildcards
> ALL FIVE SILENT DIVERGENCES WERE THIS ONE THING, and it was not cosmetic. The
> host mints a FRESH NAME per wildcard, clause-local - `_$0`, `_$1` - so two
> underscores in one clause are two different variables. Read as an ordinary
> variable named `_` they become the SAME variable, which forces a join the
> author never wrote: `ast_child[code](P, _, _, C)` would demand that the
> second and third arguments be equal. The clause count matched exactly on all
> five files, which is why the oracle saw it and a count-based check would not.
> 
> The rank is computed AFTER parsing, off `parsed`, so the clause span is
> known and there is no cycle through `term`.

<a id="wildtok"></a>A position holds a wildcard if [a variable runs from](#vartok) it to a position J, it is J, and "_" [stands at](#ch) it.

<a id="wild_in"></a>The clause at a position C0 has a wildcard at a position I if all of:
  - [the file has the clause from](#parsed) C0 to a position D with the head H and the body B;
  - I [holds a wildcard](#wildtok);
  - C0 <= I;
  - I <= D.

<a id="wild_between"></a>In the clause at a position C0 a wildcard lies between a position J and I if all of:
  - the clause at C0 [has a wildcard at](#wild_in) J;
  - the clause at C0 [has a wildcard at](#wild_in) I;
  - the clause at C0 [has a wildcard at](#wild_in) a position K;
  - J < K;
  - K < I.

<a id="prev_wild"></a>In the clause at a position C0 the wildcard before a position I is at a position J if all of:
  - the clause at C0 [has a wildcard at](#wild_in) I;
  - the clause at C0 [has a wildcard at](#wild_in) J;
  - J < I;
  - unless [in the clause at](#wild_between) C0 a wildcard lies between J and I.

<a id="wild_rank"></a>In the clause at a position C0 the wildcard at a position I is number E either:

1. if all of:
   - the clause at C0 [has a wildcard at](#wild_in) I;
   - E is 0;
   - unless [in the clause at](#has_prev_wild) C0 some wildcard comes before I;
2. if all of:
   - [in the clause at](#prev_wild) C0 the wildcard before I is at a position J;
   - [in the clause at](#wild_rank) C0 the wildcard at J is number N;
   - E is N + 1.

> what the promoter reads: this wildcard token is the Nth of its clause

