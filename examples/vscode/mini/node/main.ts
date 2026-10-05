import { spawn } from 'child_process';
import { ipcMain } from 'electron';
import { HELLO_CHANNEL } from '../common/channels.js';
import { remove, writeAtomic } from './pfs.js';
import { startServers } from './server.js';

const { execFile } = require('child_process');
const IStorage = (target: unknown, key: string | undefined, index: number): void => { };

export class Main {
	constructor(@IStorage private readonly storage: { dir: string }) { }

	run(): void {
		writeAtomic('/tmp/settings.json', '{}');
		remove('/tmp/cache');
		remove(this.storage.dir);
		const editor = 'code';
		spawn(editor, ['--wait']);
		execFile('git', ['status']);
		ipcMain.handle(HELLO_CHANNEL, () => 'hi');
		fetch('https://update.code.visualstudio.com/api/update');
		startServers();
	}
}
