import { slot, either, Holder } from './order_lib.mjs';

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const m = new Map();
m.set(slot(), 25);
m.delete('x');
use('lib.slot', m.get('x'));
m.set(either(false), 26);
m.delete('x');
use('lib.either', m.get('y'));
use('lib.field', new Holder().item);
