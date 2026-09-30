// The graph's dialects: each is the graph laid out by ELK, with its own direction and a style for the tags that make it that dialect.
import { mount, type Look } from './pic-graph.ts';
import { colour, type Picture } from './picture.ts';

const LOOKS = (c: (token: string) => string): Record<string, Look> => ({
  architecture: { direction: 'DOWN', style: [
    { selector: 'node.person', style: { shape: 'ellipse', height: 40 } },
    { selector: 'node.database', style: { shape: 'barrel', height: 40 } },
    { selector: 'node.queue', style: { shape: 'rhomboid', 'border-style': 'dashed' } },
    { selector: 'node.external', style: { 'background-color': c('--p-soft'), 'border-width': 1 } },
  ] },
  state: { entry: 'initial', style: [
    { selector: 'node', style: { shape: 'round-rectangle', 'corner-radius': 12 } },
    { selector: 'node.final', style: { 'border-style': 'double', 'border-width': 5 } },
    { selector: 'node.current', style: { 'border-color': c('--p-accent'), 'border-width': 3, 'font-weight': 'bold' } },
    { selector: 'edge', style: { 'loop-direction': '0deg', 'loop-sweep': '-60deg' } },
  ] },
  process: { bands: true, style: [
    { selector: 'node.start, node.finish', style: { shape: 'ellipse' } },
    { selector: 'node.finish', style: { 'border-width': 4 } },
    { selector: 'node.decision', style: { shape: 'diamond', height: 46 } },
    { selector: 'node.group', style: { 'text-valign': 'top', 'text-halign': 'left', 'text-rotation': 'none' } },
  ] },
  causal: { ring: true, says: { positive: '+', negative: '−' }, style: [
    { selector: 'node', style: { shape: 'ellipse' } },
    { selector: 'edge', style: { 'font-size': 16, 'font-weight': 'bold' } },
    { selector: 'edge.negative', style: { 'target-arrow-shape': 'triangle-tee' } },
  ] },
  proof: { direction: 'UP', style: [
    { selector: 'node.given', style: { 'border-style': 'solid', 'border-width': 1, shape: 'rectangle' } },
  ] },
});

export const pictures: Picture[] = Object.keys(LOOKS(String)).map((kind) => ({ kind: kind as Picture['kind'], mount: (el, v, h, d, toggle) => mount(el, v, h, d, toggle, LOOKS((t) => colour(el, t))[kind]) }));
