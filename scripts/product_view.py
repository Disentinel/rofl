#!/usr/bin/env python3
"""The vocabulary of models/product/vocab.rofl as a page to read: python3 scripts/product_view.py > vocab.md"""
import json, subprocess
ASKS = ['word(W, L)', 'ru(W, T)', 'by(W, T)', 'says(W, T)', 'eg(W, T)', 'rel(R, A, B)', 'source(R, T)', 'lives(R, T)', 'rel_says(R, T)']
args = [x for q in ASKS for x in ('--ask', q)]
out = subprocess.run(['rust/target/release/rofl', 'load', '--json', *args, 'boot.rofl', 'models/product/vocab.rofl'],
                     capture_output=True, text=True, check=True).stdout
rows = [[[c.strip('"') for c in r] for r in json.loads(l)['rows']] for l in out.splitlines() if l.startswith('{')]
word, ru, by, says, eg, rel, source, lives, rel_says = rows
one = lambda t: {k[0]: k[1] for k in t}
ru, by, says, eg, source, lives, rel_says = map(one, (ru, by, says, eg, source, lives, rel_says))
LAYER = {'is': 'What the product is', 'about': 'What is known and shown about it', 'history': 'What happens to it'}
print('# The words a software product is described in\n\nRendered from `models/product/vocab.rofl`. Do not edit here.\n')
for layer, title in LAYER.items():
    print(f'## {title}\n\n| Term | Russian | Means | Example | Whose word |\n|---|---|---|---|---|')
    for w, l in word:
        if l == layer: print(f"| **{w}** | {ru.get(w, '')} | {says.get(w, '')} | {eg.get(w, '')} | {by.get(w, '')} |")
    print()
print('## Relations\n\n| Relation | From | To | Facts come from | Where | Means |\n|---|---|---|---|---|---|')
for r, a, b in rel:
    print(f"| {r} | {a} | {b} | {source.get(r, '') if source.get(r) != 'missing' else '**nothing yet**'} | {lives.get(r, '')} | {rel_says.get(r, '')} |")
