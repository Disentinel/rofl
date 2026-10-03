"""A storage contract and three adapters, written in jodit-python's shapes.

The fixture rules/py-model.rofl and examples/jodit/ are checked against: every
way that code reaches its backend appears here once. HastyAdapter is a planted
fault: for a folder its move deletes before it copies, after a branch for a
file that copies first, and delete_before_copy must name the folder's delete.
Scanned into facts/py-model.rofl by
`python3 scanners/py_ast.py examples/jodit examples/jodit/adapters.py`.
TreeAdapter's pool runs the connect it was handed, and the connection's
handshake is a method its library may call: both reach read.
"""

import socket
from functools import partial
from typing import Protocol

from anyio import to_thread


class StorageAdapter(Protocol):
    async def write(self, path: str, contents: bytes) -> None: ...

    async def read(self, path: str) -> bytes: ...

    async def move_file(self, source: str, destination: str) -> None: ...


async def gather_limited(jobs):
    for job in jobs:
        await job()


class BucketAdapter:
    async def write(self, path: str, contents: bytes) -> None:
        try:
            await to_thread.run_sync(lambda: self.client.put_object(Key=path, Body=contents))
        finally:
            self.client.list_objects_v2(Prefix=path)

    async def read(self, path: str) -> bytes:
        def get() -> bytes:
            return self.client.get_object(Key=path)["Body"].read()

        return await self._run(get)

    async def move_file(self, source: str, destination: str) -> None:
        jobs = [partial(self._copy, key, destination + key) for key in self._keys(source)]
        await gather_limited(jobs)
        await self._call("delete", source, lambda: self.client.delete_objects(Prefix=source))

    def _copy(self, key: str, target: str) -> None:
        self.client.copy(Key=key, Target=target)

    def _keys(self, prefix: str) -> list[str]:
        return [o["Key"] for o in self.client.list_objects_v2(Prefix=prefix)["Contents"]]

    async def _call(self, operation: str, path: str, func):
        return await to_thread.run_sync(func)

    async def _run(self, func):
        return await to_thread.run_sync(func)


class Pool:
    def __init__(self, connect):
        self._connect = connect

    def run(self, func):
        return func(self._connect())


class Wire(socket.socket):
    def handshake(self) -> None:
        super().sendall(b"HELLO")


class TreeAdapter:
    def __init__(self) -> None:
        self._pool = Pool(self._connect)

    def _connect(self):
        return Wire()

    async def write(self, path: str, contents: bytes) -> None:
        temporary = f"{path}.tmp"
        try:
            await self._request("PUT", temporary, contents)
            await self._request("MOVE", temporary, path)
        except OSError:
            await self._request("DELETE", temporary, b"")
            raise

    async def read(self, path: str) -> bytes:
        return await self._pool.run(lambda conn: self._request("GET", path, b""))

    async def move_file(self, source: str, destination: str) -> None:
        for parent in destination.split("/")[:-1]:
            if not parent:
                break
            await self._request("MKCOL", parent, b"")
        await to_thread.run_sync(self.conn.rename, source, destination)

    async def _request(self, method: str, path: str, body: bytes) -> bytes:
        return await self.http.request(method, path, content=body)


class HastyAdapter:
    async def write(self, path: str, contents: bytes) -> None:
        self.client.put_object(Key=path, Body=contents)

    async def read(self, path: str) -> bytes:
        return self.client.get_object(Key=path)

    async def move_file(self, source: str, destination: str) -> None:
        if not source.endswith("/"):
            self.client.copy(Key=source, Target=destination)
            self.client.delete_objects(Prefix=source)
            return
        self.client.delete_objects(Prefix=source)
        self.client.copy(Key=source, Target=destination)
