function dead() {
  let x = 1;
  x = 2;
  return x;
}
function alive() {
  let y = 1;
  y = y + 1;
  return y;
}
function conditional(c) {
  let z = 1;
  if (c) z = 2;
  z = 3;
  return z;
}
function captured() {
  let w = 1;
  const f = () => w;
  w = 2;
  return f;
}
