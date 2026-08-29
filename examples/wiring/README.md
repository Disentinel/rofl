# The wiring demo — a dataflow break across five layers

Three services — **Node**, **Go**, and an **opaque Rust binary** — wired
through **k8s manifests**, **nginx**, and a **DNS zone**. No single-language
linter sees this chain; for the engine it is one join:

```
code (fetch env.BILLING_URL + '/charge')
  → k8s env (BILLING_URL = http://api.internal/billing)
    → DNS zone (api.internal IN A …)
      → nginx (server_name api.internal; location /billing → billing_up)
        → k8s Service billing-svc:8081 → Deployment app=billing, containerPort 8081
```

The wire contract is typechecked too: the Node producer's payload schema
(`{ order_id: 'string', amount: 'number' }`) is joined against the Go
consumer's struct (`OrderID string`, `Amount float64` → normalized types),
field by field. The Rust binary cannot be parsed at all — its wiring is
**declared** as facts beside it (`CONTRACT.rofl`) and independently
corroborated by its k8s `--orders-url` arg: two evidence paths, one call.

## Run it

```sh
node --test test/wiring.test.ts     # from the repo root
```

## What the rules catch (each pinned by a mutation in the test)

| break | meaning |
|---|---|
| `port_mismatch` | Service targetPort ≠ any deployment containerPort for the selector |
| `dead_route` | nginx location proxies to an upstream that lands nowhere alive |
| `unrouted_call` | code calls a path nginx does not route |
| `unresolved_host` | a called host has no path to an A record in the zone |
| `missing_deployment` | Service selector matches no deployment |
| `type_break` | producer and consumer disagree on a wire field's type |
| `missing_field` | consumer expects a field nobody produces |
| `broken_call` | the end-to-end rollup: any link above severed |

The test follows the house mutation standard: the standing fixture derives
**zero** breaks, then it is manually broken seven distinct ways
(retract/assert) and each break must surface as its specific relation —
including the check that unrelated calls stay green.

## Honest scope

- Extractors (`scanners/infra.ts`) pull the **wiring surface** — who
  listens where, who calls what, which fields cross the wire — not full
  ASTs. An extractor here is an attributed witness, not a compiler; the
  rules do the joining. Go/Node extraction is regex-grade, sufficient for
  the surface; the YAML parser is a small subset (maps, lists, scalars —
  ordinary manifests and docker-compose files fit).
- Routing matches on the first path segment; contracts are keyed by
  endpoint (last segment). Real nginx semantics (regex locations, rewrite)
  would live in a richer extractor, same rules.
- ~40 lines of rules, ~250 lines of extractors, three config dialects and
  two languages plus one binary. The rules never mention Node, Go, k8s or
  nginx — they speak hosts, ports, routes and fields. That is the point:
  add an extractor, keep the invariants.
