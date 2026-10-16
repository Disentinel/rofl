import { Router } from 'express';

export const users = Router();

function list(req, res) { res.json([]); }
function getUser(req, res) { res.json({ id: req.params.id }); }
function removeUser(req, res) { res.status(204).end(); }

users.get('/', list);
users.get('/:id', getUser);
users.delete('/:id', removeUser);
