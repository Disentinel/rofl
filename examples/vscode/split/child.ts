import * as fs from 'fs';
import { Job } from './parent.js';

class CleanJob extends Job {
	step(): void {
		fs.rmSync('/srv/old');
	}
}
new CleanJob().run();
