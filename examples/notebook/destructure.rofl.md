---
world: destructure-notebook
books: main
default: main
model: js
code:
  - destructure/shapes.js
  - destructure/config.js
---

# Destructuring and conversions keep the value

> A name bound from an object pattern is a member of what the pattern takes
> apart: in a declarator, in a parameter (`({ port, host }) =>`), with a
> default (`{ PORT = 1343 }`, `(port = 80)`) and off a required module. The
> number conversions `parseInt`, `Number` and `parseFloat` keep their
> argument's value. `use(tag, v)` marks each read; the model's may-set for it
> is asked below and checked against what V8 observes by `npm run test:nb`.
> Run it with `npm run nb -- examples/notebook/destructure.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).

? seen(Tag, V)

never seen("object.port", 3030)
never seen("default.port", 8082)
never seen("require.port", 5)
```
