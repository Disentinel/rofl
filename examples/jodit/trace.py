"""trace.py — a pytest plugin that records what jodit-python's adapters put on
the wire while its own contract tests run: the oracle examples/jodit/ is
checked against.

Each duty of an adapter (write, move_file, ...) marks the calls made under it,
the outermost duty only. What is recorded is the protocol, not the code's
names: an SFTP message, an FTP command, an HTTP method, an HTTP request to the
GCS JSON API, an operating-system call. The facts written are

  observed[jodit](Adapter, Duty, Wire, TestClass).
  observed_via[jodit](Adapter, Duty, Call, Wire).
  observed_call[jodit](Adapter, Duty, Call).

`Call` is the outermost library call the message went out under (`putfo`,
`copyfile`, `storbinary`): what one call in the code expands into on the wire.

  cd jodit-python
  TRACE_OUT=/tmp/observed.rofl PYTHONPATH=<rofl>/examples/jodit \\
    uv run pytest -p trace -q tests/unit/test_sftp.py ...

NOT SEEN: requests a library makes from threads of its own (paramiko's
prefetch), which carry no duty.
"""

import builtins
import contextvars
import functools
import inspect
import io
import os
import shutil
import sys
from urllib.parse import urlsplit

DUTY: contextvars.ContextVar[tuple[str, str] | None] = contextvars.ContextVar("duty", default=None)
ENTRY: contextvars.ContextVar[str | None] = contextvars.ContextVar("entry", default=None)
DUTIES = ("write", "read", "delete_file", "create_directory", "delete_directory", "stat", "list",
          "file_exists", "directory_exists", "copy_file", "move_file", "write_file", "iter_file")
ADAPTERS = {"jcpy.storage.s3": "S3StorageAdapter", "jcpy.storage.azure": "AzureStorageAdapter",
            "jcpy.storage.gcs": "GcsStorageAdapter", "jcpy.storage.sftp": "SftpStorageAdapter",
            "jcpy.storage.ftp": "FtpStorageAdapter", "jcpy.storage.webdav": "WebdavStorageAdapter",
            "jcpy.storage.local": "LocalStorageAdapter"}
seen: set[tuple[str, str, str, str]] = set()
via: set[tuple[str, str, str, str]] = set()
calls: set[tuple[str, str, str]] = set()
variant = ["none"]


def record(wire: str) -> None:
    duty = DUTY.get()
    if duty is not None:
        seen.add((duty[0], duty[1], wire, variant[0]))
        via.add((duty[0], duty[1], ENTRY.get() or "none", wire))


def entry(owner, name: str) -> None:
    fn = getattr(owner, name, None)
    if not callable(fn) or isinstance(fn, type):
        return

    @functools.wraps(fn)
    def inner(*args, **kwargs):
        # an entry is a call the adapter's code makes, not one a library makes inside
        mine = ENTRY.get() is None and called_from_jcpy()
        duty = DUTY.get()
        if mine and duty is not None:
            calls.add((duty[0], duty[1], name))
        token = ENTRY.set(ENTRY.get() or (name if mine else None))
        try:
            return fn(*args, **kwargs)
        finally:
            ENTRY.reset(token)
    setattr(owner, name, inner)


PLUMBING = ("anyio", "asyncio", "threading", "concurrent", "functools", "contextvars", "trace")


def called_from_jcpy() -> bool:
    """The first caller that is not plumbing running a handed callable is jodit's
    code. A worker thread's stack holds only plumbing: what it runs was handed to
    it from a context the duty mark came with, so that counts as jodit's."""
    frame = sys._getframe(2)
    while frame is not None:
        module = frame.f_globals.get("__name__", "")
        if not module.startswith(PLUMBING):
            return module.startswith("jcpy.")
        frame = frame.f_back
    return True


def entries(owner) -> None:
    for name, fn in list(vars(owner).items()):
        if not name.startswith("_") and inspect.isfunction(fn):
            entry(owner, name)


def mark(adapter: str, name: str, fn):
    if inspect.isasyncgenfunction(fn):
        # marked only while the generator runs a step: between steps the
        # caller runs, and a stream may be finished by another task
        @functools.wraps(fn)
        async def gen(*args, **kwargs):
            outer = DUTY.get()
            inner = fn(*args, **kwargs)
            try:
                while True:
                    DUTY.set(outer or (adapter, name))
                    try:
                        item = await inner.__anext__()
                    except StopAsyncIteration:
                        return
                    finally:
                        DUTY.set(outer)
                    yield item
            finally:
                DUTY.set(outer or (adapter, name))
                try:
                    await inner.aclose()
                finally:
                    DUTY.set(outer)
        return gen

    @functools.wraps(fn)
    async def coro(*args, **kwargs):
        token = DUTY.set(DUTY.get() or (adapter, name))
        try:
            return await fn(*args, **kwargs)
        finally:
            DUTY.reset(token)
    return coro


def wrap(owner, name: str, wire):
    fn = getattr(owner, name)

    @functools.wraps(fn)
    def inner(*args, **kwargs):
        record(wire(*args, **kwargs))
        return fn(*args, **kwargs)
    setattr(owner, name, inner)


def sftp_wire(client, fileobj, t, *args):
    from paramiko.sftp import CMD_EXTENDED, CMD_NAMES, CMD_OPEN, SFTP_FLAG_WRITE
    if t == CMD_OPEN:
        return "sftp:open:write" if args[1] & SFTP_FLAG_WRITE else "sftp:open:read"
    if t == CMD_EXTENDED:
        return f"sftp:extended:{args[0]}"
    return f"sftp:{CMD_NAMES.get(t, t)}"


def ftp_wire(ftp, cmd, *args, **kwargs):
    return "ftp:" + str(cmd).split(" ", 1)[0].upper()


def gcs_wire(session, method, url, *args, **kwargs):
    parts = urlsplit(url)
    path, query = parts.path, parts.query
    if "/upload/" in path:
        shape = "upload"
    elif "/rewriteTo/" in path or "/copyTo/" in path:
        shape = "rewrite"
    elif "alt=media" in query:
        shape = "media"
    elif "/o/" in path:
        shape = "object"
    elif path.endswith("/o"):
        shape = "objects"
    else:
        shape = "other"
    return f"gcs:{method.upper()}:{shape}"


def open_wire(file, mode="r", *args, **kwargs):
    return "local:open:read" if set(str(mode)) <= {"r", "b", "t"} else "local:open:write"


def pytest_configure(config):
    import importlib
    import ftplib
    import pathlib
    for module, cls in ADAPTERS.items():
        try:
            klass = getattr(importlib.import_module(module), cls)
        except ImportError:
            continue
        for name in DUTIES:
            if name in klass.__dict__:
                setattr(klass, name, mark(cls, name, klass.__dict__[name]))
    try:
        from paramiko.sftp_client import SFTPClient
        wrap(SFTPClient, "_async_request", sftp_wire)
    except ImportError:
        pass
    import ftplib
    for name in ("sendcmd", "voidcmd", "ntransfercmd"):
        wrap(ftplib.FTP, name, ftp_wire)
    import httpx
    wrap(httpx.AsyncClient, "send", lambda client, request, *a, **k: f"http:{request.method}")
    try:
        import requests
        wrap(requests.Session, "request", gcs_wire)
    except ImportError:
        pass
    for name, kind in (("rename", "rename"), ("replace", "rename"), ("unlink", "delete"), ("remove", "delete"),
                       ("rmdir", "delete"), ("mkdir", "mkdir"), ("stat", "stat"), ("scandir", "scandir")):
        wrap(os, name, lambda *a, k=kind, **kw: f"local:{k}")
    for name, kind in (("rmtree", "delete"), ("copyfile", "copy")):
        wrap(shutil, name, lambda *a, k=kind, **kw: f"local:{k}")
    for owner in (builtins, io):
        wrap(owner, "open", open_wire)
    # the entries are wrapped over the wire, so a wire call made directly is its own entry
    try:
        from paramiko.sftp_client import SFTPClient
        from paramiko.sftp_file import SFTPFile
        entries(SFTPClient)
        entries(SFTPFile)
    except ImportError:
        pass
    entries(ftplib.FTP)
    import httpx as httpx_entries
    entries(httpx_entries.Response)
    entries(ftplib.FTP_TLS)
    import ssl
    entries(ssl.SSLContext)
    try:
        from paramiko.client import SSHClient
        entries(SSHClient)
    except ImportError:
        pass
    entries(pathlib.Path)
    for name in ("rename", "replace", "unlink", "remove", "rmdir", "mkdir", "stat", "scandir"):
        entry(os, name)
    for name in ("rmtree", "copyfile", "copyfileobj"):
        entry(shutil, name)
    entry(builtins, "open")
    entry(io, "open")
    try:
        from google.cloud.storage.blob import Blob
        from google.cloud.storage.bucket import Bucket
        from google.cloud.storage.fileio import BlobReader
        from google.cloud.storage.client import Client
        for owner in (Blob, Bucket, BlobReader, Client):
            entries(owner)
    except ImportError:
        pass


def pytest_runtest_setup(item):
    variant[0] = item.cls.__name__ if item.cls else item.module.__name__


def pytest_sessionfinish(session):
    out = os.environ.get("TRACE_OUT")
    if not out:
        return
    with builtins.open.__wrapped__(out, "w") as f:
        f.write("-- written by examples/jodit/trace.py\n")
        for a, d, w, v in sorted(seen):
            f.write(f'observed[jodit]("{a}", "{d}", "{w}", "{v}").\n')
        for a, d, c, w in sorted(via):
            f.write(f'observed_via[jodit]("{a}", "{d}", "{c}", "{w}").\n')
        for a, d, c in sorted(calls):
            f.write(f'observed_call[jodit]("{a}", "{d}", "{c}").\n')
