import * as fs from 'fs';
import { each } from './each.js';

each(['/tmp/a1', '/tmp/a2'], p => fs.unlinkSync(p));
