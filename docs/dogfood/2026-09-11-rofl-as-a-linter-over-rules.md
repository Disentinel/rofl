# ROFL as a linter over its own rule files

The owner's question, 2026-09-11, about `rules/js-effects.rofl` and
`rules/js-callgraph.rofl`: a model wrote them, they are two thirds comment and
carry a few hundred clauses each — is there anything to cut, and would it be
visible STRUCTURALLY if the rules themselves were asked, rather than a reader?

The answer was built rather than argued (CLAUDE.md, *model the task in ROFL
before arguing about it*): `scanners/rofl_lint.ts` turns every rule file in the
tree into facts about its clauses and its comment blocks, `rules/rofl-lint.rofl`
holds the criteria as rule bodies, `npm run rofllint` renders them, and
`test/rofl-lint.test.ts` measures the instrument with a mutant set. This note
records what the instrument found and what it cannot see.

## What it counts

Per clause: what it concludes, what it reads and in which book, an
alpha-normalised rendering of its body (variables renamed by first occurrence,
optionally relations too), and — the one computation with judgement in it —
which positive premises are implied by another premise through every arm of
that premise's definition. Per comment block: where it sits, whether a clause,
another block or the end of file follows it, whether it is a banner, how many
of its lines carry a date or the word MEASURED, which snake_case names it
quotes in backticks. Per file: the line census.

The criteria, each a rule and none an `[audit]` — every one is a CANDIDATE
list that is non-empty on an honest checkout by design:

| relation | what it says |
|---|---|
| `orphan_block` | a comment block followed by another comment block, not a banner, not the file header |
| `dangling_mention` / `dangling_bare` | a backticked name written as a literal (or a bare snake_case name) that no clause concludes, no `edb` declares, no `.ts` writes as `name(`, and no clause carries as an atom |
| `section_twice`, `title_twice`, `list_repeats` | numbering a rename left behind |
| `twin` | one alpha-normalised body under two different heads |
| `paired_arm` | one body under one head, differing only in a head constant |
| `shape_twin` | the same body shape with relations renamed too, three or more literals |
| `alias` | a single-arm rule whose whole content is one premise with the identical argument list |
| `implied` | a premise the rule could drop without changing its extension |
| `unread` / `unasserted_audit` | a relation concluded here that no rule reads and no `.ts` file names |

## What it found in the two files

Population first, so the two files have something to be compared against:
1 630 rule clauses and 1 648 comment blocks across the kernel, `rules/` and
`facts/`.

| | js-effects | js-callgraph |
|---|---|---|
| lines: code / comment / blank | 305 / 791 / 85 | 289 / 570 / 84 |
| comment share | 72 % | 66 % |
| clauses: rules / facts | 175 / 36 | 125 / 88 |
| comment lines per rule | 4 | 4 |
| orphan blocks | 0 | **12** |
| blocks of 30+ lines | 5 | 1 |
| blocks carrying a date | 4 | 15 |
| dangling names | 0 | **2** (`fn_binding`, `ts_non_null_expression`) |
| section number / title used twice | **6 twice; "WHERE THIS PACK CANNOT LOOK" twice** | 0 |
| a numbered list that repeats | **items 6 and 7** | 0 |
| twins | 0 | **`top_call` = `top_site`** |
| paired arms | 2 (`eff_here` read/write over `eff_update_arg`) | 0 |
| shape twins | 10, of which 4 are real templates | 1 (the twin again) |
| aliases | `eff_subject :- fn_node`, `eff_mod_subject :- corpus_file` | `performed_call :- awaited_then` |
| implied premises | 2 | 1 |
| unread relations | `eff_purer_callee` | `call_arg`, `call_line`, `frontier_named` |

Three of these are the answer to "is it visible structurally", because a
reader would have had to notice them and the instrument simply lists them:

**The twelve orphan blocks in js-callgraph are one ghost.** Section 4,
RESOLUTION, still carries the paragraphs for TIER 1, TIER 1b, TIER 2, TIER 3,
TIER 4, THE KEY, ENTRY 1, ENTRY 2, ENTRIES 3 AND 4, ENTRY 5 and THE ONE
RESOLUTION RULE — 75 comment lines — and the rules those paragraphs introduced
moved to `rules/js-dataflow.rofl` on 2026-09-04. The file even says so in one
of them ("went home 2026-09-04"). The prose stayed because a comment has no
reader that goes red. `orphan_block` is that reader: a paragraph followed by a
paragraph, in a file whose convention is a paragraph followed by its clause.
And `fn_binding`, cited at line 688 as the relation `passes_function` "used to
stand on", is defined nowhere in the tree — `dangling_bare` says so, and so
does `test/rule-shape.test.ts`, whose baseline still lists a cross product in a
rule that no longer exists.

**`top_call` and `top_site` are the same rule.** Same three premises, same
negation, same argument pattern, two names; `twin` is the one row in the file
under that relation. One is used by `calls`/`frontier_at`, the other by
`frontier_at` alone.

**The section numbering of js-effects was edited by hand and shows it.** A
banner reads `6.` twice with the old title left on the first line, the old
section 6 became 7 with its title retained, and the limitations list inside it
runs 1–8 and then 6, 7 again. None of that changes a derivation, all of it
misleads a reader, and the lexical check finds it in one query.

The rest are candidates a person weighs:

- `eff_subject(F) :- fn_node(F)` and `eff_mod_subject(F) :- corpus_file(F)` are
  pure renames. The file keeps them to name the SUBJECT of the Moore closure,
  which is a reason; the row makes the reason checkable.
- `eff_heap_of(M, local) :- member_node_v(M), eff_obj_traced(M)`: the first
  premise is implied by the second. Dropping it changes nothing the rule
  concludes and may change what it costs, because `planBody` keeps the written
  order — so the instrument reports and does not decide.
- `eff_over/eff_bounded/eff_bounded_low/effect_of` and their `eff_mod_*`
  copies, and `class_define_eff`/`class_construct_eff`, are the same template
  written out twice with one relation swapped. `shape_twin` finds all of them
  and also six rhymes among the three-literal lattice rules that are not
  duplicates at all; the weak claim is reported apart from the strong one for
  exactly that reason.
- `eff_purer_callee` was written "rather than left as a query in a comment"
  and is then read by nothing — not a rule, not a test. Same for `call_arg`,
  `call_line` and `frontier_named` in js-callgraph. Either a reader arrives or
  they are queries wearing a relation's name.

## What the comment share does and does not say

72 % comment by line, four comment lines per rule, five blocks over thirty
lines. The ratio is a fact and not a finding: the repository's own
`js-dataflow.rofl` is 67 % comment, because the house style puts the argument
beside the rule. What the instrument can say
about comments that a ratio cannot is WHICH blocks: the orphans (rules gone),
the dated and MEASURED lines (466 blocks in the tree carry a date — history
whose home is `facts/findings.rofl`), and the mentions of relations that no
longer exist. Cutting comments by ratio would remove the arguments; cutting by
these rows removes prose about a previous version of the program.

## Where the instrument cannot look

Stated in `test/rofl-lint.test.ts` beside the mutants and repeated here:

- a relation named in prose without backticks ("tier 2", "the resolution
  tiers") is invisible to both dangling relations;
- a `.ts` reader that builds the relation name at run time is invisible to
  `named_in_ts`, so `unread` over-reports in exactly that case — and for a
  "delete me" list that is the wrong direction, which is why it is a candidate
  and never a gate;
- `twin` is per file, `alias` demands the identical column order, `implied`
  looks one hop through the implying premise's own arms;
- a paragraph split by a truly blank line is two blocks and the first is an
  orphan by this criterion whether or not it introduces the second — the tier
  ghosts are found by exactly this property, so the two cannot be told apart
  lexically;
- `ts_non_null_expression` in js-callgraph is reported dangling and is a
  deliberate mention ("NOT `ts_non_null_expression`"): a name quoted to say it
  is wrong looks the same as one cited in error.

Measured while building, three of the instrument's own defects, each the
census inheriting the scope of its first incident (CLAUDE.md): the scanner read
its own output on the second run (181 803 clauses where the first saw 50 448)
because it lives in `facts/`; the head's variables were not counted when
deciding what a wildcard was, so a bound `File` read as droppable; and the
atom census took only a fact's first argument, which reported `not_modelled`
and `import_declaration` as relations nothing defines (228 rows, then 52).

## Afterwards, the same day

Both files were cut to the notes that explain a decision plus the list of
what the pack cannot see: js-effects 791 to 222 comment lines (72 % to 42 %),
js-callgraph 570 to 135 (66 % to 31 %). No rule text moved, so every golden
is unchanged and every mutant anchor still holds. The instrument re-run on the
result: orphan blocks 0 and 0, dangling names 0 and 1 (the deliberate
`ts_non_null_expression`), section and list numbering clean. What it still
reports is on the clause side and is left for a decision: `top_call` =
`top_site`, the two `*_subject` renames, the implied `member_node_v`, and the
four unread relations. `caught_here` was repaired at the source in the same
branch (`catches_via`), which is the one comment the owner asked to have
written out of the file rather than explained beside it.
