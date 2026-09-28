// The text backends, each module's list: a new kind or dialect is a module of its own and one line here.
import type { Backend, View } from './draw.ts';
import { backends as graph } from './draw-graph.ts';
import { backends as argument } from './draw-argument.ts';
import { backends as time } from './draw-time.ts';
import { backends as table } from './draw-table.ts';
import { backends as space } from './draw-space.ts';

export const BACKENDS: Backend[] = [...graph, ...argument, ...time, ...table, ...space];

/** The backend a view is written in: the one of its kind in `format` that fits it, else its kind's first that fits. */
export function backendOf(v: View, format?: string): Backend {
  const fits = BACKENDS.filter((b) => b.kind === v.kind && (b.when?.(v) ?? true));
  return fits.find((b) => b.format === format) ?? fits[0];
}
export const text = (v: View, format?: string) => backendOf(v, format).write(v);
