export function start(state) {
  if (process.env.NODE_ENV !== 'production') dump(state);
  return serve(state);
}

function dump(state) {
  console.log(JSON.stringify(state));
}

function serve(state) {
  return { ok: true, state };
}
