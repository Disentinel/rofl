---
model: js
code:
  - pay.js
  - checkout.js
---

# Which exported function can throw at its caller

> Two files of a shop. `charge` throws on a bad amount; `checkout` calls it; `safeCheckout` wraps the call in a `try`.

```rofl
A name N is a risky export if a function F answers to N, F is exported and F may throw.

? N is a risky export
why "checkout" is a risky export
```

> `safeCheckout` catches what `checkout` throws.

```rofl
whynot "safeCheckout" is a risky export
```

> The invariant a CI run would hold.

```rofl
never N is a risky export
```
