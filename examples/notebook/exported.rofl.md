---
world: exported-notebook
books: main
default: main
model: js
code:
  - exported/a.js
  - exported/b.js
  - exported/c.cjs
  - exported/d.cjs
  - exported/main.js
  - exported/e.cjs
---

# What crosses a module: named, default and namespace imports, re-exports, a live binding, `import()` and `require`

> exported/main.js reads what exported/a.js exports, directly, through a
> namespace, and through exported/b.js's re-exports; `setMutable()` writes the
> exported `let`, so the import is a live binding; `import('./a.js')` settles
> to the module. exported/e.cjs reads CommonJS exports. `use(tag, v)` marks
> each read; `npm run test:nb` runs both entries in node and checks every value
> they observe is in the model's may-set. Run it with
> `npm run nb -- examples/notebook/exported.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
silent(Tag) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
               arg_at[flow](C, 0, T), ast_value[code](T, Tag), not seen(Tag, _).

? seen(Tag, V)

never silent(Tag)
```
