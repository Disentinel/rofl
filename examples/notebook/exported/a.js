export const named = 'nv';
export default function def() { return 'dv'; }
export function fn() { return 'fv'; }
const hidden = 'hv';
export { hidden as renamed };
export class K { m() { return 'km'; } }
export const obj = { k: 'ok' };
export let mutable = 'm0';
export function setMutable() { mutable = 'm1'; }
