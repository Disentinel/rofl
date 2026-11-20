function use(tag: string, v: unknown) { ((globalThis as any).__seen ?? (() => {}))(tag, v); }
enum Color { Red = 'r', Green = 'g' }
use('enumMember', Color.Red);
enum Num { A, B }
use('enumNum', Num.B);
class PP { constructor(private readonly name: string, public tag = 'pt') {} get n() { return this.name; } }
use('paramProp', new PP('pn').n);
use('paramPropDefault', new PP('x').tag);
namespace NS { export const v = 'nsv'; export function f() { return 'nsf'; } }
use('namespaceVal', NS.v);
use('namespaceFn', NS.f());
abstract class Abs { abstract m(): string; call() { return this.m(); } }
class Impl extends Abs { m() { return 'im'; } }
use('abstract', new Impl().call());
const asserted = ('av' as unknown) as string;
use('asCast', asserted);
const sat = { k: 'sk' } satisfies Record<string, string>;
use('satisfies', sat.k);
interface I { x: string }
const typed: I = { x: 'ix' };
use('interfaceTyped', typed.x);
function generic<T>(x: T): T { return x; }
use('generic', generic<string>('gv'));
const tuple: [string, number] = ['t0', 1];
use('tuple', tuple[0]);
class Opt { constructor(public o?: string) {} }
use('optionalParamProp', new Opt('op').o);
const enumKeyed: Record<Color, string> = { [Color.Red]: 'er', [Color.Green]: 'eg' };
use('enumKeyed', enumKeyed[Color.Red]);
