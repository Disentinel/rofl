---
world: handed-notebook
books: main
default: main
model: js
code:
  - handed/handed.js
---

# A host hands its callback the elements, the index and the array

> `['a', 'b'].forEach((x, i, all) => …)` calls the arrow with each element, its
> index and the array; `map`, `filter`, `some`, `find` do the same, `reduce`
> hands the element second and `sort` hands two elements. `then` hands what
> the promise settles to. `use(tag, v)` marks each read; the model's may-set
> for it is asked below and checked against what V8 observes by
> `npm run test:nb`. Run it with `npm run nb -- examples/notebook/handed.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)
? silent(Tag)

never seen("forEach.x", "z")
never seen("map.n", "a")
```
