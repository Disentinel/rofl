const http = require('../../util/http');
const { Router } = require('express');
const fs = require('node:fs');

const router = Router();
const other = require('express')();
other.set('port', 9090);

function listen() {
  return http.get('port');
}

http.onStart = function onStart() {
  return 1;
};

function boot() {
  return http.onStart();
}

router.get('/item', (req, res) => {
  fs.readFile('item.json', (err, data) => {
    res.send(data);
  });
  res.send(req.params.id);
});

function local() {
  const mine = { name: 'x' };
  return mine.name;
}

module.exports = { listen, boot, local, router };
