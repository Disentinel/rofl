const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

const server = http.createServer((req, res) => {
  const worker = fork('./convert.js', [req.url]);
  worker.on('message', (m) => res.end(m));
});
server.listen(8080);

const ticker = setInterval(() => console.log('tick'), 1000);

function appendLine(path, line) {
  const fd = fs.openSync(path, 'a');
  fs.closeSync(fd);
  fs.writeSync(fd, line);
}

function firstByte(path) {
  const fd = fs.openSync(path, 'r');
  const buf = Buffer.alloc(1);
  fs.readSync(fd, buf);
  return buf[0];
}

module.exports = { appendLine, firstByte };
