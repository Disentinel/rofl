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
- `oracle.rofl` and `trace.py` — the check against a run: `trace.py` is a
  pytest plugin that records, under each duty, what jodit's own contract tests
  put on the wire (SFTP messages, FTP commands, HTTP methods, GCS JSON API
  requests, system calls) and through which library call. `oracle.rofl` gives
  each message its kind from the protocol, not from the code's names, measures
  what each library call expands into, and audits both ways:
  `observed_not_predicted` (a kind on the wire the model does not predict) and
  `unreached_call` (a library call made under a duty that the model does not
  reach from it).
- `adapters.py` — a fixture in jodit's shapes, with a planted fault
  (HastyAdapter deletes before it copies), scanned into `facts/py-model.rofl`.
  The world `jodit_fixture` runs these rules over it against the expected rows
  in `examples/checks/jodit-fixture.rofl`.

Over the real code, as a check and not a test (checked at jodit-python 05c1012).
The real world is large for the TypeScript engine; the Rust engine answers it
in seconds:

    git clone --depth 1 https://github.com/TimurSeyidov/jodit-python /tmp/jodit
    uv run -p 3.14 scanners/py_ast.py /tmp/jodit/src /tmp/jodit/src/jcpy/storage /tmp/jodit/src/jcpy/helpers/concurrency.py \
      > facts/generated/jodit-storage.rofl
    (cd /tmp/jodit && uv sync --all-extras -p 3.14 && TRACE_OUT=/tmp/observed.rofl PYTHONPATH=<rofl>/examples/jodit \
      uv run pytest -p trace -q tests/unit/test_sftp.py tests/unit/test_webdav.py tests/unit/test_ftp.py tests/unit/test_gcs.py)
    rust/target/release/rofl-load boot.rofl facts/generated/jodit-storage.rofl rules/py-model.rofl \
      examples/jodit/backends.rofl examples/jodit/contract.rofl examples/jodit/specifics.rofl examples/jodit/oracle.rofl \
      /tmp/observed.rofl | grep -E '\[audit\]|^(move_|copy_|write_)'

Python 3.14 must be a release: 3.14.0rc2 breaks pydantic, and jodit's tests with it.
The run covers sftp, ftp, webdav, gcs and local, whose tests run in process; s3
and azure need Docker (MinIO, Azurite) and were not traced. `why` and `whynot`
over the real world: `scripts/ask.ts` (TypeScript, slow) or `rofl-load --why`.
