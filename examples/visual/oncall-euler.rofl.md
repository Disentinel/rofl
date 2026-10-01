---
reads:
  - rofl:visual/table.rofl.md
---

# On-call rotations, drawn as an Euler diagram

> Three rotations and who is on each. Three sets fit in circles, so the
> picture is an Euler diagram: a person sits in the region of exactly the
> rotations they are on. Someone on all three is the defect: the `never`
> below fails on them, and the picture marks them red in the middle.

## The rotations

Declared as facts:

- <a id="on"></a>A person P is on a rotation R

The rota:

- `ana` is on `web`.
- `ben` is on `web`.
- `ben` is on `api`.
- `cai` is on `api`.
- `dee` is on `db`.
- `eli` is on `api`.
- `eli` is on `db`.
- `fay` is on `web`.
- `fay` is on `api`.
- `fay` is on `db`.
- `gus` is on `db`.

<a id="overloaded"></a>A person P is overloaded if P is on `web`, P is on `api` and P is on `db`.

## The picture

A row P in a column R has the value `yes` if P is on R.

A mark P is tagged `overloaded` if P is overloaded.

```rofl
never M is tagged `overloaded`
draw euler
```
