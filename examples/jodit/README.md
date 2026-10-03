# jodit

Seven storage backends of [jodit-python](https://github.com/TimurSeyidov/jodit-python)
implement one contract (`StorageAdapter`). Its tests check every backend
against real servers. These files ask what each backend's methods actually
send to the store.

- `contract.rofl` — which classes implement the contract (and the streaming
  extension), and each request a duty reaches: through which step of its body,
  `repeated` when it runs in a loop (a loop over a folder, pages, retries or
  polls alike), and on which path: `main`, `always` (a `finally`) or `handler`
  (an `except`). Three audits keep it honest: `unclassified` (an outside call
  nothing accounts for), `bucketed_on_client` (a name filed as not a request,
  called on something requests are sent to) and `unresolved_name` (a call by
  name that goes nowhere). Read from the code through `rules/py-model.rofl`.
- `specifics.rofl` — where one contract becomes different behaviour when
  nothing fails: a move that is a copy and then a delete
  (`delete_before_copy[audit]` checks the order, branch by branch), a copy whose
  bytes pass through the connector, a write renamed over its target, a duty
  that polls or backs off; and whether each is fixable, because the protocol
  offers the real thing under a condition, or inherent.
- `backends.rofl` — the one hand-written file: what each client call is,
  matched by name, or why it is not a request; and what each protocol offers,
  with the page that says so.
- `adapters.py` — a fixture in jodit's shapes, with a planted fault
  (HastyAdapter deletes before it copies), scanned into `facts/py-model.rofl`.
  The world `jodit_fixture` runs these rules over it against the expected rows
  in `examples/checks/jodit-fixture.rofl`.

Over the real code, as a check and not a test (checked at jodit-python 05c1012):

    git clone --depth 1 https://github.com/TimurSeyidov/jodit-python /tmp/jodit
    uv run -p 3.14 scanners/py_ast.py /tmp/jodit/src /tmp/jodit/src/jcpy/storage > facts/generated/jodit-storage.rofl
    node --experimental-strip-types scripts/ask.ts --facts facts/generated/jodit-storage.rofl \
      --rules rules/py-model.rofl examples/jodit/backends.rofl examples/jodit/contract.rofl examples/jodit/specifics.rofl \
      -- 'move_by_copy[jodit](B)' 'kind_of[jodit](B, "move_file", K)' 'why move_by_copy[jodit](s3)'
