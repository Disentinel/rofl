---
world: small-notebook
books: main
default: main
model: js
code:
  - small.js
---

# Promises nobody waits for

> A notebook over `small.js` with the JS model. Run it with
> `npm run nb -- examples/notebook/small.rofl.md`.

> An async function called as a statement of its own drops its promise:
> nothing awaits it, returns it or keeps it. This is a question, not an
> invariant: `load('b')` is one such call and the answer says where it is.
> A promise kept in a variable (`const p = load('c'); return p;`) is not
> dropped and is not listed; neither is one kept and then forgotten, which
> this rule does not see.

```rofl
A call C is unawaited if C resolves to a function F, the attribute `async` of F is `true`, a node S is of kind `expression_statement` and the `expression` of S is C.

? C is unawaited
```

> No function calls itself, directly.

```rofl
A call C recurses if C resolves to a function F and F is the nearest function of C.

never C recurses
```
