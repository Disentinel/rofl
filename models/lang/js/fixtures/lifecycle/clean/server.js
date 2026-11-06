const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

const server = http.createServer((req, res) => {
  const worker = fork('./convert.js', [req.url]);
  worker.on('message', (m) => { res.end(m); worker.kill(); });
  req.on('close', () => worker.kill());
});
server.listen(8080);

const ticker = setInterval(() => console.log('tick'), 1000);

function stop() {
  clearInterval(ticker);
  server.close();
}
process.on('SIGTERM', stop);

function appendLine(path, line) {
  const fd = fs.openSync(path, 'a');
  fs.writeSync(fd, line);
  fs.closeSync(fd);
}

function firstByte(path) {
  const fd = fs.openSync(path, 'r');
  const buf = Buffer.alloc(1);
  fs.readSync(fd, buf);
  fs.closeSync(fd);
  return buf[0];
}

module.exports = { appendLine, firstByte };
