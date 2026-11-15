#!/usr/bin/env python3
"""What models/product/rofl.rofl reads of the tree that no book of facts holds yet, as facts on stdout.
    product.py entries ENGINE.json    the entries: of the engine (the answer of models/engine/features.rofl to
                                      entry_kind(D,N,K), --json), of the library (facts/feature-map.rofl), of the
                                      editor extension (vscode/package.json)
    product.py names ASKED.json       which view names which entry: the answers to reads(U,V) and entry(F,K,W)"""
import json, pathlib, re, sys

def answers(path):
    for line in open(path):
        if line.startswith('{'):
            a = json.loads(line)
            if not a.get('ok', True): sys.exit(a['error'])
            yield [[c.strip('"') for c in r] for r in a['rows']]

q = lambda s: '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def entries(engine):
    out = ['edb(engine_entry).', 'edb(library_entry).', 'edb(extension_entry).']
    for rows in answers(engine):
        out += [f'engine_entry({k}, {q(n)}).' for _, n, k in rows if n]
    for kind, name in re.findall(r'^feature\("(api|flag):([^"]+)"', open('facts/feature-map.rofl').read(), re.M):
        out.append(f'library_entry({"api" if kind == "api" else "knob"}, {q(name)}).')
    ext = json.load(open('vscode/package.json'))['contributes']
    out += [f'extension_entry(command, {q(c["title"])}).' for c in ext.get('commands', [])]
    conf = ext.get('configuration', {})
    for c in conf if isinstance(conf, list) else [conf]:
        out += [f'extension_entry(knob, {q(k)}).' for k in c.get('properties', {})]
    return out

# how an entry of a kind is written in a document; a kind not here is not looked for
SPELT = {
    ('cli', 'verb'): lambda w: rf'\brofl {re.escape(w)}\b',
    ('cli', 'flag'): lambda w: rf'(?<![\w-]){re.escape(w)}(?![\w-])',
    ('cli', 'op'): lambda w: rf'`{re.escape(w)}`|"op": ?"{re.escape(w)}"',
    ('cli', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('extension', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('web', 'cell'): lambda w: rf'`{re.escape(w)} ',
    ('cli', 'env'): lambda w: rf'\b{re.escape(w)}\b',
    ('tree', 'env'): lambda w: rf'\b{re.escape(w)}\b',
    ('tree', 'command'): lambda w: rf'\bnpm (run )?{re.escape(w)}(?![\w:-])',
    ('library', 'api'): lambda w: rf'\b{re.escape(w)}\(',
    ('library', 'knob'): lambda w: rf'\b{re.escape(w)}\b',
    ('extension', 'command'): lambda w: re.escape(w),
    ('extension', 'knob'): lambda w: re.escape(w),
}

def text(view):
    p = pathlib.Path(view)
    return '\n'.join(f.read_text() for f in sorted(p.rglob('*.md'))) if p.is_dir() else p.read_text()

def names(asked):
    reads, entry = answers(asked)
    views = sorted({v for _, v in reads} | {'docs/knobs.md'})
    out = ['edb(named).', 'edb(spelt).'] + [f'spelt({f}, {k}).' for f, k in SPELT]
    for v in views:
        t = text(v)
        out += [f'named({q(v)}, {f}, {k}, {q(w)}).' for f, k, w in entry if (f, k) in SPELT and re.search(SPELT[f, k](w), t)]
    return out

print('\n'.join({'entries': entries, 'names': names}[sys.argv[1]](sys.argv[2])))
