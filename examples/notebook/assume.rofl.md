---
world: assume-notebook
books: main
default: main
model: js
code:
  - assume/src/platform.ts
  - assume/src/shell.ts
---

# A runtime assumption decides a test, and the arm it does not take hands its callee nothing

> The world says what two values are when the program runs: `isWindows`, as
> `platform.ts` exports it, is `false`, and `process.env.NODE_ENV` is
> `"production"`. A test that reads one of them, alone, negated, joined by `&&`
> or `||` or compared with a literal, is decided, and a call in the arm it does
> not take is a dead site, as under an entry guard: `run('cmd.exe')`, the
> namespace read `platform.isWindows`, the `&&` and the `?:`, and `winOnly`,
> mentioned only there. `isWeb` and `LOG_LEVEL` are assumed nothing, so both of
> their arms stay. Excising an assumption brings its arms back. Run it with
> `npm run nb -- examples/notebook/assume.rofl.md`.

```datalog
assumed_export[assume]("assume/src/platform.ts", "isWindows", false).
assumed_env[assume]("NODE_ENV", "production").
seen(V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
           arg_at[flow](C, 1, A), may_be_lit[flow](A, V).
live("/bin/sh"). live("ls"). live("/"). live("serve"). live("node"). live("trace"). live("quiet").
missing(V) :- live(V), not seen(V).
? seen(V)
? dead_fn[code](F)

never seen("cmd.exe")
never seen("reg.exe")
never seen("dir")
never seen("ver")
never seen("\\")
never seen("watch")
never seen("debug")
never missing(V)
```
