---
world: returns-notebook
books: main
default: main
model: js
code:
  - returns/returns.js
---

# What a host member returns of what it holds, `super.m` and `arguments[i]`

> `arr.filter(...)[0]`, `arr.find(...)`, `arr.at(0)`, `[...arr][1]`,
> `Array.from(arr)`, `Object.keys(o)`, `Object.values(o)` and
> `Object.entries(o)` give back elements of what they were handed; an array
> they make is read at any index. `super.m()` in an instance method is the
> base class's m, and `arguments[i]` is what the calls hand at i. The rest of
> returns/returns.js are reads the model already had, kept here as the control.
> `use(tag, v)` marks each read; the model's may-set for it is checked against
> what V8 observes by `npm run test:nb`. Run it with
> `npm run nb -- examples/notebook/returns.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
never seen("filter[0]", "e2")
never seen("keys", "va")
```
