import * as fs from 'fs';

export function id(p: string): string {
	return p;
}

export function ensure(dir: string): string {
	fs.mkdirSync(dir);
	return dir;
}

export const LOG_DIR = '/var/log/app';
export const settings = { cache: '/tmp/app-cache', mode: 'fast' };

export function flush(): void {
	fs.writeFileSync(settings.mode, '');
}

export default function home(): string {
	return '/home/app';
}
