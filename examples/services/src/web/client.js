import axios from 'axios';

const api = axios.create({ baseURL: 'https://api.shop.example/v1' });

export async function ping() {
  return fetch('https://api.shop.example/v1/health');
}

export async function loadUser(id) {
  const res = await fetch(`https://api.shop.example/v1/users/${id}`);
  return res.json();
}

export async function order(item) {
  return fetch('http://api.internal:3000/orders?src=web', { method: 'POST', body: JSON.stringify(item) });
}

export async function drop(id) {
  return axios.delete(`https://api.shop.example/v1/users/${id}`);
}

export async function listUsers(base) {
  return fetch(`${base}/users`);
}

export async function everyone() {
  return api.get('/users/');
}

export async function lost() {
  return fetch('https://api.shop.example/v1/nowhere');
}

export async function blind(url) {
  return fetch(url);
}

export async function pay(item) {
  return fetch('https://payments.example.com/orders', { method: 'POST', body: JSON.stringify(item) });
}

export async function edge() {
  return fetch('https://edge.internal/v1/health');
}

export async function metrics() {
  return fetch('http://localhost:9100/metrics');
}
