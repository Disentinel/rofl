---
world: agg-phrase-sugar
---

# the sugar, read and written

> The average, at most, exactly and every, written only as sentences and lowered by the reader onto count, sum and a comparison, the second aggregate of a pair taking its own names, what it takes or joins through when the pair alone writes it; the lowered rules, written in rofl, read back as the same sentences; a sum and a count over different bodies, a sum asked per key beside a count over all keys or the other way round, and two different counts compared, are no sugar and read back as what they are; every takes each row of its domain, and two counts that take what the sentence names alone, where the satisfies clause reads more of the domain, are no every; two averages of one rule may use the same letters; a conclusion may name a variable A, An or The, at its end, before a word or before a word and a capital; and `V is V` is read back as written (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_score"></a>A key K scores V
- <a id="pv_ballot"></a>A voter B votes for a candidate C
- <a id="pv_cand"></a>A candidate C stands
- <a id="pv_member"></a>A group G has a member M
- <a id="pv_voted"></a>A member M voted
- <a id="pv_need"></a>A candidate C needs N
- <a id="pv_rank"></a>A group G ranks a member M at R

<a id="psgs_avg"></a>The mean mark comes to M if M is the average of V over K such that (K scores V) rounded toward zero.

<a id="psgs_cents"></a>The mean mark comes to M cents if M is the average of V over K such that (K scores V) in hundredths rounded toward zero.

<a id="psgs_few"></a>A candidate C is thin if C stands and at most 1 of B such that (B votes for C).

<a id="psgs_two"></a>A candidate C has two if C stands and exactly 2 of B such that (B votes for C).

<a id="psgs_all"></a>A group G turned out if G has some member and every M such that (G has a member M) satisfies (M voted).

<a id="psgs_valid"></a>A candidate C sees a clean poll if C stands and every D such that (some voter votes for D) satisfies (D stands).

<a id="psgs_milli"></a>The mean mark comes to M mills if M is the average of V over K such that (K scores V) in thousandths rounded toward zero.

<a id="psgs_shift"></a>The shifted mark comes to M if M is the average of W over K such that (K scores V and W is V + 1) rounded toward zero.

<a id="psgs_needy"></a>A candidate C holds the needy voters if C stands and every B such that (B votes for D, and D needs N, and N > 1) satisfies (B votes for C).

<a id="psgs_own"></a>A key K has its own mark M if K scores some number and M is the average of V over K such that (K scores V) rounded toward zero.

<a id="psgs_each"></a>A member M of a group G turned out alone if G has a member M and every M such that (G has a member M) satisfies (M voted).

<a id="psgs_senior"></a>A group G is senior if G has some member and every M such that (G ranks M at R) satisfies (R > 2).

<a id="psgs_spread"></a>The spread comes to D if M is the average of V over K such that (K scores V) rounded toward zero and N is the average of V over K such that (K scores V) in tenths rounded toward zero and D is N - M.

<a id="psgs_plain"></a>The plain mark comes to A if A is the average of V over K such that (K scores V) rounded toward zero.

<a id="psgs_gmean"></a>The mean of a group G is A in whole units if G has some member and A is the average of R over M such that (G ranks M at R) rounded toward zero.

<a id="psgs_above"></a>A group G puts A above M if G ranks A at R and G ranks M at S and R > S.

<a id="psgs_first"></a>A group G seats An first if G ranks An at 5.

```datalog
psgr_avg(A) :- Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1)), Count0 > 0, A is Total0 / Count0.
psgr_cents(A) :- Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1)), Count0 > 0, Scaled0 is Total0 * 100, A is Scaled0 / Count0.
psgr_few(C) :- pv_cand(C), Count0 is count(B : pv_ballot(B, C)), Count0 <= 1.
psgr_two(C) :- pv_cand(C), Count0 is count(B : pv_ballot(B, C)), Count0 = 2.
psgr_all(G) :- pv_member(G, _), Domain0 is count(M : pv_member(G, M)), Holding0 is count(M1 : pv_member(G, M1), pv_voted(M1)), Domain0 = Holding0.
psgr_valid(C) :- pv_cand(C), Domain0 is count(D : pv_ballot(_, D)), Holding0 is count(D1 : pv_ballot(_, D1), pv_cand(D1)), Domain0 = Holding0.
psgr_ratio(A) :- Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1), V1 > 15), Count0 > 0, A is Total0 / Count0.
psgr_level(C) :- pv_cand(C), N1 is count(B : pv_ballot(B, C)), N2 is count(K : pv_need(C, K)), N1 = N2.
psgr_milli(A) :- Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1)), Count0 > 0, Scaled0 is Total0 * 1000, A is Scaled0 / Count0.
psgr_shift(A) :- Total0 is sum(W ; K : pv_score(K, V), W is V + 1), Count0 is count(W1, K1 : pv_score(K1, V1), W1 is V1 + 1), Count0 > 0, A is Total0 / Count0.
psgr_needy(C) :- pv_cand(C), Domain0 is count(B : pv_ballot(B, D), pv_need(D, N), N > 1), Holding0 is count(B1 : pv_ballot(B1, D1), pv_need(D1, N1), N1 > 1, pv_ballot(B1, C)), Domain0 = Holding0.
psgr_own(K, A) :- pv_score(K, _), Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K : pv_score(K, V1)), Count0 > 0, A is Total0 / Count0.
psgr_each(M, G) :- pv_member(G, M), Domain0 is count(M : pv_member(G, M)), Holding0 is count(M : pv_member(G, M), pv_voted(M)), Domain0 = Holding0.
psgr_skew(K, A) :- pv_score(K, _), Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1)), Count0 > 0, A is Total0 / Count0.
psgr_whole(K, A) :- pv_score(K, _), Total0 is sum(V ; K1 : pv_score(K1, V)), Count0 is count(V1, K : pv_score(K, V1)), Count0 > 0, A is Total0 / Count0.
psgr_senior(G) :- pv_member(G, _), Domain0 is count(M, R : pv_rank(G, M, R)), Holding0 is count(M1, R1 : pv_rank(G, M1, R1), R1 > 2), Domain0 = Holding0.
psgr_loose(G) :- pv_member(G, _), Domain0 is count(M : pv_rank(G, M, R)), Holding0 is count(M1 : pv_rank(G, M1, R1), R1 > 2), Domain0 = Holding0.
psgr_spread(D) :- Total0 is sum(V ; K : pv_score(K, V)), Count0 is count(V1, K1 : pv_score(K1, V1)), Count0 > 0, M is Total0 / Count0, Total1 is sum(W ; J : pv_score(J, W)), Count1 is count(W1, J1 : pv_score(J1, W1)), Count1 > 0, Scaled0 is Total1 * 10, N is Scaled0 / Count1, D is N - M.
psgr_same(K) :- pv_score(K, V), V = V.
```
