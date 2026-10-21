// The corpus of rust/rofl/tests/kept_delta.rs: six small JS modules, each in three versions, each version scanned
// alone (scanners/cli.ts, the scanner `rofl` runs) into rust/rofl/tests/fixtures/delta/<name>.<version>.rofl. A test
// step puts one version of a module in place, takes one out, or brings one back, and asks the kept world by delta
// against a fresh evaluation. Run again only when the scanner's output changes:
//   node --experimental-strip-types scripts/kept_delta_fixture.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'rust/rofl/tests/fixtures/delta');

const MODULES: Record<string, string[]> = {
  'db.js': [
    `export function query(sql) { return fetch('http://db.internal/q?' + sql); }\nexport const pool = { size: 4 };\n`,
    `export function query(sql) { return fetch('http://db.internal/q?' + sql).then((r) => r.json()); }\nexport const pool = { size: 8 };\nexport function close() { pool.size = 0; }\n`,
    `export function query(sql, params) { console.log(sql); return fetch('http://db.internal/v2?' + sql, { body: params }); }\n`,
  ],
  'users.js': [
    `import { query } from './db.js';\nexport function getUser(id) { return query('select * from users where id=' + id); }\n`,
    `import { query } from './db.js';\nexport function getUser(id) { return query('select name from users where id=' + id); }\nexport function listUsers() { return query('select * from users'); }\n`,
    `import { query, close } from './db.js';\nexport async function getUser(id) { const r = await query('u' + id); close(); return r; }\n`,
  ],
  'orders.js': [
    `import { query } from './db.js';\nimport { getUser } from './users.js';\nexport function orderFor(id) { const u = getUser(id); return query('orders ' + u); }\n`,
    `import { query } from './db.js';\nexport function orderFor(id) { return query('orders ' + id); }\nexport function total(xs) { return xs.reduce((a, b) => a + b, 0); }\n`,
    `import { getUser } from './users.js';\nexport function orderFor(id) { return getUser(id); }\n`,
  ],
  'log.js': [
    `export function log(msg) { console.log(msg); }\n`,
    `import fs from 'fs';\nexport function log(msg) { fs.appendFileSync('/tmp/app.log', msg); }\n`,
    `export function log(msg) { process.stdout.write(msg + '\\n'); }\nexport function warn(msg) { console.warn(msg); }\n`,
  ],
  'server.js': [
    `import { orderFor } from './orders.js';\nimport { log } from './log.js';\nexport function handle(req) { log(req.url); return orderFor(req.id); }\n`,
    `import { orderFor, total } from './orders.js';\nexport function handle(req) { return total([orderFor(req.id)]); }\n`,
    `import { getUser } from './users.js';\nimport { log } from './log.js';\nexport function handle(req) { log('u'); return getUser(req.id); }\n`,
  ],
  'util.js': [
    `export const id = (x) => x;\n`,
    `export const id = (x) => x;\nexport function twice(f) { return (x) => f(f(x)); }\n`,
    `import { log } from './log.js';\nexport function trace(x) { log(String(x)); return x; }\n`,
  ],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-delta-'));
for (const [name, versions] of Object.entries(MODULES)) fs.writeFileSync(path.join(dir, name), versions[0]);
for (const [name, versions] of Object.entries(MODULES)) {
  versions.forEach((text, v) => {
    fs.writeFileSync(path.join(dir, name), text);
    const facts = execFileSync('node', ['--experimental-strip-types', path.join(ROOT, 'scanners/cli.ts'), dir, name], { encoding: 'utf8' });
    const kept = facts.split('\n').filter((l) => !l.startsWith('-- reads:')).join('\n');
    fs.writeFileSync(path.join(OUT, `${name.replace(/\.js$/, '')}.${v}.rofl`), kept);
  });
  fs.writeFileSync(path.join(dir, name), versions[0]);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${Object.values(MODULES).flat().length} files into ${path.relative(ROOT, OUT)}`);
