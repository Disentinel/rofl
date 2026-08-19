// Child process for the round-trip test: restores a store snapshot and
// evaluates WITHOUT ever seeing program text (no re-parse).
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';

const snap = fs.readFileSync(process.argv[2], 'utf8');
const r = Rofl.fromSnapshot(snap);
r.evaluate();
console.log(JSON.stringify({
  temp: r.query('temp[verified](t1, V)').rows.map((x) => x.text),
  outlier: r.query('outlier[trust](S)').rows.map((x) => x.text),
  state: r.store.canonicalState(),
}));
