import express from 'express';
import { users } from './users.js';

const app = express();

function logger(req, res, next) { next(); }
function health(req, res) { res.send('ok'); }
function createOrder(req, res) { res.status(201).end(); }
function admin(req, res) { res.end(); }

app.use(logger);
app.get('/health', health);
app.post('/orders', createOrder);
app.get('/admin', admin);
app.use('/users', users);

app.listen(3000);
