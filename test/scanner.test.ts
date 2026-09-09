// scanner.test.ts — the JS/TS scanner and the incremental materializer:
// facts extract correctly, unchanged files are skipped by hash, deleted files
// lose their fact file, and scanned facts compose with the kernel's
// perspective/authority machinery (forged[audit] catches impostors).

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { extractFacts } from '../scanners/js.ts';
import { scan } from '../scanners/js_ast.ts';
import { parse } from '@babel/parser';
import { materialize, SCANNER_WHO, PREAMBLE_FILE } from '../scanners/materialize.ts';

// `forged`/`unattributed`/`widened` moved to rules/self-audit.rofl, which a
// world loads when its writers are not all its own. This one plants forgeries,
// so it says so here rather than inheriting the audit from the kernel.
const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8')
  + '\n' + fs.readFileSync(new URL('../rules/self-audit.rofl', import.meta.url), 'utf8');

const A_JS = `
import { helper } from './lib/b.ts';
const legacy = require('legacy-pkg');

export function greet(name) {
  return helper(name);
}

export class Greeter {
  greet(name) {
    console.log(name);
    return greet(name);
  }
}

const shout = (s) => greet(s).toUpperCase();
export default Greeter;
`;

const B_TS = `
export const helper = (name: string): string => 'hi ' + name;
export function unused(): void {}
`;

function mkFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-scan-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'a.js'), A_JS);
  fs.writeFileSync(path.join(dir, 'lib', 'b.ts'), B_TS);
  return dir;
}

// --------------------------------------------------------------------------
test('extractFacts: functions, classes, methods, imports, exports, calls', () => {
  const facts = extractFacts('a.js', A_JS, 'deadbeef0000');
  const has = (s: string) => facts.some((f) => f === s);
  assert.ok(has('src_file[code]("a.js", "deadbeef0000").'), 'file fact');
  assert.ok(has('src_func[code]("a.js", "greet", 5).'), 'function decl with line');
  assert.ok(has('src_func[code]("a.js", "shout", 16).'), 'arrow const');
  assert.ok(has('src_class[code]("a.js", "Greeter", 9).'), 'class');
  assert.ok(has('src_method[code]("a.js", "Greeter", "greet", 10).'), 'method');
  assert.ok(has('src_import[code]("a.js", "./lib/b.ts").'), 'import decl');
  assert.ok(has('src_import[code]("a.js", "legacy-pkg").'), 'require import');
  assert.ok(has('src_export[code]("a.js", "greet").'), 'named export');
  assert.ok(has('src_export[code]("a.js", "default").'), 'default export');
  assert.ok(has('src_call[code]("a.js", "greet", "helper").'), 'call with enclosing caller');
  assert.ok(has('src_call[code]("a.js", "Greeter.greet", "console.log").'), 'method caller, member callee');
});

test('extractFacts: unparseable source yields src_parse_error, not a throw', () => {
  const facts = extractFacts('bad.js', 'function {{{', 'ffffffffffff');
  assert.ok(facts.some((f) => f.startsWith('src_parse_error[code]("bad.js"')));
});

// --------------------------------------------------------------------------
test('materialize: full scan, then hash-hit skip, then selective re-scan', () => {
  const src = mkFixture();
  const out = path.join(src, '.facts');

  const r1 = materialize(src, out);
  assert.deepEqual(r1.scanned, ['a.js', 'lib/b.ts']);
  assert.deepEqual(r1.unchanged, []);
  assert.ok(fs.existsSync(path.join(out, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(out, PREAMBLE_FILE)));
  assert.equal(r1.factFiles.length, 3); // preamble + 2

  const r2 = materialize(src, out);
  assert.deepEqual(r2.scanned, []);
  assert.deepEqual(r2.unchanged, ['a.js', 'lib/b.ts']);

  fs.appendFileSync(path.join(src, 'lib', 'b.ts'), '\nexport function extra(): void {}\n');
  const r3 = materialize(src, out);
  assert.deepEqual(r3.scanned, ['lib/b.ts']);
  assert.deepEqual(r3.unchanged, ['a.js']);
});

test('materialize: deleted source loses its fact file', () => {
  const src = mkFixture();
  const out = path.join(src, '.facts');
  const r1 = materialize(src, out);
  const aFacts = r1.factFiles.find((f) => path.basename(f).startsWith('a.js'));
  assert.ok(aFacts && fs.existsSync(aFacts));

  fs.unlinkSync(path.join(src, 'a.js'));
  const r2 = materialize(src, out);
  assert.deepEqual(r2.removed, ['a.js']);
  assert.ok(!fs.existsSync(aFacts!));
  assert.equal(r2.factFiles.length, 2); // preamble + b
});

// --------------------------------------------------------------------------
test('kernel integration: facts load under [code], rules derive, provenance audits', () => {
  const src = mkFixture();
  const out = path.join(src, '.facts');
  const report = materialize(src, out);

  const r = new Rofl();
  assert.ok(r.load(BOOT).ok, 'boot loads');
  for (const f of report.factFiles) {
    const who = f.endsWith(PREAMBLE_FILE) ? undefined : SCANNER_WHO;
    const res = r.assert(fs.readFileSync(f, 'utf8'), { who });
    assert.ok(res.ok, `${f}: ${res.diagnostics.join('; ')}`);
  }

  // domain rule over scanned facts, inside the [code] perspective
  assert.ok(r.load('dependency[code](F, M) :- src_import[code](F, M).').ok);
  const dep = r.query('dependency[code]("a.js", M)');
  assert.deepEqual(dep.rows.map((x) => x.bindings.M), ['"./lib/b.ts"', '"legacy-pkg"']);

  // provenance: the derivation is explainable
  const why = r.why('dependency[code]("a.js", "legacy-pkg")');
  assert.ok(why.ok);
  assert.match(why.text, /src_import\[code\]/);

  // scanner facts are not forged (authority was granted in the preamble)…
  assert.deepEqual(r.query('forged[audit](F)').rows, []);

  // …but an impostor asserting into [code] is
  r.assert('src_func[code]("evil.js", "backdoor", 1).', { who: 'mallory' });
  const forged = r.query('forged[audit](F)');
  assert.equal(forged.rows.length, 1);
  assert.match(forged.rows[0].text, /evil\.js/);
});


// ---------------------------------------------------------------------------
// THE FOUR-RELATION CONTRACT, and the one property it used to drop.
//
// `ast_attr` carried every SCALAR own property and nothing else, so a nested
// object was silently absent — and a sentence recording that blocked four cells
// of the coverage matrix for three sessions with the note "it moves when the
// scanner's contract moves". Nobody had measured how far it was from moving.
//
// MEASURED 2026-09-08 over 223 files and 422 482 nodes, every own property that
// is neither a node, nor an array of nodes, nor a scalar: with babel's `extra`
// declared out, the answer is ONE — `TemplateElement.value`, `{raw, cooked}`,
// both scalars. So the contract carries a nested object of scalars now, one
// `ast_attr` per member, and the rule is general rather than a case for
// templates.

test('a nested object of scalars is flattened, one attribute per member', () => {
  const facts = scan('export const t = `ab`;\n', { file: 't.js' }).facts;
  const attrs = facts.filter((f) => f.startsWith('ast_attr'));
  assert.ok(attrs.some((f) => /value_raw, "ab"\)/.test(f)), `no value_raw: ${attrs.join(' ')}`);
  assert.ok(attrs.some((f) => /value_cooked, "ab"\)/.test(f)), `no value_cooked: ${attrs.join(' ')}`);
  // COOKED AND RAW DIFFER EXACTLY WHERE AN ESCAPE APPEARS, which is the only
  // place the choice between them is observable — and rules/js-dataflow.rofl
  // chooses `cooked`, because that is what the program evaluates to.
  const esc = scan('export const t = `a\\u0062c`;\n', { file: 't.js' }).facts;
  assert.ok(esc.some((f) => /value_cooked, "abc"\)/.test(f)), 'cooked resolves the escape');
  assert.ok(esc.some((f) => /value_raw, "a\\\\u0062c"\)/.test(f)), 'raw keeps it as written');
});

test('babel`s `extra` is declared out, and the declaration is load-bearing', () => {
  // `(a || b)` and a numeric literal both carry `extra` — `{parenthesized,
  // parenStart}` and `{rawValue, raw}` — and both are all-scalar, so the
  // flattening rule above would sweep them in without the SKIP_KEYS entry.
  const src = 'export const v = (1 || 2);\n';
  // POSITIVE CONTROL FIRST: babel really does attach `extra` here, or the
  // assertion below is about nothing. This is the check the first draft of the
  // measurement got wrong — it excluded `extra` from its own walk and then
  // reported that the contract dropped exactly one property.
  const ast = parse(src, { sourceType: 'module' }) as unknown as Record<string, unknown>;
  let seen = 0;
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const o = n as Record<string, unknown>;
    if (typeof o['type'] !== 'string') return;
    if (o['extra'] && typeof o['extra'] === 'object') seen++;
    for (const k of Object.keys(o)) if (k !== 'loc' && k !== 'extra') walk(o[k]);
  };
  walk(ast);
  assert.ok(seen >= 2, `positive control: babel attached \`extra\` to ${seen} nodes`);

  const facts = scan(src, { file: 't.js' }).facts;
  assert.deepEqual(facts.filter((f) => /ast_attr\[code\]\([^,]+, extra_/.test(f)), [],
    'babel`s formatting scratch does not become a fact about the program');
});
