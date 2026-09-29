---
reads:
  - rofl:visual/notation.rofl.md
---

# A family, written as GEDCOM

> Three generations of a family, checked, drawn as a pedigree, and handed
> to genealogy software in the standard it reads, GEDCOM 7. A child
> recorded as born before one of its parents is the defect the check finds,
> and the pedigree marks that child.

Declared as facts:

- <a id="person"></a>A person P is called S and was born in Y
- <a id="parents"></a>A child C was born to a parent A and a parent B

The records:

- `ivan` is called "Ivan /Petrov/" and was born in 1921.
- `olga` is called "Olga /Petrova/" and was born in 1925.
- `anna` is called "Anna /Petrova/" and was born in 1950.
- `boris` is called "Boris /Sokolov/" and was born in 1948.
- `lena` is called "Lena /Sokolova/" and was born in 1946.
- `anna` was born to `ivan` and `olga`.
- `lena` was born to `boris` and `anna`.

<a id="too_early"></a>A child C is born before a parent either:

1. if C was born to a parent A and some parent, C is called something and was born in X, A is called something and was born in Y, and X < Y;
2. if C was born to some parent and a parent B, C is called something and was born in X, B is called something and was born in Y, and X < Y.

## The picture

A person P is named S if P is called S and was born in something.

A person P was born in Y if P is called something and was born in Y.

$family(A, B) has the partner A if some child was born to A and B.

$family(A, B) has the partner B if some child was born to A and B.

$family(A, B) has the child C if C was born to A and B.

```rofl
never C is born before a parent
draw notation
```
