// Each call runs inside `probe`, which records the TypeError a call throws.
import { Store, Sub, Ev, helper } from './lib';
import * as L from './lib';
import * as O from './open';

declare function probe(tag: string, f: () => unknown): void;

probe("Store.make", () => Store.make());
probe("Store.makee", () => Store.makee());
probe("Store.get", () => Store.get());
probe("Store.bind", () => Store.bind(null));
probe("Sub.make", () => Sub.make());
probe("Sub.more", () => Sub.more());
probe("Sub.moree", () => Sub.moree());

const s = new Store();
probe("s.get", () => s.get());
probe("s.gett", () => s.gett());

probe("Ev.once", () => Ev.once());
probe("Ev.twice", () => Ev.twice());
probe("Ev.none", () => Ev.none());
probe("Ev.hasOwnProperty", () => Ev.hasOwnProperty("once"));

probe("L.helper", () => L.helper());
probe("L.helperr", () => L.helperr());
probe("L.extra", () => L.extra());
probe("L.toString", () => L.toString());

probe("helper.call", () => helper.call(null));

class Local {
  static a() { return 1; }
  b() { return 2; }
}
probe("Local.a", () => Local.a());
probe("Local.b", () => Local.b());

// what the model cannot see whole stays unknown
probe("O.join", () => O.join("a", "b"));
probe("O.joinn", () => O.joinn("a", "b"));
