---
world: host
books: main
default: main
---

# host

> host.rofl — WHAT THE HOST OF RING 1 MUST DO, as rules that check it.
> 
> demo.ts cuts a file into clauses, hands each one in as `src`, refuses a
> parse that did not cover its input, and PROMOTES the six leaves the grammar
> cannot finish: `wild`, `int`, `negint`, `str`, `comp`, `op`. Promoting
> builds a term (a number from digits, a string from an escaped one, a functor
> from a name), and building is exactly what the finiteness proof forbids a
> rule. CHECKING what was built is not: a rule can read the digits back, walk
> the escapes, and compare character by character. So the host constructs and
> these rules verify, in the grammar's own world, reading its `parsed`, `wild`,
> `uncovered`, `stray` and `hole` directly.
> 
> THE HOST'S ANSWER arrives as facts, written by examples/ring1/conform.ts:
> 
>   host_clause(H, B)       a clause the host built from this part, in a
>                           first-order shape: `hlit(Rel, Book, Args, Tense,
>                           Explicit)`, `hnot(L)`, `hbi(Op, Args)`,
>                           `hfun(Name, Args)`, `hvar(Name)`, and numbers,
>                           strings and atoms as themselves
>   host_refused(yes)       the host refused the part
>   host_unsupported(yes)   the host dropped a clause it could not read
>   part_seen(yes)          this world held a part the host was given
>   dropped_tail(yes)       this part is the tail the host dropped as no clause
> 
> WHAT IS TRUSTED, not checked: that conform.ts writes the host's clause
> faithfully (it is ten lines of shape-for-shape encoding), and that the parts
> concatenate back to the file.

Reads:

- from outside these files:
  - <a id="hole"></a>`hole`
- from ring1: [parsed](ring1.rofl.md#parsed), [stray](ring1.rofl.md#stray), [term](ring1.rofl.md#term), [tok](ring1.rofl.md#tok), [uncovered](ring1.rofl.md#uncovered), [wild](ring1.rofl.md#wild)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="raw_str"></a>Raw is a string literal of the part if [the term from](ring1.rofl.md#term) a position I to a position J is str(Raw).
- <a id="known_escape"></a>A character has a meaning after a backslash if [an escaped](#unescape) it means a character C.
- <a id="some_unknown_escape"></a>Some literal of the part holds an escape with no meaning: `yes` if Raw [holds an escape with no meaning](#unknown_escape).
- <a id="some_refusal_due"></a>Some refusal is due: `yes` if [the host must refuse the part because of](#must_refuse) a reason Why.
- <a id="some_host_clause"></a>The host built some clause: `yes` if [the host built a clause with the head](#host_clause) H and the body B.

Declared as facts:

- <a id="host_clause"></a>`host_clause` — no rows: declared so a rule may read it
- <a id="host_refused"></a>`host_refused` — no rows: declared so a rule may read it
- <a id="host_unsupported"></a>`host_unsupported` — no rows: declared so a rule may read it
- <a id="part_seen"></a>`part_seen` — no rows: declared so a rule may read it
- <a id="dropped_tail"></a>`dropped_tail` — no rows: declared so a rule may read it

> ------------------------------------------------------- the two trees, paired
> The grammar's tree and the host's, walked in step from the root. A pair the
> rules below cannot explain is a place where the host did something else.

<a id="pairs"></a>The grammar's GH stands where the host's HH stands if [the file has the clause from](ring1.rofl.md#parsed) a position I to a position D with the head GH and the body GB, and [the host built a clause with the head](#host_clause) HH and the body HB.

The grammar's GB stands where the host's HB stands if [the file has the clause from](ring1.rofl.md#parsed) a position I to a position D with the head GH and the body GB, and [the host built a clause with the head](#host_clause) HH and the body HB.

<a id="nonconformant"></a>The host breaks its contract at a term G against a term H if the grammar's G [stands where the host's](#pairs) H stands, unless the host's H [is what the grammar's](#fits) G promises.

> the same thing on both sides: an atom, `$nil`, a name

<a id="fits"></a>The host's G is what the grammar's G promises if the grammar's G [stands where the host's](#pairs) G stands.

The grammar's X stands where the host's Y stands if the grammar's $cons(X, Xs) [stands where the host's](#pairs) $cons(Y, Ys) stands.

The grammar's Xs stands where the host's Ys stands if the grammar's $cons(X, Xs) [stands where the host's](#pairs) $cons(Y, Ys) stands.

The host's $cons(Y, Ys) is what the grammar's $cons(X, Xs) promises if the grammar's $cons(X, Xs) [stands where the host's](#pairs) $cons(Y, Ys) stands.

> A LITERAL. No book written means `main`, and the host must remember that
> none was written; a book written is carried as it is.

<a id="tense_of"></a>`tense_of` lists:

| tense | tense |
|---|---|
| `$now` | `now` |
| `$next` | `next` |
| `$init` | `init` |

The grammar's X stands where the host's A2 stands if the grammar's $lit(R, B, X, T) [stands where the host's](#pairs) hlit(R, P, A2, T2, E) stands.

The grammar's B stands where the host's P stands if the grammar's $lit(R, B, A, T) [stands where the host's](#pairs) hlit(R, P, A2, T2, `yes`) stands.

The host's E is what the grammar's N promises either:

1. if all of:
   - the grammar's $lit(R, `$bare`, A, a tense T) [stands where the host's](#pairs) hlit(R, `main`, A2, a tense T2, `no`) stands;
   - [the grammar's tense](#tense_of) T is the host's T2;
   - N is $lit(R, `$bare`, A, T);
   - E is hlit(R, `main`, A2, T2, `no`);
2. if all of:
   - the grammar's $lit(R, B, A, a tense T) [stands where the host's](#pairs) hlit(R, P, A2, a tense T2, `yes`) stands;
   - B differs from `$bare`;
   - [the grammar's tense](#tense_of) T is the host's T2;
   - N is $lit(R, B, A, T);
   - E is hlit(R, P, A2, T2, `yes`).

The grammar's L stands where the host's L2 stands if the grammar's $not(L) [stands where the host's](#pairs) hnot(L2) stands.

The host's hnot(L2) is what the grammar's $not(L) promises if the grammar's $not(L) [stands where the host's](#pairs) hnot(L2) stands.

The grammar's X stands where the host's A2 stands if the grammar's $builtin(Op, X) [stands where the host's](#pairs) hbi(Op, A2) stands.

The host's E is what the grammar's N promises either:

1. if all of:
   - the grammar's $builtin(Op, A) [stands where the host's](#pairs) hbi(Op, A2) stands;
   - N is $builtin(Op, A);
   - E is hbi(Op, A2);
2. if all of:
   - the grammar's $var(S) [stands where the host's](#pairs) hvar(S) stands;
   - N is $var(S);
   - E is hvar(S).

> ------------------------------------------------------------- the six leaves
> A COMPOUND: a functor named by the atom the grammar read.

The grammar's X stands where the host's A2 stands if the grammar's comp(N, X) [stands where the host's](#pairs) hfun(F, A2) stands.

The host's hfun(F, A2) is what the grammar's comp(N, A) promises if the grammar's comp(N, A) [stands where the host's](#pairs) hfun(F, A2) stands and N is the atom of F.

> AN OPERATION: a functor named by the operator's own text, on two operands.

The grammar's L stands where the host's L2 stands if the grammar's op(O, L, R) [stands where the host's](#pairs) hfun(O, $cons(L2, $cons(R2, `$nil`))) stands.

The grammar's R stands where the host's R2 stands if the grammar's op(O, L, R) [stands where the host's](#pairs) hfun(O, $cons(L2, $cons(R2, `$nil`))) stands.

The host's hfun(O, $cons(L2, $cons(R2, `$nil`))) is what the grammar's op(O, L, R) promises if the grammar's op(O, L, R) [stands where the host's](#pairs) hfun(O, $cons(L2, $cons(R2, `$nil`))) stands.

> A NUMBER, read back from its digits: the value of the text from a position
> on, left to right. Arithmetic over characters needs no constructor.

<a id="digit_of"></a>`digit_of` lists:

| character | number |
|---|---|
| "0" | 0 |
| "1" | 1 |
| "2" | 2 |
| "3" | 3 |
| "4" | 4 |
| "5" | 5 |
| "6" | 6 |
| "7" | 7 |
| "8" | 8 |
| "9" | 9 |

<a id="digits_wanted"></a>The digits of a text S are read from a position E either:

1. if the grammar's int(S) or negint(S) [stands where the host's](#pairs) N stands and E is 0;
2. if all of:
   - the grammar's wild(I) [stands where the host's](#pairs) hvar(S) stands;
   - L is the length of S;
   - L > 2;
   - E is 2.

<a id="digits_upto"></a>The digits of a text S from a position F up to a position N are worth E either:

1. if [the digits of](#digits_wanted) S are read from F, N is F, and E is 0;
2. if all of:
   - [the digits of](#digits_upto) S from F up to a position I are worth V;
   - L is the length of S;
   - I < L;
   - a character C is the character I of S;
   - [the digit](#digit_of) C is worth D;
   - E is V * 10 + D;
   - N is I + 1.

<a id="digits_value"></a>The digits of a text S from a position F are worth V if all of:
  - [the digits of](#digits_upto) S from F up to a position I are worth V;
  - L is the length of S;
  - I is L;
  - I > F.

The host's N is what the grammar's E promises either:

1. if all of:
   - the grammar's int(a text S) [stands where the host's](#pairs) N stands;
   - [the digits of](#digits_value) S from 0 are worth N;
   - E is int(S);
2. if all of:
   - the grammar's negint(a text S) [stands where the host's](#pairs) N stands;
   - [the digits of](#digits_value) S from 0 are worth V;
   - N is 0 - V;
   - E is negint(S).

> A WILDCARD: a fresh variable named `_$` and the rank the grammar gave it.

The host's hvar(a text S) is what the grammar's wild(a position I) promises if all of:
  - the grammar's wild(I) [stands where the host's](#pairs) hvar(S) stands;
  - [the wildcard at](ring1.rofl.md#wild) I is number N;
  - L is the length of S;
  - L > 2;
  - C0 is the character 0 of S;
  - C0 is "_";
  - C1 is the character 1 of S;
  - C1 is "$";
  - [the digits of](#digits_value) S from 2 are worth N.

> A STRING, compared character by character with its literal, escapes undone.
> The walk goes over the literal between its quotes; K counts the characters
> the string must have.

<a id="unescape"></a>`unescape` lists:

| character | character |
|---|---|
| "n" | "\n" |
| "t" | "\t" |
| "r" | "\r" |
| "\\" | "\\" |
| "\"" | "\"" |

<a id="walk"></a>Reading Raw at a position N has produced X characters either:

1. if Raw [is a string literal of the part](#raw_str), N is 1, and X is 0;
2. if all of:
   - reading Raw at a position I [has produced](#walk) K characters;
   - L is the length of Raw;
   - E is L - 1;
   - I < E;
   - C is the character I of Raw;
   - C differs from "\\";
   - N is I + 1;
   - X is K + 1;
3. if all of:
   - reading Raw at a position I [has produced](#walk) K characters;
   - L is the length of Raw;
   - E is L - 1;
   - I < E;
   - C is the character I of Raw;
   - C is "\\";
   - N is I + 2;
   - X is K + 1.

<a id="means"></a>Character K of Raw means a character C either:

1. if all of:
   - reading Raw at a position I [has produced](#walk) K characters;
   - L is the length of Raw;
   - E is L - 1;
   - I < E;
   - C is the character I of Raw;
   - C differs from "\\";
2. if all of:
   - reading Raw at a position I [has produced](#walk) K characters;
   - L is the length of Raw;
   - E is L - 1;
   - I < E;
   - B is the character I of Raw;
   - B is "\\";
   - J is I + 1;
   - a character X is the character J of Raw;
   - [an escaped](#unescape) X means C.

<a id="walk_len"></a>Raw means K characters if all of:
  - reading Raw at a position I [has produced](#walk) K characters;
  - L is the length of Raw;
  - E is L - 1;
  - I is E.

<a id="str_differs"></a>The string S differs from the literal Raw either:

1. if all of:
   - the grammar's str(Raw) [stands where the host's](#pairs) S stands;
   - Raw [means](#walk_len) N characters;
   - M is the length of S;
   - N differs from M;
2. if all of:
   - the grammar's str(Raw) [stands where the host's](#pairs) S stands;
   - [character](#means) K of Raw means a character C;
   - M is the length of S;
   - K < M;
   - C2 is the character K of S;
   - C differs from C2.

The host's S is what the grammar's str(Raw) promises if all of:
  - the grammar's str(Raw) [stands where the host's](#pairs) S stands;
  - Raw [means](#walk_len) N characters;
  - unless the string S [differs from the literal](#str_differs) Raw.

> An escape the host has no meaning for: the clause must be dropped and said.

<a id="unknown_escape"></a>Raw holds an escape with no meaning if all of:
  - reading Raw at a position I [has produced](#walk) K characters;
  - L is the length of Raw;
  - E is L - 1;
  - I < E;
  - B is the character I of Raw;
  - B is "\\";
  - J is I + 1;
  - a character X is the character J of Raw;
  - unless X [has a meaning after a backslash](#known_escape).

The host breaks its contract at a term N against a term E either:

1. if all of:
   - Raw [holds an escape with no meaning](#unknown_escape);
   - N is `escape`;
   - E is `unreported`;
   - unless [the host dropped a clause it could not read:](#host_unsupported) `yes`;
2. if all of:
   - [the host dropped a clause it could not read:](#host_unsupported) `yes`;
   - N is `escape`;
   - E is `spurious`;
   - unless [some literal of the part holds an escape with no meaning:](#some_unknown_escape) `yes`.

> ------------------------------------------------------------------ refusals
> A PARSE THAT DID NOT COVER ITS INPUT IS NOT A PARSE, and the host must say
> so rather than return what it found. The sealed reflection is a refusal the
> grammar declared, not a failure, so it is the one hole that does not count.

<a id="must_refuse"></a>The host must refuse the part because of a reason N either:

1. if [no clause covers the token at](ring1.rofl.md#uncovered) a position K and N is `uncovered`;
2. if a position K [holds a stray character](ring1.rofl.md#stray) and N is `stray`;
3. if [`hole`](#hole)(Id, R), R differs from `reflection_sealed`, and N is `hole`.

The host breaks its contract at a term N against a term E either:

1. if all of:
   - [the host must refuse the part because of](#must_refuse) a reason Why;
   - N is `refusal`;
   - E is `missing`;
   - unless [the host refused the part:](#host_refused) `yes`;
2. if all of:
   - [the host refused the part:](#host_refused) `yes`;
   - N is `refusal`;
   - E is `spurious`;
   - unless [some refusal is due:](#some_refusal_due) `yes`.

> ---------------------------------------------------------- one part, one clause
> The host cuts a file at the periods that end a clause, so every part is one
> clause: never two, and never none unless it was refused or dropped.

The host breaks its contract at `split` against `two_clauses` if all of:
  - [the file has the clause from](ring1.rofl.md#parsed) a position I to a position D with the head H and the body B;
  - [the file has the clause from](ring1.rofl.md#parsed) a position I2 to a position D2 with the head H2 and the body B2;
  - I < I2.

The host breaks its contract at `split` against `no_clause` if all of:
  - [the host was given a part:](#part_seen) `yes`;
  - unless [the host built some clause:](#some_host_clause) `yes`;
  - unless [the host refused the part:](#host_refused) `yes`;
  - unless [the host dropped a clause it could not read:](#host_unsupported) `yes`;
  - unless [the part is the tail the host dropped:](#dropped_tail) `yes`.

> and what it dropped after the last period held no token

The host breaks its contract at `split` against `dropped_a_token` if [the part is the tail the host dropped:](#dropped_tail) `yes` and [a token runs from](ring1.rofl.md#tok) a position I to a position J.

