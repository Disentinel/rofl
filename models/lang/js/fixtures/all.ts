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
a?.b.c(g()); (a?.b).c; a?.b!.c; a?.[g()].d?.e;
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
export type { A }; export { type I as J, E }; export interface K { k: number } export class Cx {}
import(tl);
function* gq() { yield; const r = yield 1; yield* gq(); }
async function fa(it: any) { for await (const v of it) { try { await v; } catch { } finally { v.close(); } } }
try { amb(); } finally { amb(); }
await amb();
class Acc { private a1 = 1; protected a2 = 2; public readonly a3 = 3; constructor(readonly a4: number) {} }
type Uno = | A; import type {} from 'tonly'; namespace NQ { export const v = 1 }
type TLit = "a" | 1; type TBool = true; let tlv: "b" = "b"; const nlv = null;
function hf() { function hn() {} class HC2 {} } const hg = function () {}; const hd = class {}; { function hb() {} }
for (const [fa, fb] of [[1, 2]]) { fa + fb; } const [ea, [eb]] = [1, [2]]; function fp([pa], { pb }) {} const [] = ea; let au, av; [au, av] = [1, 2]; for ([au, av] of [[3, 4]]) {}
const vgc = ea ? fa : fb; const vgl = ea || fa; const vgn = ea && fa; const vgq = ea ?? fa; const vgcc = ea ? (fa ? 1 : 2) : 3;
interface MSig { msm(a: number): string; msp: () => string; msq(): void; readonly msr: number; }
type MSLit = { mtm(b: string): number; mtp: () => number };
abstract class BodyLess { abstract bla(a: number): string; blo(a: string): string; blo(a: number): string; blo(a: any): string { return a; } declare bld: number; abstract blp: string; blf: number; blg; accessor bla2 = 3; constructor(a: string); constructor(a: any) {} }
