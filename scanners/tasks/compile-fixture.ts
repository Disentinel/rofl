// Not a task: the compiler that produces t9's input. It parses, so it must not
// be the process t9 measures.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const ROOT = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(ROOT + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(ROOT + 'examples/sensors.rofl', 'utf8'));
r.evaluate();
fs.writeFileSync(process.argv[2], r.save());
