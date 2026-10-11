---
world: guard-notebook
books: main
default: main
model: js
code:
  - guard/server.js
---

# A call under an entry guard hands its callee nothing

> `if (!module.parent) main()` and `if (require.main === module) { ... }` run
> when the file is the one node was started on; their other arm runs when it is
> required. The values such a site passes (a CLI port, a test default) are not
> what the program passes, so the site gives `arg_at` nothing, and neither do the
> calls inside a function only the guard mentions (`main`, `alsoCli`). `helper`
> is exported and the `else` of `require.main === module` is the required arm,
> so it stays. Run it with `npm run nb -- examples/notebook/guard.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
? seen(Tag, V)
? dead_site[code](C)
? dead_fn[code](F)

never seen("listen.port", 9999)
never seen("listen.port", 6666)
never seen("listen.port", 5555)
never seen("listen.port", 3333)
```
