// gates-rs: the fixture of the world gates_rust (models/engine/gates.rofl). Each ordering by a number is a gate.
const TAG: u32 = 1 << 31;
const LOUD: u64 = 50_000_000;
const SHARE: u64 = 4;

pub struct Cost { loud: u64, read: u64, total: u64 }

pub fn new() -> Cost { Cost { loud: LOUD, read: 0, total: 0 } }

pub fn shared(id: u32) -> bool { id >= TAG }

pub fn too_hot(c: &Cost) -> bool { c.read >= c.loud && c.read * SHARE >= c.total }

pub fn shown(n: usize) -> usize { if n > 12 { 12 } else { n } }

pub fn equal(n: usize) -> bool { n == 7 }
