import * as fs from 'fs';
import { ident, ensure, LOG_DIR } from './reexports.js';
import * as u from './util.js';

const cu = require('./util.js');

fs.writeFileSync(ident('/etc/x'), 'y');
ensure(LOG_DIR);
fs.unlinkSync(u.settings.cache);
fs.appendFileSync(u.id('/var/c'), 'z');
fs.rmSync(cu.LOG_DIR);
u.settings.mode = 'slow';
