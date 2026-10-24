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
function more(str: string, xs: number[], o: IFoo | undefined) {
  str.trim();
  str.trimm();
  xs.push(1);
  xs.pushh(1);
  o?.run();
  o.runn();
}
function dom(el: HTMLElement, input: HTMLInputElement | null) {
  el.focus();
  el.focuss();
  el.style.setProperty("color", "red");
  el.style.setPropertyy("color", "red");
  input.select();
  input.selectt();
  document.createElement("div");
  document.createElementt("div");
  console.log(el);
  console.logg(el);
}
class Maker {
  build(): IFoo { return null as any; }
}
function make(): IFoo { return null as any; }
function infer(m: Maker) {
  const a = new Maker();
  a.build();
  a.buildd();
  const f = a.build();
  f.run();
  f.runn();
  m.build().stop();
  m.build().stopp();
  const g = make();
  g.run();
  g.runn();
}
class Holder {
  private inner = new Maker();
  use() {
    this.inner.build();
    this.inner.buildd();
  }
}
export { Svc, use, more, dom, infer, Holder };
