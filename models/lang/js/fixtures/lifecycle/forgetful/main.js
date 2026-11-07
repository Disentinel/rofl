const net = require('net');
const fs = require('fs');

const server = net.createServer((sock) => sock.end('bye'));
server.listen(9000);
const heartbeat = setInterval(() => {}, 5000);

function shutdown() {
  closeQuietly(server);
}
function closeQuietly(s) {
  s.close();
}
process.on('SIGINT', shutdown);

function openLog(path) {
  const fd = fs.openSync(path, 'a');
  return fd;
}

function tailWrite(path, line) {
  const out = fs.createWriteStream(path);
  out.close();
  setTimeout(() => out.write(line), 10);
}

function eachTwice(path) {
  const fd = fs.openSync(path, 'r');
  for (let i = 0; i < 2; i++) {
    fs.readSync(fd, Buffer.alloc(1));
    fs.closeSync(fd);
  }
}

module.exports = { openLog, tailWrite, eachTwice };
