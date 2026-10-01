# Cheat sheet

## Run

    rofl-nb file.rofl.md           run it; --json, --cell N, --all
    rofl-nb vocab [word]           what you can say about code
    rofl-nb vocab file.rofl.md     ... plus that notebook's own sentences
    rofl-nb translate file.rofl.md a model turns natural cells into rofl
    rofl-nb models                 which model translate asks
    rofl-nb --help

Exit: 0 holds · 1 a `never` fails · 2 not read · 3 holds as far as it sees.

## Front matter (optional)

    ---
    model: js                  # or none (the default)
    code:
      - ../src/**/*.ts         # relative to the notebook
    reads:
      - rules.rofl.md          # another file's sentences, loaded first
    ---

## Declare, state, derive

    Declared as facts:

    - <a id="owns"></a>A team T owns a module M

    The repository today:

    - `platform` owns `auth`.

    A change C needs a team T if C touches a module M and T owns M.

    A change C is blocked by a team T if C needs T, unless C is covered for T.

    A change C is covered for a team T either:

    1. if C is approved by a person P and P is on T;
    2. if C is written by a person P and P is on T.

## Ask, in a rofl cell

    ? C is blocked by T               every answer
    never C is blocked by `payments`  an invariant
    why `c2` is blocked by `platform` the proof
    whynot `c2` is mergeable          where it stops
    excise `c1` is approved by `ben`  what changes without this fact
    unsure F always throws            under a never: what it could not see
    extends R                         this cell adds rules to the model's R

## Terms

`T` a variable · `` `platform` `` a name · `"text"` · `42` ·
`some team`, `something` a blank you ignore · `it` the last subject ·
`> quote` prose only people read.

More: [QUICKSTART.md](QUICKSTART.md) · [CONCEPTS.md](CONCEPTS.md) ·
[WRITING.md](WRITING.md) · [AGENTS.md](AGENTS.md)
