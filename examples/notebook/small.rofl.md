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

> An async function called without await drops its promise. This is a
> question, not an invariant: `load('b')` is one such call and the answer
> says where it is.

```rofl
A call C is unawaited if C resolves to a function F and the attribute `async` of F is `true`, unless some await awaits C.

? C is unawaited
```

> No function calls itself, directly.

```rofl
A call C recurses if C resolves to a function F and F is the nearest function of C.

never C recurses
```
