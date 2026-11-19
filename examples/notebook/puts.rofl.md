---
world: puts-notebook
books: main
default: main
model: js
code:
  - puts/puts.js
---

# What a host member puts into what it holds, and what a callback's return gives

> `xs.push(x)`, `xs.unshift(x)` and `s.add(x)` put x into the receiver, and
> `new Set(xs)` holds xs's elements; `{ [k]: v }` has v at k's value;
> `Object.freeze(o)` is o, `Object.create(p)` reads p's members and
> `Object.fromEntries(pairs)` has them; `xs.map(f)` is an array of what f
> returns, `reduce` and a promise's `then` and `catch` are what it returns,
> and `Promise.all(xs)` settles to an array of xs's values.
> `use(tag, v)` marks each read; the model's may-set for it is checked against
> what V8 observes by `npm run test:nb`. Run it with
> `npm run nb -- examples/notebook/puts.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
never seen("set", "pu")
never seen("computed", "ck")
```
