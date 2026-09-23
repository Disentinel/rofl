---
world: phrases
books: main
default: main
---

# phrases

> The language's own phrases: how a term built by a destructor reads in a
> sentence. `X is str_seg(S, Sep, 1)` renders as `X is the segment 1 of S
> split by Sep`, and the reader turns the phrase back into the term.
> Arithmetic needs no phrase: `I is J + K` reads as written.

<a id="fun_phrase"></a>`fun_phrase` lists:

| arg 1 | arg 2 |
|---|---|
| `str_pre` | "the prefix of <0:text> before <1:text>" |
| `str_seg` | "the segment <2:index> of <0:text> split by <1:text>" |
| `str_segs` | "the number of segments of <0:text> split by <1:text>" |
| `str_len` | "the length of <0:text>" |
| `str_char` | "the character <1:index> of <0:text>" |
| `str_sub` | "the substring of <0:text> from <1:index> of length <2:number>" |
| `atom_of` | "the atom of <0:text>" |

Declared as facts: fun_phrase.

