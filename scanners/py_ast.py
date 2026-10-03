"""py_ast.py — a Python AST becomes facts, completely and without judgement.

The same contract as scanners/js_ast.ts, into the [code] ledger:

  ast_node[code](Id, Kind, File, Line)          one per ast node
  ast_child[code](Parent, Field, Index, Child)  the tree, ordered
  ast_attr[code](Id, Key, Value)                every scalar field
  ast_file[code](RootId, File)                  one per parsed file

or, for a file the running Python cannot parse, `ast_parse_error[code](File, Msg)`.
Kinds and fields are the `ast` module's own names in lower_snake. A context or
an operator (`Load`, `Add`, `And`, `Eq`, `Not`) is a tag rather than a tree, so it
is written as an attribute of its parent: `ast_attr(Id, ctx, load)`, `ops_0`,
`ops_1` for a list. Every other node is a node, `pass`, `break` and `continue`
included. `None` in a field is absent; `Constant(None)` is
`ast_attr(Id, value, none)`. Bytes are written as latin-1 text and a bytes
value that is not ASCII is counted in `bytes_widened(File, N)`.

The parser is the one running this file, so the grammar is its version's:
`except A, B:` needs 3.14. Run it with that interpreter (`uv run -p 3.14`).

  python3.14 scanners/py_ast.py ROOT [PATH ...] > out.rofl

Paths in the facts are relative to ROOT; PATH defaults to ROOT.
"""

import ast
import hashlib
import pathlib
import re
import sys

PERSP = "code"


def atomise(name: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()


lost = 0
widened = 0


def q(s: str) -> str:
    global lost
    out = []
    for ch in s:
        if 0xD800 <= ord(ch) <= 0xDFFF:
            out.append("�")
            lost += 1
        else:
            out.append(ch)
    return '"' + "".join(out).replace("\\", "\\\\").replace('"', '\\"') + '"'


def scalar(v: object) -> str | None:
    if v is None:
        return "none"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int) and abs(v) < 2**53:
        return str(v)
    if isinstance(v, (str, int, float, complex)):
        return q(str(v))
    if isinstance(v, bytes):
        global widened
        widened += not v.isascii()
        return q(v.decode("latin-1"))
    return None


TAGS = (ast.expr_context, ast.operator, ast.boolop, ast.cmpop, ast.unaryop)


def is_tag(v: object) -> bool:
    return isinstance(v, TAGS)


def scan(src: str, file: str) -> list[str]:
    global lost, widened
    lost = widened = 0
    qf = q(file)
    try:
        tree = ast.parse(src, filename=file)
    except SyntaxError as e:
        return [f"ast_parse_error[{PERSP}]({qf}, {q(str(e)[:120])})."]
    prefix = "n" + hashlib.sha256(file.encode()).hexdigest()[:8] + "_"
    facts: list[str] = []
    n = 0

    def emit(node: ast.AST) -> str:
        nonlocal n
        n += 1
        me = f"{prefix}{n}"
        facts.append(f"ast_node[{PERSP}]({me}, {atomise(type(node).__name__)}, {qf}, {getattr(node, 'lineno', 0)}).")
        for field in node._fields:
            v = getattr(node, field, None)
            key = atomise(field)
            if isinstance(v, list):
                for i, x in enumerate(v):
                    if is_tag(x):
                        facts.append(f"ast_attr[{PERSP}]({me}, {key}_{i}, {atomise(type(x).__name__)}).")
                    elif isinstance(x, ast.AST):
                        facts.append(f"ast_child[{PERSP}]({me}, {key}, {i}, {emit(x)}).")
                    elif (t := scalar(x)) is not None and x is not None:
                        facts.append(f"ast_attr[{PERSP}]({me}, {key}_{i}, {t}).")
            elif is_tag(v):
                facts.append(f"ast_attr[{PERSP}]({me}, {key}, {atomise(type(v).__name__)}).")
            elif isinstance(v, ast.AST):
                facts.append(f"ast_child[{PERSP}]({me}, {key}, 0, {emit(v)}).")
            elif v is not None or (isinstance(node, ast.Constant) and field == "value"):
                if (t := scalar(v)) is not None:
                    facts.append(f"ast_attr[{PERSP}]({me}, {key}, {t}).")
        return me

    facts.append(f"ast_file[{PERSP}]({emit(tree)}, {qf}).")
    if lost:
        facts.append(f"surrogate_replaced[{PERSP}]({qf}, {lost}).")
    if widened:
        facts.append(f"bytes_widened[{PERSP}]({qf}, {widened}).")
    return facts


def main(argv: list[str]) -> None:
    root = pathlib.Path(argv[1])
    paths = [pathlib.Path(p) for p in argv[2:]] or [root]
    files = sorted({f for p in paths for f in ([p] if p.is_file() else p.rglob("*.py"))})
    for f in files:
        for fact in scan(f.read_text(encoding="utf-8"), f.relative_to(root).as_posix()):
            print(fact)


if __name__ == "__main__":
    main(sys.argv)
