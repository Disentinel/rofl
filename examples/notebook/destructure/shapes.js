const config = require('./config');
const { PORT: cfgPort, HOST } = require('./config');
const env = { PORT: 5, WORKERS: 4 };
const { PORT = 1343, LOG = 'info' } = env;

function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

function fromObject({ port, host }) { use('object.port', port); use('object.host', host); }
function withDefault({ port = 80 }) { use('default.port', port); }
function plainDefault(port = 81) { use('plain.port', port); }
function renamed({ port: p = 82 }) { use('renamed.p', p); }
function parsed(raw) { use('parseInt', parseInt(raw, 10)); use('Number', Number(raw)); use('parseFloat', parseFloat(raw)); }
const arrow = ({ port }) => { use('arrow.port', port); };

function declared() {
  use('decl.PORT', PORT); use('decl.LOG', LOG);
  use('require.port', cfgPort); use('require.host', HOST); use('require.member', config.PORT);
}

fromObject({ port: 8080, host: 'a.example' });
withDefault({});
withDefault({ port: 8081 });
plainDefault();
plainDefault(8082);
renamed({ port: 8083 });
renamed({});
parsed('9090');
arrow({ port: 3030 });
declared();
