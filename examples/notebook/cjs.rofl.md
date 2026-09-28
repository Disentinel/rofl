---
world: cjs-notebook
books: main
default: main
model: js
code:
  - cjs/index.js
  - cjs/cart.js
  - cjs/format.js
---

# CommonJS across files

> Three files that reach each other through `require`: `const format =
> require('./format')` over `module.exports = format`, `const { total } =
> require('./cart')` over `exports.total = …`, and `require('./cart').size()`.
> Run it with `npm run nb -- examples/notebook/cjs.rofl.md`.

> Everything a receipt needs is reached from `receipt`: each row but `price`
> is one of the three forms, and `price` is reached only once `total` is.
> Before the model read `require`, no call crossed a file and this never
> failed on all four.

```datalog
reaches(A, B) :- calls[code](A, B).
reaches(A, C) :- reaches(A, B), calls[code](B, C).
from_receipt(N) :- reaches(R, F), fn_name[code](R, "receipt"), fn_name[code](F, N).
needed("total"). needed("price"). needed("format"). needed("size").
unreached(N) :- needed(N), not from_receipt(N).

never unreached(N)
```

> Which files the entry depends on. `./package.json` is data, not code, and
> is reached; a relative `require` that names no file at all would turn every
> never above into "holds as far as the model sees".

```rofl
? "cjs/index.js" depends on T
```
