import * as fs from 'fs';
import { fail } from './errors.js';

export function guard(): void {
	try {
		fail('bad');
	} catch (e) {
		fs.rmSync('/tmp/guard');
	}
}
