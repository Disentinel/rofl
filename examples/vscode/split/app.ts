import { helper, Registry } from './lib.js';
import { guard } from './guard.js';

helper();
guard();
const r = new Registry();
r.open('/srv/data');
