import * as fs from 'fs';

export function helper(): void {
	fs.rmdirSync('/tmp/lib');
}

export class Registry {
	open(dir: string): void {
		fs.mkdirSync(dir);
	}
}
