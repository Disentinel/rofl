---
reads:
  - rofl:visual/table.rofl.md
---

# An access review, drawn as an UpSet

> Who is in which group, and which groups people share. Five sets are too
> many for circles, so the picture is an UpSet: a bar per set, a column per
> intersection that has someone in it, its size on top and its people under
> it. Being in `billing` and in `deploy` at once is the defect: the `never`
> below fails on it, and the picture marks that person.

## The groups

Declared as facts:

- <a id="member"></a>A user U is in a group G

The directory:

- `ana` is in `admin`.
- `ana` is in `deploy`.
- `ben` is in `billing`.
- `ben` is in `support`.
- `cai` is in `support`.
- `dee` is in `deploy`.
- `dee` is in `audit`.
- `eli` is in `billing`.
- `eli` is in `deploy`.
- `fay` is in `support`.
- `gus` is in `deploy`.
- `gus` is in `admin`.
- `hal` is in `audit`.

<a id="two_duties"></a>A user U holds two duties if U is in `billing` and U is in `deploy`.

## The picture

A row U in a column G has the value `yes` if U is in G.

A mark U is tagged `two_duties` if U holds two duties.

```rofl
never M is tagged `two_duties`
draw upset
```
