"""own_code.py — A SCAN NAMES ITS CODE (docs/cli.md), for a scanner written in Python.

  code_lines(NAME)   `-- scanner: NAME SUM` and `-- code: PATH SUM` for each file of the code that ran: every module
                     loaded so far that is not Python's own library (the scanner's modules and the packages it uses)

The sums are the engine's (rust/rofl/src/arena.rs `Sum::of`, scanners/own_code.ts `sum`), so the engine can hold a
file of facts to the code that wrote it.
"""

import pathlib
import sys
import sysconfig

M64 = (1 << 64) - 1


def _mix(h: int, w: int) -> int:
    h = ((h ^ w) * 0x9E3779B97F4A7C15) & M64
    return ((h << 29) | (h >> 35)) & M64


def sum_of(b: bytes) -> str:
    h, whole = 0x6A09E667F3BCC908, len(b) - len(b) % 8
    for i in range(0, whole, 8):
        h = _mix(h, int.from_bytes(b[i:i + 8], "little"))
    h = _mix(h, int.from_bytes(b[whole:], "little"))
    h = _mix(h, len(b))
    return f"{h ^ (h >> 31):016x}"


def own_code() -> list[str]:
    std = [pathlib.Path(sysconfig.get_paths()[k]).resolve() for k in ("stdlib", "platstdlib")]
    files = set()
    for m in list(sys.modules.values()):
        f = getattr(m, "__file__", None)
        if not f:
            continue
        p = pathlib.Path(f).resolve()
        if p.is_file() and not any(p.is_relative_to(s) and "site-packages" not in p.parts for s in std):
            files.add(str(p))
    return sorted(files)


def code_lines(name: str) -> list[str]:
    files = [(f, sum_of(pathlib.Path(f).read_bytes())) for f in own_code()]
    total = sum_of("".join(f"{s}\n" for s in sorted(s for _, s in files)).encode())
    return [f"-- scanner: {name} {total}"] + [f"-- code: {f} {s}" for f, s in files]
