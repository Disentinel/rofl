---
world: rest-notebook
books: main
default: main
model: js
code:
  - rest/rest.js
---

# A rest takes the keys its pattern leaves, a spread copies them

> An object rest `...opt` is a fresh object of every key its pattern did not
> name, an array rest `...tail` the elements from its index on, wherever the
> pattern stands: a declarator, a parameter or a for-of head, at the top or
> nested inside another pattern; the keys it took are not in it. A spread `{ ...o }` copies the keys of `o`, a rest's too.
> The rest is a value like any other: handed whole to a call, assigned, read by
> a computed key. `use(tag, v)` marks each read; the model's may-set for it is
> asked below and checked against what V8 observes by `npm run test:nb`. Run it
> with `npm run nb -- examples/notebook/rest.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).
rest_key(R, K) :- obj_rest[code](_, R, _), member_value[flow](R, K, _).

? seen(Tag, V)

never silent(Tag)
? rest_key(R, K)
never rest_key(R, "a")
never rest_key(R, "mode")
never seen("param.rest", 1)
never seen("spread.rest", "m")
```
