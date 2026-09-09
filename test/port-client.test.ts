// THE NODE CLIENT FOR THE RUST ENGINE, HELD TO THE CORPUS AND TO ITS OWN
// FAILURE MODES.
//
// `runtime/port.ts` is a protocol, and a protocol has two ways to be wrong:
// it can carry the wrong answer, and it can carry no answer at all. The first
// is checked against `<name>.expected.txt` — the same `canonicalState` the
// port binary is judged by — so a client that mangles a verb shows up as a
// state diff on 34 cases rather than as nothing.
//
// The second is the one a happy-path test cannot see, and it is checked
// directly: an engine error must REJECT the promise that asked for it, and a
// dead child must reject EVERY outstanding promise. A protocol whose failures
// are silent leaves the caller awaiting a promise that can never settle, which
// is a worse defect than the crash it came from, and it is invisible to every
// test that only asks well-formed questions.
//
// Requests are also fired CONCURRENTLY here, because the whole reason each
// answer echoes its id is that arrival order is not a correlation. A client
// that matched answers by order would pass every sequential test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RoflPort, DEFAULT_BIN } from '../runtime/port.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const CORPUS = path.join(REPO, 'facts/port-corpus');

const cases = (): string[] =>
  fs.readdirSync(CORPUS).filter((f) => f.endsWith('.seed.json'))
    .map((f) => f.slice(0, -'.seed.json'.length)).sort();

/** `<name>.t3` is THREE calls to `tick` and nothing else — the corpus
 *  generator's own shape. An `evaluate()` beside them re-derives a layer the
 *  tick already has and re-dates every witness. */
const ticksOf = (n: string): number => {
  const m = /\.t(\d+)$/.exec(n);
  return m ? Number(m[1]) : 0;
};

const built = fs.existsSync(DEFAULT_BIN);

test('the node client reproduces the corpus through the pipe', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  const out = path.join(REPO, 'rust/target', 'port-client-state.txt');
  let checked = 0;
  try {
    for (const n of cases()) {
      const want = path.join(CORPUS, `${n}.expected.txt`);
      if (!fs.existsSync(want)) continue;
      const s = await port.open({ seedPath: path.join(CORPUS, `${n}.seed.json`), budget: 200_000_000 });
      const ticks = ticksOf(n);
      if (ticks === 0) {
        const e = await s.evaluate();
        assert.equal(e.partial, false, `${n}: partial`);
        assert.ok(e.peakRows <= e.space, `${n}: ${e.peakRows} rows over a ${e.space} wall`);
      } else {
        for (let i = 0; i < ticks; i++) await s.tick();
      }
      await s.state(out);
      assert.equal(
        fs.readFileSync(out, 'utf8').trimEnd(),
        fs.readFileSync(want, 'utf8').trimEnd(),
        `${n}: the state through the pipe differs from the corpus`,
      );
      await s.close();
      checked += 1;
    }
  } finally {
    await port.stop();
    fs.rmSync(out, { force: true });
  }
  assert.ok(checked >= 30, `only ${checked} cases driven through the client`);
});

test('fork is cheap, isolated, and visible as both', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  try {
    const core = await port.open({ seedPath: path.join(CORPUS, `${cases()[0]}.seed.json`) });
    const a = await core.fork();
    const b = await core.fork();
    assert.notEqual(a.id, b.id);
    await a.evaluate();
    await b.evaluate();
    assert.equal(await a.stateText(), await b.stateText(), 'two forks of one core differ');

    const before = await a.stateText();
    assert.equal(await b.assert('$client_probe_4f2(marker).'), 1);
    await b.evaluate();
    assert.equal(await a.stateText(), before, 'asserting into one fork changed another');
    assert.ok((await b.stateText()).includes('$client_probe_4f2'), 'the assert did not land');
  } finally {
    await port.stop();
  }
});

test('ask returns rows and what they cost', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  try {
    const s = await port.open({ seedPath: path.join(CORPUS, `${cases()[0]}.seed.json`) });
    await s.evaluate();
    await s.assert('$c(a, a).\n$c(a, b).\n$c(b, b).');
    await s.evaluate();

    const all = await s.ask('$c(_, _)');
    assert.equal(all.rows.length, 3);
    assert.equal(all.vars.length, 2, 'two wildcards are two columns');
    assert.equal(all.probed, false, 'a wholly-unbound ask has nothing to probe with');
    assert.ok(all.scanned >= all.rows.length, 'a superset smaller than the answer');

    const dup = await s.ask('$c(X, X)');
    assert.equal(dup.rows.length, 2, 'a repeated variable did not constrain');
    assert.deepEqual(dup.vars, ['X']);

    const one = await s.ask('$c(a, b)', { keys: true });
    assert.equal(one.rows.length, 1);
    assert.deepEqual(one.vars, []);
    assert.equal(one.keys?.[0], '$c[main](a,b)');

    assert.deepEqual((await s.ask('$c(zz, zz)')).rows, []);
  } finally {
    await port.stop();
  }
});

// The half a happy path cannot reach.
test('an engine error rejects the promise that asked for it', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  try {
    const s = await port.open({ seedPath: path.join(CORPUS, `${cases()[0]}.seed.json`) });
    await assert.rejects(() => s.ask('not a literal at all'), /.+/);
    await assert.rejects(() => s.assert('$r(X) :- $q(X).'), /rules/i);
    await assert.rejects(() => s.assert('$r(X).'), /variable/i);
    await assert.rejects(() => port.send({ op: 'nonsense' }), /unknown op/);
    await assert.rejects(() => port.send({ op: 'ask', session: 9999, query: 'p(X)' }), /no such session/);
    // And the connection still works afterwards, which is the point: an error
    // is an answer, not a broken pipe.
    assert.equal((await s.ask('$nothing_at_all(_)')).rows.length, 0);
  } finally {
    await port.stop();
  }
});

test('answers are matched by id, not by arrival order', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  try {
    const s = await port.open({ seedPath: path.join(CORPUS, `${cases()[0]}.seed.json`) });
    await s.evaluate();
    await s.assert('$p(one).\n$p(two).\n$p(three).');
    await s.evaluate();
    // A failing ask is deliberately in the middle: a client that matched by
    // order would hand the rejection to the wrong caller.
    const rs = await Promise.allSettled([
      s.ask('$p(one)'),
      s.ask('!! not parseable !!'),
      s.ask('$p(three)'),
      s.ask('$p(_)'),
    ]);
    assert.equal(rs[0].status, 'fulfilled');
    assert.equal(rs[1].status, 'rejected');
    assert.equal(rs[2].status, 'fulfilled');
    assert.equal(rs[3].status, 'fulfilled');
    assert.equal((rs[0] as PromiseFulfilledResult<{ rows: string[][] }>).value.rows.length, 1);
    assert.equal((rs[3] as PromiseFulfilledResult<{ rows: string[][] }>).value.rows.length, 3);
  } finally {
    await port.stop();
  }
});

test('a dead engine rejects every outstanding promise', { skip: built ? false : 'rofl-serve not built' }, async () => {
  const port = await RoflPort.start();
  const s = await port.open({ seedPath: path.join(CORPUS, `${cases()[0]}.seed.json`) });
  // Kill it with requests in flight. Nothing may be left awaiting forever.
  const inflight = [s.ask('$p(_)'), s.ask('$q(_)'), s.evaluate()];
  (port as unknown as { child: { kill: (s: string) => void } }).child.kill('SIGKILL');
  const rs = await Promise.allSettled(inflight);
  assert.ok(rs.some((r) => r.status === 'rejected'), 'a killed engine settled nothing');
  await assert.rejects(() => s.ask('$p(_)'), /exited|would not start/);
});

// The verb that ends the pair: a node caller building a world out of .rofl
// text, with no seed and therefore no TypeScript kernel in the picture. The
// oracle is the kernel itself, in this process, over the same text.
test('a world can be built from .rofl text alone, and it is the kernel\'s world',
  { skip: built ? false : 'rofl-serve not built' }, async () => {
  const { Rofl } = await import('../src/api.ts');
  const port = await RoflPort.start();
  try {
    const boot = path.join(REPO, 'boot.rofl');
    const prog = path.join(REPO, 'examples/counter.rofl');
    const s = await port.fresh();
    assert.equal(typeof await s.loadFile(boot), 'number');
    await s.loadFile(prog);
    await s.evaluate();

    const ref = new Rofl();
    ref.load(fs.readFileSync(boot, 'utf8'));
    ref.load(fs.readFileSync(prog, 'utf8'));
    ref.evaluate();
    assert.equal(await s.stateText(), ref.store.canonicalState(),
      'a world built from text in Rust is not the world the kernel builds');

    // A refused program reports every diagnostic and leaves nothing behind.
    const before = await s.stateText();
    await assert.rejects(() => s.load('authority(b, $kernel).\np[$kernel](c).'), /kernel/);
    await s.evaluate();
    assert.equal(await s.stateText(), before, 'a refused load left something behind');
  } finally {
    await port.stop();
  }
});

test('a missing build is reported as a missing build', async () => {
  await assert.rejects(() => RoflPort.start('/nonexistent/rofl-serve'), /cargo build/);
});
