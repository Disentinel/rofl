import * as path from 'path';

export const ROOT = '/srv/app';
export const LOGS = `${ROOT}/logs`;

export function cacheFile(name: string): string {
	return path.join(ROOT, 'cache', name);
}

export function withExt(base: string): string {
	return base + '.json';
}
