// THE HAND-WRITTEN PARSER, AGAINST src/parser.ts, OVER THE WHOLE CORPUS.
//
// ring1 is the SPECIFICATION — every production it defines is quoted above the
// Rust that implements it — and `src/parser.ts` is the ORACLE, because ring1
// agrees with it on 41 of 41 files with 0 refused and is far cheaper to ask.
// That split is what makes a hand-written parser safe to keep: a syntax change
// is still a change to the RULES first, and a divergence cannot be silent.
//
// NEITHER SIDE OWNS THE COMPARISON FORMAT. Both trees are rendered here into
// the same s-expression, so what is compared is two PARSES and not one
// printer's opinion of the other.
//
// FIVE DIFFERENCES WERE FOUND THIS WAY AND EVERY ONE WAS REAL, which is what a
// gate is for: the arithmetic tree shape (`op(Op, L, R)` is ring1's INTERNAL
// form and its own host converts it, so matching the host meant building the
// functor directly), clause-local wildcard numbering, a rewind that has to
// restore the wildcard counter or two identical clauses stop canonicalising
// alike, quotes still on a string's text, and the five escapes — which are
// decoded here and every other escape REFUSED by name, as src/tokens.ts does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Lit, Term } from '../src/unify.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const BIN = path.join(REPO, 'rust/target/release/rofl-parse');

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = path.join(d, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.rofl')) out.push(r);
    }
  };
  walk('examples'); walk('rules');
  out.push('boot.rofl');
  return out;
}

const term = (t: Term): string => {
  const x = t as unknown as { k: string; name?: string; v?: unknown; args?: Term[] };
  switch (x.k) {
    case 'a': return `a:${x.name}`;
    case 'v': return `v:${x.name}`;
    case 'i': return `i:${x.v}`;
    case 's': return `s:${JSON.stringify(x.v)}`;
    case 'f': return `(${x.name} ${x.args!.map(term).join(' ')})`;
    default: return `?${x.k}`;
  }
};
const lit = (l: Lit): string => {
  const p = l.persp as unknown as { k: string; name: string };
  const book = p.k === 'a' ? p.name : `v:${p.name}`;
  return `(lit ${l.rel} ${book} [${l.args.map(term).join(' ')}] ${l.temporal})`;
};
const show = (c: Clause): string => {
  const body = c.body.map((b) => b.t === 'pos' ? lit(b.lit)
    : b.t === 'neg' ? `(not ${lit(b.lit)})`
    : `(bi ${b.op} ${term(b.l)} ${term(b.r)})`).join(' ');
  return `(clause ${lit(c.head)}${body ? ' ' + body : ''})`;
};

test('the hand-written parser agrees with src/parser.ts on every file the host accepts', () => {
  if (!fs.existsSync(BIN)) return;                      // built by cargo; skipped when absent
  let checked = 0, hostRefused = 0;
  const differ: string[] = [];
  for (const f of files()) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    let truth: string[];
    try { truth = parseProgram(src).map(show); } catch { hostRefused++; continue; }
    let mine: string[];
    try {
      mine = execFileSync(BIN, [path.join(REPO, f)], { encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch (e) {
      differ.push(`${f}: the parser REFUSED what the host accepted — ${String((e as { stderr?: string }).stderr ?? '').trim().slice(0, 90)}`);
      continue;
    }
    if (truth.length !== mine.length) { differ.push(`${f}: host ${truth.length} clauses, parser ${mine.length}`); continue; }
    for (let i = 0; i < truth.length; i++) {
      if (truth[i] !== mine[i]) {
        differ.push(`${f} clause ${i}:\n     host   ${truth[i]}\n     parser ${mine[i]}`);
        break;
      }
    }
    checked++;
  }
  assert.ok(checked >= 40, `only ${checked} files compared; the corpus should be far larger`);
  assert.deepEqual(differ, [], `\n${differ.join('\n')}`);
  // The host refuses a file the corpus keeps on purpose; that is data, not a
  // failure, but if it ever refuses many the oracle has moved.
  assert.ok(hostRefused <= 2, `the host refused ${hostRefused} files; the oracle has changed`);
});

test('the parser refuses what it cannot read, by name', () => {
  if (!fs.existsSync(BIN)) return;
  const tmp = path.join(REPO, 'rust/target/_bad.rofl');
  fs.writeFileSync(tmp, 'p(a\n');                        // never closed
  let refused = false;
  try { execFileSync(BIN, [tmp], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) {
    refused = true;
    assert.match(String((e as { stderr?: string }).stderr ?? ''), /REFUSED/,
      'a refusal must say so rather than exit quietly');
  }
  fs.rmSync(tmp, { force: true });
  assert.ok(refused, 'an unclosed literal was accepted');
});
