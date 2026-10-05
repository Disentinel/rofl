import * as path from 'path';
import { dirname as dir } from 'node:path';
import { lib } from './mypath.js';

const root = '/srv';
const n = 7;
const v = Math.random() > 0.5 ? 'x' : 'y';

export const template = `${root}/a`;
export const plus = root + '/b';
export const sum = 1 + 2;
export const mixed = n + 'x';
let grown = root;
grown += '/c';
export const joined = path.join(root, 'd', 'e');
export const resolved = path.resolve(root, 'f');
export const normal = path.normalize('/a/../b');
export const cut = path.dirname('/x/y/z');
export const base = path.basename('/x/y/z.ts', '.ts');
export const nested = dir(path.join(root, 'g'));
export const method = 'a'.concat(root, 'h');
export const elems = [root, 'i'].join('/');
export const commas = ['j', 'k'].join();
export const address = new URL('/api', 'https://h');
export function unknown(u: string): string { return `${u}/x`; }
export const atCap = `${v}${v}${v}${v}`;
export const overCap = `${v}${v}${v}${v}${v}`;
let s = '';
for (const _ of [1, 2]) { s = s + 'x'; }
export const looped = s;
const w = Math.random() > 0.5 ? 1 : 'z';
export const either = w + 2;
export const doubled = path.dirname('//x');
const rest: string[] = [];
export const spread = path.join(root, ...rest);
export const wrapped = `${lib.join(root, 'm')}!`;
export const emptyJoin = `${[].join()}/z`;
let forked = '';
for (const _ of [1, 2]) { forked = forked + v; }
export const branched = forked;
