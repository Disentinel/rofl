---
world: ring1-phrases
books: main
default: main
---

# ring1-phrases

> ring1-phrases.rofl — the sentence of every relation of ring 1, the ROFL front
> end written in ROFL (examples/ring1/ring1.rofl, charclass.rofl). A position
> is an index into the source, and a token is a pair of positions, never text.
> Read by `rofl-render`, which renders the grammar as docs/rings; loaded by
> nothing else. The format is facts/js-phrases.rofl's.

Declared as facts:

- `phrase` — rows in this file

> the input

> characters

> the scanner, one left-to-right walk carrying a state

> words and punctuation

> keywords, spelled character by character

> operators

> what a token says, and the terms

> literals, bodies, clauses

> the file, and what it did not cover

> wildcards, numbered per clause

> the terms the grammar builds that are not the kernel's own: those (`$var`, `$cons`, `$lit`...) cannot be named in source, so they have no phrase

`fun_phrase` lists:

| arg 1 | arg 2 |
|---|---|
| `int` | "the integer written <0:text>" |
| `negint` | "the negative integer written <0:text>" |
| `str` | "the string written <0:text>" |
| `wild` | "the wildcard at <0:position>" |

Declared as facts:

- `fun_phrase` — rows in this file

> the host's contract (examples/ring1/host.rofl): the grammar's tree and the host's, walked in step

