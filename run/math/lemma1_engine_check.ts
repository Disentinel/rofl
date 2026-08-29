import * as fs from 'node:fs';
import { Rofl } from '/home/user/rofl/src/api.ts';
// In-substrate confirmation of Lemma 1's finite part: for k=5..8, every decided
// class has SOME decided step j whose exact threshold satisfies d <= M*(2^j-3^a).
for (const [k, M] of [[5, 4], [6, 4], [7, 4], [8, 24]] as [number, number][]) {
  const r = new Rofl();
  r.load(fs.readFileSync('/home/user/rofl/boot.rofl', 'utf8'), { budget: 8_000_000, defer: true });
  r.load(fs.readFileSync('/home/user/rofl/run/terras.rofl', 'utf8'), { budget: 8_000_000, defer: true });
  r.load(`
    kk(${k}).
    okthr(R) :- tr(R, J, V, A), pow2(J, P2), pow3(A, P3), P3 < P2, J > 0,
                rep(R, N0), X is V * P2, Y is P3 * N0, D is X - Y,
                Den is P2 - P3, Lim is (${M} + 1) * Den, D < Lim.
    badclass(R) :- decided(R), not okthr(R).
  `, { budget: 8_000_000, defer: true });
  r.evaluate(8_000_000);
  const bad = r.query('badclass(R)').rows.map(x => x.bindings['R']);
  const dec = r.query('decided(R)').rows.length;
  console.log(JSON.stringify({ k, M, decided: dec, bad_classes: bad }));
}
