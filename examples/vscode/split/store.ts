import * as fs from 'fs';
import home, { id } from './util.js';

fs.mkdirSync(id('/var/a'));
fs.rmSync(id('/var/b'));
fs.writeFileSync(home(), 'x');
