import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { dirname, join } from 'path';

const appRoot = '/opt/app';
const updateBase = 'https://update.code.visualstudio.com';

export function writeOutput(name: string, data: string): void {
	fs.writeFileSync(path.join(appRoot, 'out', name), data);
}

export function writeLog(kind: string): void {
	fs.appendFileSync(`${appRoot}/logs/${kind}.log`, '');
}

export function cleanUp(): void {
	fs.mkdirSync(join(dirname(__dirname), 'cache'));
	fs.rmSync(dirname('/opt/app/tmp/old'));
}

export function makeNested(segments: string[]): void {
	let target = appRoot;
	for (const segment of segments) {
		target += '/' + segment;
	}
	fs.mkdirSync(target);
}

export function checkUpdate(): void {
	https.get(new URL('/api/update', updateBase));
}

writeOutput('settings.json', '{}');
writeLog('main');
writeLog('shared');
