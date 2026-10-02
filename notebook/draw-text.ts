// The text backends, each module's list: a new kind or dialect is a module of its own and one line here.
import { FAMILY, type Backend, type View } from './draw.ts';
import { backends as graph } from './draw-graph.ts';
import { backends as argument } from './draw-argument.ts';
import { backends as time } from './draw-time.ts';
import { backends as table } from './draw-table.ts';
import { backends as space } from './draw-space.ts';
import { backends as notation } from './draw-notation.ts';
import { backends as forms } from './draw-forms.ts';
import { backends as dialects } from './draw-dialects.ts';
import { backends as proof } from './draw-proof.ts';

export const BACKENDS: Backend[] = [...graph, ...argument, ...time, ...table, ...space, ...notation, ...forms, ...dialects, ...proof];

/** The backends that fit a view: its kind's own, then its family's. */
export const backendsOf = (v: View) => [...BACKENDS.filter((b) => b.kind === v.kind), ...BACKENDS.filter((b) => b.kind !== v.kind && b.kind === FAMILY[v.kind])].filter((b) => b.when?.(v) ?? true);
/** The backend a view is written in: the one in `format` that fits it, else the first that fits. */
export function backendOf(v: View, format?: string): Backend {
  const fits = backendsOf(v);
  return fits.find((b) => b.format === format) ?? fits[0];
}
export const text = (v: View, format?: string) => backendOf(v, format).write(v);
