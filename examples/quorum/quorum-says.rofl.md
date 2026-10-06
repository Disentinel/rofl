---
world: quorum-says
---

# three quorums, in sentences

> The same three quorums as examples/quorum/quorum.rofl, written the way the
> question is asked and read into the same rules (docs/aggregates.md, "The
> sentence form, as built"). The data is quorum-data.rofl, loaded beside this
> file: its relations are the ones declared as facts here. Every rule below
> concludes a relation of its own, so that both can be held to one answer.

Declared as facts:

- <a id="vetted"></a>A node X is vetted
- <a id="claim"></a>A node X is a claim
- <a id="backs"></a>A node S backs a node X
- <a id="speaks_for"></a>A node S speaks for an origin O
- <a id="axiom"></a>A proposition P is an axiom
- <a id="step"></a>A step S concludes a proposition P
- <a id="needs_at"></a>A step S has at a place K the premise Q
- <a id="cluster"></a>A cluster C is running
- <a id="member"></a>A cluster C has the server S
- <a id="term"></a>A cluster C is in the term T
- <a id="entry"></a>A cluster C has the entry I from a term T
- <a id="match"></a>A cluster C has the server S that holds up to the index M
- <a id="reported"></a>A cluster C reports the entry J committed

## Belief

> Two believed nodes from two different origins back a claim. The origins are
> what is counted, so one forum with two accounts is one voice, and the
> belief of a node is read inside the rule that concludes the belief of
> another.

<a id="says_credited"></a>A node X is credited either:

1. if X is vetted;
2. if X is a claim and at least 2 of O such that (S backs X and S is credited and S speaks for O).

## Proof

> A step is established when a quorum as large as its premises is
> established, and how many premises it has is counted, not written. The
> places of the premises in a list, which the walk of examples/moot needs,
> are not used by anything below.

<a id="says_requires"></a>A step S requires a proposition Q if S has at some place the premise Q.

<a id="says_premises"></a>A step S has N premises if S concludes some proposition and exactly N of Q such that (S requires Q).

<a id="says_established"></a>A proposition P is established either:

1. if P is an axiom;
2. if S concludes P, S has N premises and at least N of Q such that (S requires Q and Q is established).

## Raft

> An entry is counted when the term that wrote it is the current one and a
> majority of the cluster holds it; a commit the logs do not support is an
> unsafe one.

<a id="says_size"></a>A cluster C has N servers if C is running and exactly N of S such that (C has the server S).

<a id="says_quorum"></a>A cluster C needs Q servers if C has N servers and Q is N / 2 + 1.

<a id="says_holds"></a>A server S holds the entry I of a cluster C if C has the server S that holds up to the index M, C has the entry I from some term and I <= M.

<a id="says_majority"></a>An entry I of a cluster C is on a majority if C has the entry I from some term, C needs Q servers and at least Q of S such that (S holds the entry I of C).

<a id="says_counted"></a>An entry I of a cluster C is counted if C has the entry I from a term T, C is in the term T and I of C is on a majority.

<a id="says_committed"></a>An entry I of a cluster C is committed if C has the entry I from some term, J of C is counted and I <= J.

<a id="says_unsafe"></a>A cluster C has an unsafe commit of J either:

1. if C reports the entry J committed, unless J of C is on a majority;
2. if C reports the entry J committed and J of C is on a majority, unless J of C is committed.
