# Instruments: can the thing you measured with tell the two answers apart?

Companion to `normalise.md`. That one is about the data; this one is about the
readings you take from it. Read it before you report a number, and before you
report that you checked.

## The failure this page exists for

An instrument answers the question it answers, which is often *next to* the
question you asked. It does not announce the difference. The reading looks
authoritative, you report it, and the mistake is now invisible — worse than a
wrong number, because a false claim of having measured survives review.

Seven instances, all from one project, all cheap to have avoided:

| I asked | I reached for | It actually reports |
| --- | --- | --- |
| which processes are mine | `ps` | command lines, identical across worktrees |
| did the tests pass | `cargo test \| grep ... && commit` | the exit code of `grep` |
| is the world under pressure | `peak_rows` | rows a join holds, ~0 on a pure index while the store held 5.9M facts |
| did this component get cheaper | a share-of-total table | shares, which move when the denominator moves |
| would a binary format help | timing the format | one phase of five; it was 0.3% of the run |
| how far has the gate got | `cmd \| tail -30` | nothing at all until the command exits |
| was the quadratic removed | the comment saying so | that someone believed it once |

The pattern is one thing: **the instrument was chosen because it was at hand,
and its answer was close enough in shape to be mistaken for the one wanted.**

## Three questions, before the reading counts

1. **What else would produce this same reading?** If a green result and a
   never-ran result look identical, you have not measured. If your processes and
   someone else's produce the same line, the tool cannot answer "mine".
2. **Can I make it say the other word?** An instrument that has never returned a
   negative has not been shown to be able to. Plant a failure and watch it fail.
   Where the check is a comparison between two derived sets, assert that at least
   one side is non-empty — an empty set equals an empty set and says nothing.
3. **Is the quantity it reports the quantity the decision is about?** A proxy is
   valid for the workload it was calibrated on and silent when it stops being.
   If the decision protects a resource, measure that resource.

A check that shares a premise with its subject fails all three at once: if it
reads the same possibly-wrong input, it cannot go red for the reason you care
about.

## Rules that pay for themselves

- **No silent exit.** At any boundary — a process, a port, a retry, a `catch` —
  every path that discards work must say so. A dropped message is not an edge
  case; it is a deadlock with the evidence deleted. Four one-line silent drops
  turned a two-character encoding bug into a hang that looked like slowness.
- **Never pipe a gate.** A pipeline's exit code is the last command's. Run it
  unpiped, read the code, and only then say what it said.
- **Report absolutes in pairs, not shares.** A percentage cannot tell you that
  the denominator moved. If you must give a share, give both numbers beside it.
- **A claim about direction is a claim about arithmetic, and arithmetic is
  cheap.** Do the two multiplications. This is the rule that catches a confident
  peer, which matters because a peer with a good track record is a *more*
  dangerous single instrument than one with a bad record — the prior does the
  work the check should have done.
- **Instrument every phase, not the suspected one.** Timing what you suspect
  confirms what you suspect. The phase that sounds expensive and the phase that
  is expensive are routinely different.
- **A comment asserting a fix is not evidence of the fix**, and it is worse than
  no comment: it stops the next reader from looking.
- **State the load beside every timing.** A number without the conditions it was
  taken under is not reproducible and cannot be compared to the next one.

## When you say you checked

Say what you ran and what it printed. "I verified" is a claim; the command is
the evidence. If the instrument cannot distinguish the two answers, the honest
report is that you did not check — which is a valid outcome, the same way
`no_progress` is.

Expect self-review to catch approximately none of this. Across two catalogued
passes over one project, re-reading my own work ranked last of five methods and
found nothing that the other four had not; an audit row, a second party with a
different instrument, a subagent testing a claim against its own commands, and
plain arithmetic found everything. The practical consequence is that review
effort belongs in **placing instruments, not in reading more carefully**.

The catalogue of process failures these come from is `docs/failure-modes.md`.
