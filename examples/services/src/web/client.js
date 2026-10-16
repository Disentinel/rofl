import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:3000' });

export async function ping() {
  return fetch('/health');
}

export async function loadUser(id) {
  const res = await fetch(`/users/${id}`);
  return res.json();
}

export async function order(item) {
  return fetch('http://localhost:3000/orders?src=web', { method: 'POST', body: JSON.stringify(item) });
}

export async function drop(id) {
  return axios.delete(`/users/${id}`);
}

export async function listUsers(base) {
  return fetch(`${base}/users`);
}

export async function everyone() {
  return api.get('/users/');
}

export async function lost() {
  return fetch('/nowhere');
}

export async function blind(url) {
  return fetch(url);
}
