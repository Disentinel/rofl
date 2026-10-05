import * as fs from 'fs';
import { LOGS, cacheFile, withExt } from './locations.js';

fs.mkdirSync(LOGS);
fs.writeFileSync(cacheFile('index.json'), '');
fs.writeFileSync(withExt(`${LOGS}/today`), '');
fs.appendFileSync(LOGS + '/all.log', '');
