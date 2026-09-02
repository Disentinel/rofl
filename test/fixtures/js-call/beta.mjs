// beta.mjs — exists to define a SECOND `run`. Two files, one name: a
// resolution that forgets which file it is in reports edges that no execution
// can produce, and this is the pair that shows it.
import { trace } from './trace.mjs';

export function run(n) {
  trace();
  return bhelper(n);
}

function bhelper(n) {
  trace();
  return n - 1;
}

export function bmain() {
  trace();
  return run(5);
}
