import { IBar } from './bar';

export interface IFoo extends IBar { run(): void; name: string; opt?(): void }
interface IIdx { [k: string]: () => void }

class Svc {
  private x: IFoo;
  constructor(private readonly foo: IFoo, private readonly fallback: IBar = foo) { this.x = foo; }
  go(p: IFoo) {
    p.run();
    this.foo.nope();
    this.x.run();
    this.fallback.stop();
  }
}
class Sub extends Svc { extra() {} }

function use(p: IFoo, i: IIdx, m: Map<string, number>, s: Svc, t: Svc) {
  p.stop();
  p.halt();
  i.whatever();
  m.get("a");
  m.sett("a", 1);
  s.go(p);
  if (s instanceof Sub) { s.extra(); }
  t.extra();
  p.toString();
}
export { Svc, use };
