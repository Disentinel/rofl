class Registry {
  constructor(owner) {
    this.owner = owner;
    this.byName = new Map();
  }
  add(name, port) { this.byName.set(name, port); }
}
module.exports = { Registry };
