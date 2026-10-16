// The graph's dialects: each is the graph drawn as a schema, with its own layout and the kind of box its tags make.
import { mount, type Look } from './pic-graph.ts';
import type { Picture } from './picture.ts';

const LOOKS: Record<string, Look> = {
  architecture: { layout: 'layered-down', groups: 'layered-down', kinds: { person: 'client', database: 'store', queue: 'queue', external: 'ext', service: 'service' } },
  state: { entry: 'initial', kinds: { final: 'exit' } },
  process: { layout: 'lanes', groups: 'layered-right', kinds: { start: 'start', finish: 'exit', decision: 'cond' } },
  causal: { layout: 'ring', says: { positive: '+', negative: '−' } },
  proof: { layout: 'layered-up', kinds: { given: 'fact' } },
};

export const pictures: Picture[] = Object.entries(LOOKS).map(([kind, look]) => ({ kind: kind as Picture['kind'], mount: (el, v, h, d, toggle) => mount(el, v, h, d, toggle, look) }));
