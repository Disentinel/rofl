# jodit

Seven storage backends of [jodit-python](https://github.com/TimurSeyidov/jodit-python)
implement one contract (`StorageAdapter`). Its tests check every backend
against real servers. These files ask what each backend's methods actually
send to the store.

- `contract.rofl` — which classes implement the contract, and which kinds of
  request each duty reaches, `many` when one runs per item of a folder. Read
  from the code through `rules/py-model.rofl`.
- `specifics.rofl` — where one contract becomes different behaviour: a move
  that is a copy and a delete, a copy whose bytes pass through the connector,
  a write renamed over its target, a duty that waits by polling.
- `backends.rofl` — the one hand-written file: what each client call is.
- `adapters.py` — a fixture in jodit's shapes, scanned into
  `facts/py-model.rofl`; the world `jodit_fixture` runs these rules over it.

Over the real code:

    git clone --depth 1 https://github.com/TimurSeyidov/jodit-python /tmp/jodit
    uv run -p 3.14 scanners/py_ast.py /tmp/jodit/src /tmp/jodit/src/jcpy/storage > facts/generated/jodit-storage.rofl
    node --experimental-strip-types scripts/ask.ts --facts facts/generated/jodit-storage.rofl \
      --rules rules/py-model.rofl examples/jodit/backends.rofl examples/jodit/contract.rofl examples/jodit/specifics.rofl \
      -- 'move_by_copy[jodit](B)' 'kind_of[jodit](B, "move_file", K)' 'why move_by_copy[jodit](s3)'
