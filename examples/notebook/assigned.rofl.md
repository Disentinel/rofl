---
world: assigned-notebook
books: main
default: main
model: js
code:
  - assigned/patterns.js
---

# A pattern on the left of `=` or in a catch takes its value apart, an index reads an element

> A destructuring assignment `({ p, ...r } = o)`, `[q, , s] = arr` writes each
> name it holds as `p = o.p` would, nested, with a default and with a rest;
> a swap `[x, y] = [y, x]` gives each both values, as the layer has no order.
> A catch parameter's pattern takes apart what the block throws, and a plain
> catch name is the thrown value. A read by a literal index `list[0]` is the
> element at that index. `use(tag, v)` marks each read; the model's may-set
> for it is asked below and checked against what V8 observes by
> `npm run test:nb`. Run it with `npm run nb -- examples/notebook/assigned.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
never seen("assign.p", 2)
never seen("index.0", "second")
never seen("index.rest", 2)
never seen("assign.arrayRest", "a")
```
