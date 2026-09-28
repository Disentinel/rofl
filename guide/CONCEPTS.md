# Concepts

## Cells

A notebook is Markdown. `rofl-nb` reads it in cells:

- **prose**: everything outside a code fence. Its sentences, lists and rules
  are read. A quote (`>`) is only for people.
- **`rofl`** fence: rules and asking lines, in sentences.
- **`datalog`** fence: the same in Datalog, `blocked(C, T) :- needs(C, T).`
- **`natural`** fence: a request in plain words. `rofl-nb translate` asks
  Claude to write a `rofl` cell under it.

## Sentences

A sentence is declared once, with an anchor and typed holes:

    - <a id="owns"></a>A team T owns a module M

Then it is used with the holes filled: `` `platform` owns `auth` ``. A name
in backticks is a thing; a capital letter is a blank.

## Facts and rules

A **fact** is a filled sentence in a list under a line ending in a colon:
`` - `c1` touches `billing`. `` A **rule** derives new facts:

    A change C needs a team T if C touches a module M and T owns M.

`unless` adds a condition that must not hold. `either:` gives several ways
to the same conclusion, as a numbered list of `if` or `unless` lines.

## Asking lines

One per line, in a `rofl` or `datalog` cell:

| Line | Says |
|---|---|
| `? S` | every answer to S |
| `never S` | holds when S has no answer; a failure lists the answers |
| `why S` | the proof of one answer |
| `whynot S` | the condition where S stops |
| `excise F` | which lines would answer differently without the fact F |
| `unsure S` | under a `never`: what it could not see |

`review.rofl.md` in `~/rofl-examples/notebook`, run:

<!-- BEGIN run examples/notebook: rofl-nb review.rofl.md -->
```
$ rofl-nb review.rofl.md
review.rofl.md:18: cell 1 · rofl
  review.rofl.md:18: ? C is blocked by T  ->  1 answer
    - `c2` is blocked by `platform`
  review.rofl.md:19: why `c2` is blocked by `platform`
    `c2` is blocked by `platform`, because
      `c2` needs `platform`, because
        `c2` touches `storage` (given)
        `platform` owns `storage` (given)
      not `c2` is covered for `platform` (nothing says so)
        why not `c2` is covered for `platform`:
          by the rule: C is covered for T if C is approved by P, P is on T
            it stops at: `c2` is approved by anything
          by the rule: C is covered for T if C is written by P, P is on T
            it stops at: `ben` is on `platform`
review.rofl.md:26: cell 2 · rofl
  review.rofl.md:28: ? C is stuck  ->  1 answer
    - `c2` is stuck
  review.rofl.md:29: whynot `c2` is mergeable
    why not `c2` is mergeable:
      by the rule: C is mergeable if C is written by something, not C is blocked by something
        it stops at: not `c2` is blocked by something, and `c2` is blocked by `platform` does
review.rofl.md:37: cell 3 · rofl
  review.rofl.md:37: never C is blocked by `payments`  ->  holds
review.rofl.md:43: cell 4 · datalog
  review.rofl.md:45: never waits_on(C, payments)  ->  holds
review.rofl.md: every never holds, every cell read
```
<!-- END run -->

And `excise`, in `~/rofl-examples/start`, on the same facts:

<!-- BEGIN run examples/start: rofl-nb whatif.rofl.md -->
```
$ rofl-nb whatif.rofl.md
whatif.rofl.md:7: cell 1 · rofl
  whatif.rofl.md:7: ? C is blocked by T  ->  1 answer
    - `c2` is blocked by `platform`
  whatif.rofl.md:8: excise `c1` is approved by `ben`  ->  1 answer
    - ? C is blocked by T: 1 -> 2
    -   now also: `c1` is blocked by `payments`
whatif.rofl.md: every never holds, every cell read
```
<!-- END run -->

## Reads

`reads:` in the front matter loads another file's sentences first, as
`whatif.rofl.md` reads `../review.rofl.md`.

## Model and code

A **model** turns code into facts. `model: js` reads the JavaScript and
TypeScript files listed under `code:`. `rofl-nb vocab` lists its sentences.

## Could not see: exit 3

The model can miss things: an import of a file you did not list, code it
cannot parse. Then a `never` holds only as far as it sees
(`~/rofl-examples/start`, where `shop.js` imports a `tax.js` that is not
there):

<!-- BEGIN run+exit examples/start: rofl-nb shop.rofl.md -->
```
$ rofl-nb shop.rofl.md
shop.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  shop.js:1 "./tax.js"
shop.rofl.md:8: cell 1 · rofl
  shop.rofl.md:8: never F always throws  ->  holds as far as it sees · 1 relative import or require was not resolved: shop.js:1 "./tax.js"
shop.rofl.md: every never holds, some only as far as the model sees
$ echo $?
3
```
<!-- END run+exit -->

List the missing file under `code:`, or accept the gap on purpose.
The other exit codes: 0 every `never` holds, 1 a `never` fails, 2
something was not read.

## Glossary

- **notebook**: a `.rofl.md` file with cells.
- **world**: a `.rofl.md` or `.rofl` file of facts and rules that asks
  nothing; a notebook `reads:` it.
- **cell**: one fenced block, or the prose around it.
- **sentence**: a relation written in words, declared once with an anchor.
- **anchor**: `<a id="name"></a>`, the sentence's name in Datalog.
- **fact**: a filled sentence that is given.
- **rule**: a sentence that follows from others (`if`, `unless`).
- **never**: an invariant; it holds when nothing answers.
- **model**: what turns code into facts (`js`, or `none`).
- **out of sight**: what the model could not see; it makes exit 3.
