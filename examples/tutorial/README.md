# The Tin Can Works: a tutorial you play

Six short levels, each a notebook: a small factory written in sentences, a
goal the notebook checks itself, and one new word. No Datalog and no code
needed. Run a level:

    npm run nb -- examples/tutorial/1-what-ships.rofl.md

or open the file in VS Code and Run All. A level is solved when the last line
says **every never holds, every cell read** (exit 0, green in the editor).
Edit only where a level says *Your move*. Stuck? Each level ends with a hint.

| Level | File | New word | Goal |
|---|---|---|---|
| 1 | `1-what-ships.rofl.md` | `?` | list the products that leave the line |
| 2 | `2-paint-shop.rofl.md` | `never` | no car leaves unpainted, and none comes out white |
| 3 | `3-missing-part.rofl.md` | `why`, `whynot` | find the part that keeps the truck off the line |
| 4 | `4-late-delivery.rofl.md` | `excise` | which products stop if the doors do not come |
| 5 | `5-quality-gate.rofl.md` | `if` | write the quality gate's rule |
| 6 | `6-in-your-words.rofl.md` | `natural` | say a rule in English; Claude writes it (needs `claude`) |

`solutions/` has each level solved, to compare with yours when you are done.
