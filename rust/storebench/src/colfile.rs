//! A MAPPED COLUMNAR BASE — the design the sharing requirement asks for.
//!
//! The requirement (2026-09-08): N agents each need the base; a fork is a full
//! copy in RAM, so at Medium's 15.5–30.4 GB two agents already exceed a 32 GB
//! machine. The base must therefore be RESIDENT ON DISK AND MAPPED, shared by
//! the OS page cache across every process that maps it, with each agent
//! holding only its private delta.
//!
//! This is that base, in the smallest honest form: one file, memory-mapped
//! read-only, containing
//!
//!   * a group table — `(relation, perspective, arity, rows, offset)`;
//!   * the arguments, as `u32` columns, row-major within a group;
//!   * an open-addressed identity table, `hash(group, args) -> (group, row)`.
//!
//! EVERYTHING A PROBE TOUCHES IS IN THE MAPPING, including the index. That is
//! the load-bearing property and it is the one an LSM with a per-process block
//! cache does not have: a probe here allocates nothing, so a second process
//! costs the page cache nothing it has not already paid.
//!
//! It is not a candidate crate. It is the FLOOR for the sharing curve — what
//! the answer looks like if the mapping is total — and the crates are measured
//! against it.

use memmap2::Mmap;
use std::fs::File;
use std::io::Write;
use std::path::Path;

pub const EMPTY: u64 = u64::MAX;

fn hash(gi: u64, xs: &[u32]) -> u64 {
    let mut h = gi ^ 0xcbf29ce484222325;
    for x in xs {
        h ^= *x as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// header: [ngroups u64][args_off u64][ix_off u64][ix_len u64]
/// group i: [rel u32][persp u32][arity u32][rows u32][at u64]
pub fn write(path: &Path, facts: &[(u32, u32, Vec<u32>)]) -> std::io::Result<()> {
    let mut groups: std::collections::BTreeMap<(u32, u32, u32), Vec<u32>> = Default::default();
    for (r, p, a) in facts {
        groups
            .entry((*r, *p, a.len() as u32))
            .or_default()
            .extend_from_slice(a);
    }
    let ng = groups.len() as u64;
    let hdr = 32 + 24 * ng;
    let mut args: Vec<u8> = Vec::new();
    let mut gtab: Vec<u8> = Vec::new();
    let mut rows_of: Vec<(u32, u32, usize)> = Vec::new(); // gi -> (arity, rows, at/4)
    for (gi, ((rel, persp, arity), vals)) in groups.iter().enumerate() {
        let rows = if *arity == 0 {
            0
        } else {
            vals.len() as u32 / *arity
        };
        let at = args.len() as u64;
        gtab.extend_from_slice(&rel.to_le_bytes());
        gtab.extend_from_slice(&persp.to_le_bytes());
        gtab.extend_from_slice(&arity.to_le_bytes());
        gtab.extend_from_slice(&rows.to_le_bytes());
        // The offset is written in u32 UNITS, which is what `arg` indexes in.
        gtab.extend_from_slice(&(at / 4).to_le_bytes());
        for v in vals {
            args.extend_from_slice(&v.to_le_bytes());
        }
        rows_of.push((*arity, rows, (at / 4) as usize));
        let _ = gi;
    }
    // identity table at 2x load
    let n = facts.len().next_power_of_two() * 2;
    let mut ix = vec![EMPTY; n];
    for (gi, (arity, rows, at)) in rows_of.iter().enumerate() {
        for r in 0..*rows {
            let a = &args[(*at + r as usize * *arity as usize) * 4
                ..(*at + (r as usize + 1) * *arity as usize) * 4];
            let vals: Vec<u32> = a
                .chunks_exact(4)
                .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                .collect();
            let h = hash(gi as u64, &vals);
            let mut i = (h as usize) & (n - 1);
            while ix[i] != EMPTY {
                i = (i + 1) & (n - 1);
            }
            ix[i] = ((gi as u64) << 32) | r as u64;
        }
    }
    let args_off = hdr;
    let ix_off = args_off + args.len() as u64;
    let mut f = File::create(path)?;
    f.write_all(&ng.to_le_bytes())?;
    f.write_all(&args_off.to_le_bytes())?;
    f.write_all(&ix_off.to_le_bytes())?;
    f.write_all(&(n as u64).to_le_bytes())?;
    f.write_all(&gtab)?;
    f.write_all(&args)?;
    for v in &ix {
        f.write_all(&v.to_le_bytes())?;
    }
    f.flush()
}

pub struct Mapped {
    m: Mmap,
    ng: usize,
    args_off: usize,
    ix_off: usize,
    ix_len: usize,
}

impl Mapped {
    pub fn open(path: &Path) -> std::io::Result<Mapped> {
        let f = File::open(path)?;
        let m = unsafe { Mmap::map(&f)? };
        let g = |at: usize| -> u64 { u64::from_le_bytes(m[at..at + 8].try_into().unwrap()) };
        let ng = g(0) as usize;
        let args_off = g(8) as usize;
        let ix_off = g(16) as usize;
        let ix_len = g(24) as usize;
        Ok(Mapped {
            m,
            ng,
            args_off,
            ix_off,
            ix_len,
        })
    }
    fn grp(&self, gi: usize) -> (u32, u32, usize, usize, usize) {
        let at = 32 + 24 * gi;
        let u32at = |o: usize| u32::from_le_bytes(self.m[at + o..at + o + 4].try_into().unwrap());
        let rel = u32at(0);
        let persp = u32at(4);
        let arity = u32at(8) as usize;
        let rows = u32at(12) as usize;
        let off = u64::from_le_bytes(self.m[at + 16..at + 24].try_into().unwrap()) as usize;
        (rel, persp, arity, rows, off)
    }
    pub fn arg(&self, off: usize, i: usize) -> u32 {
        let at = self.args_off + (off + i) * 4;
        u32::from_le_bytes(self.m[at..at + 4].try_into().unwrap())
    }
    fn slot(&self, i: usize) -> u64 {
        let at = self.ix_off + i * 8;
        u64::from_le_bytes(self.m[at..at + 8].try_into().unwrap())
    }
    /// One point lookup, allocating nothing. `argMatches` with every argument
    /// bound is this, and it is 15% of this workload's calls.
    pub fn get(&self, rel: u32, persp: u32, args: &[u32]) -> bool {
        // The group table is written in `(rel, persp, arity)` order, so the
        // group is found by binary search INSIDE THE MAPPING — no private
        // side table, which is the whole point.
        let key = (rel, persp, args.len() as u32);
        let (mut lo, mut hi) = (0usize, self.ng);
        while lo < hi {
            let mid = (lo + hi) / 2;
            let (r, p, a, _, _) = self.grp(mid);
            if (r, p, a as u32) < key {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if lo < self.ng {
            let gi = lo;
            let (r, p, arity, _rows, off) = self.grp(gi);
            if (r, p, arity as u32) != key {
                return false;
            }
            let h = hash(gi as u64, args);
            let mut i = (h as usize) & (self.ix_len - 1);
            loop {
                let s = self.slot(i);
                if s == EMPTY {
                    return false;
                }
                if (s >> 32) as usize == gi {
                    let row = (s & 0xffff_ffff) as usize;
                    if (0..arity).all(|k| self.arg(off, row * arity + k) == args[k]) {
                        return true;
                    }
                }
                i = (i + 1) & (self.ix_len - 1);
            }
        }
        false
    }
    /// Touch every page of the mapping, which is what a probe workload will do
    /// eventually and what a cold-start measurement has to include.
    pub fn warm(&self) -> u64 {
        let mut s = 0u64;
        let mut i = 0;
        while i < self.m.len() {
            s += self.m[i] as u64;
            i += 4096;
        }
        s
    }
}
