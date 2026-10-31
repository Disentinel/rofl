# What ROFL is, and what it answers

ROFL keeps a model of your code and answers questions about it. Not with a
list of matches, as grep does, and not with a yes or a no, as a linter does,
but with one of three things:

- **an answer with its proof**: every step from the fact in the code to the
  conclusion, so you can check it;
- **where a "no" stops**: the one condition that would have to hold for the
  answer to be yes, and does not;
- **an honest "I could not see"**: what part of the code the model did not
  read, so you know how far the answer reaches.

The questions are written as sentences. The model that turns code into facts
ships with ROFL for JavaScript and TypeScript; the rules that turn facts into
answers are yours to read, change and add to.

## A shop in two files

`pay.js` throws when the amount is wrong. `checkout.js` calls it, once
directly and once inside a `try`. A third file, `log.js`, is imported but
is not there.

<!-- BEGIN file guide/examples/first/pay.js -->
```js
export function charge(card, amount) {
  if (amount <= 0) throw new Error('nothing to charge');
  return { card, amount };
}
```
<!-- END file -->

<!-- BEGIN file guide/examples/first/checkout.js -->
```js
import { charge } from './pay.js';
import { log } from './log.js';

export function checkout(cart) {
  log('checkout', cart.id);
  return charge(cart.card, cart.total);
}

export function safeCheckout(cart) {
  try {
    return checkout(cart);
  } catch (e) {
    return null;
  }
}
```
<!-- END file -->

The question is which exported function can throw at whoever calls it. It
is written in a notebook, a Markdown file that ROFL runs:

<!-- BEGIN file guide/examples/first/checkout.rofl.md -->
````markdown
---
model: js
code:
  - pay.js
  - checkout.js
---

# Which exported function can throw at its caller

> Two files of a shop. `charge` throws on a bad amount; `checkout` calls it; `safeCheckout` wraps the call in a `try`.

```rofl
A name N is a risky export if a function F answers to N, F is exported and F may throw.

? N is a risky export
why "checkout" is a risky export
```

> `safeCheckout` catches what `checkout` throws.

```rofl
whynot "safeCheckout" is a risky export
```

> The invariant a CI run would hold.

```rofl
never N is a risky export
```
````
<!-- END file -->

The first line of the first cell is a rule: it says what "a risky export"
means, in terms of three sentences the JavaScript model already knows
(`answers to`, `is exported`, `may throw`). Every other line asks.

## The answer, and its proof

<!-- BEGIN run guide/examples/first: rofl-nb checkout.rofl.md --cell 1 | head -33 -->
```
$ rofl-nb checkout.rofl.md --cell 1 | head -33
checkout.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  checkout.js:2 "./log.js"
checkout.rofl.md:13: cell 1 · rofl
  checkout.rofl.md:15: ? N is a risky export  ->  2 answers
    - "charge" is a risky export
    - "checkout" is a risky export
  checkout.rofl.md:16: why "checkout" is a risky export
    the value's steps, from where it is written:
      checkout.js:4  checkout             it is named "checkout"
      checkout.js:4  function checkout()  it answers to "checkout"
                                          "checkout" is a risky export
    the proof:
    "checkout" is a risky export, because
      [function checkout() at checkout.js:4] is a function, in the code, because
        `function_declaration` is a function kind (given)
        [function checkout() at checkout.js:4] is of kind `function_declaration` in file "checkout.js", in the code (given)
      [function checkout() at checkout.js:4] answers to "checkout", in the code, because
        [function checkout() at checkout.js:4] is of kind `function_declaration` in file "checkout.js", in the code (given)
        The `id` of [function checkout() at checkout.js:4] is [checkout at checkout.js:4], in the code (given)
        [checkout at checkout.js:4] is named "checkout", in the code, because
          The attribute `name` of [checkout at checkout.js:4] is "checkout", in the code (given)
      [function checkout() at checkout.js:4] is exported, in the code, because
        [function checkout() at checkout.js:4] is a function, in the code [above]
        + 1 side condition holds (nothing says otherwise)
        [function checkout() at checkout.js:4] is within [export named at checkout.js:4], in the code, because
          [function checkout() at checkout.js:4] is under [export named at checkout.js:4], in the code, because
            The `declaration` of [export named at checkout.js:4] is [function checkout() at checkout.js:4], in the code (given)
        [export named at checkout.js:4] is of kind `export_named_declaration` in file "checkout.js", in the code (given)
        `export_named_declaration` is an export declaration kind (given)
      [function checkout() at checkout.js:4] may throw, in the code, because
        [function charge() at pay.js:1] may throw, in the code, because
          [function charge() at pay.js:1] throws outright, in the code, because
            [throw at pay.js:2] is of kind `throw_statement` in file "pay.js", in the code (given)
```
<!-- END run -->

The first two lines, before any answer, are the third kind of answer: the
model could not find `log.js`, and it says so before it says anything else.
Every `never` in this notebook now holds only as far as the model sees.

`? N is a risky export` lists two names. `charge` throws itself. `checkout`
contains no `throw`, yet it is on the list, and `why` says how. First
the short form: the steps from the name in the code to the answer, one line
a step. Then the proof,
indented as a tree: `checkout` is a risky export *because* it is a function,
*because* it answers to the name, *because* it is exported, and *because* it
may throw; and it may throw *because* `charge` may throw, *because* `charge`
throws outright at `pay.js:2`. Each leaf is marked `(given)`: a fact read
straight from the code. A line marked `[above]` was already proved higher
up. "Side conditions" are the `unless` parts of rules, the things that hold
because nothing in the code says otherwise; they are counted, and `--all`
prints them.

Nothing in this proof is a guess. Every line is a rule applied to facts, and
the rules are text you can open.

## Where a "no" stops

<!-- BEGIN run guide/examples/first: rofl-nb checkout.rofl.md --cell 2 -->
```
$ rofl-nb checkout.rofl.md --cell 2
checkout.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  checkout.js:2 "./log.js"
checkout.rofl.md:22: cell 2 · rofl
  checkout.rofl.md:22: whynot "safeCheckout" is a risky export
    by file:
      checkout.js: none; it stops at: [function safeCheckout() at checkout.js:9] may throw, in the code
        why not "safeCheckout" is a risky export in checkout.js:
          by the rule: N is a risky export if F is a function, in the code, F answers to N, in the code, F is exported, in the code, F may throw, in the code
            it stops at: [function safeCheckout() at checkout.js:9] may throw, in the code
              by the rule: F may throw, in the code if G may throw, in the code, G runs its body at once, in the code, C resolves to G, in the code, F is the nearest function of C, in the code, not C is caught here, in the code
                it stops at: not [checkout() at checkout.js:11] is caught here, in the code, and [checkout() at checkout.js:11] is caught here, in the code does
          (every failure: --all)
      pay.js: none; it stops at: Some function answers to "safeCheckout", in the code -- none in this file
        why not "safeCheckout" is a risky export in pay.js:
          by the rule: N is a risky export if F is a function, in the code, F answers to N, in the code, F is exported, in the code, F may throw, in the code
            it stops at: Some function answers to "safeCheckout", in the code -- none in this file
checkout.rofl.md: 1 question answered, 1 invariant fails, 2 explained — FAILS at line 28 (exit 1; see rofl-nb --help)
```
<!-- END run -->

`safeCheckout` is not on the list, and `whynot` says why not, file by file.
In `checkout.js` the chain stops at one condition: `safeCheckout` would have
to be a function that may throw, and it is not, because the one call in it
that can throw is caught by its `try`. In `pay.js` it stops earlier: no function there answers to
that name at all. This is the difference between "no" and "not found": the
answer names the condition that fails, so you can decide whether the code is
right or the rule is.

## What the model did not see

The note at the top is not a warning to scroll past. `checkout` calls
`log`, and `log.js` is missing, so the model knows nothing about what `log`
does. If `log` threw, `checkout` would still be risky, so the answer holds;
but a `never` that depends on what `log` does holds *only as far as the
model sees*, and a run whose invariants hold that way ends with exit code 3
instead of 0. The gap is
named with its file and line, so the fix is to list the file or to accept
the gap knowingly.

ROFL never fills a gap with a guess. Where the facts stop, the answer stops,
and says where.

## Where the facts come from

```
   your files  ──scan──▶  facts  ──rules──▶  answers
   pay.js                 [charge] throws     "charge" is a risky export
   checkout.js            [checkout] calls    "checkout" is a risky export
   log.js  (missing)      [checkout] reads    … and the note about log.js
                          "log" from ./log.js
```

A **scanner** reads each file once and writes down what is there: this node
is a function, its name is `charge`, this statement is a `throw`, it sits in
that function. Those are the facts: 304 of them for these two files. **Rules** say what follows from facts: a function that
contains a `throw` throws outright; a function that calls one that may throw
may throw itself, unless the call is inside a `try`. The JavaScript model is
about twenty files of such rules, written in the same sentences you saw in
the notebook. Your rule, `a name N is a risky export if ...`, is one more
line in the same language, and it gets the same `why` and `whynot` as the
rules that ship.

Because the answer is computed from facts and rules and nothing else, it
comes with its proof for free: the proof *is* the computation, written out.

## Where it runs

The same model answers in four places, over the same files:

| | |
|---|---|
| `rofl ask`, `rofl why`, `rofl whynot`, `rofl excise` | one question from the command line, for a person or an agent; `--json` for a program. The world is kept, so the second question over the same files is answered in about a second ([ASKING.md](ASKING.md)) |
| `rofl-nb file.rofl.md` | a notebook of questions and invariants, run in CI; exit 1 when an invariant fails, 3 when it holds only as far as the model sees ([QUICKSTART.md](QUICKSTART.md)) |
| VS Code | the same notebook, cell by cell, with pictures ([INSTALL.md](INSTALL.md)) |
| [disentinel.github.io/rofl](https://disentinel.github.io/rofl/) | a notebook in the browser, nothing to install |

Next: [QUICKSTART.md](QUICKSTART.md) installs it and asks the first
question in five minutes. [CONCEPTS.md](CONCEPTS.md) is every word of the
notebook language on one page.
