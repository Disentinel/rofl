import d, { a as b, c } from 'm';
import * as ns from 'n';
import 'side';
import type { T } from 't';
export { b as e };
export const k = 1, [p1, ...pr] = arr, { q: q1, ...qr } = obj;
export default function f(x: number, y = 2, ...rest: any[]): string { return `t${x}u`; }
export * from 'all';
export * as nsx from 'all2';
class C extends B implements I {
  #p = 1; static s = 2; accessor acc = 3;
  constructor(private z: number) { super(); }
  get g() { return this.#p; } set g(v) { this.#p = v; }
  static { init(); }
  static has(o) { return #p in o; }
  @dec m(...a) { return new.target; }
}
async function* gen() { yield 1; yield* other(); await p; for await (const v of it) {} }
const o = { a, b: 1, [k]: 2, ...s, m() {}, get x() { return 1; } };
const arr2 = [1, , ...s];
let u; u ??= 3; u += 1; u++; ++u; (u, k);
o?.a?.b(); o.a?.(1);
x = a ? b : c; y = (a && b || c) ?? d;
label: for (let i = 0; i < 3; i++) { if (i) continue label; else break; }
for (const k in o) {} while (x) { x--; } do { x++; } while (x < 3);
switch (x) { case 1: f(); break; default: g(); }
try { h(); } catch (e) { throw e; } finally { done(); }
const fn = async (a) => await a;
tag`a${b}c`;
const v = x as any, w = x!, z2 = <T>x, s2 = x satisfies T;
import('dyn').then(r => r);
const re = /a/g, big = 10n, nul = null, t = true, tl = `plain`;
type A = string | number; interface I { a: string; m(): void }
enum E { A = 1 } namespace N { export const n = 1 }
declare function amb(): void;
typeof x; void 0; delete o.a; !x; -x; 'a' in o;
