# Short-record PHI fixture

Supplement to `../jp-phi-testset`, not a replacement.

`jp-phi-testset` cannot see one branch of `detectPhi`: the whole-string name guess only fires on a
record of at most 80 characters, and every one of its 694 decoys and all 105 `PERSON_NAME` gold spans
sit in records of 246+ characters. Recall and false-positive numbers from that set therefore say
nothing about this branch — the `shortRecords` block in `scoreFixture` exists to report on it
separately.

## What is in here

Every record is one line of a synthetic variable dictionary or a reviewed label shape. No patient
data: all names and values are invented.

| Group                        | Records | Gold                                  | Expectation                                                                                        |
| ---------------------------- | ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `name-*`                     | 14      | `is_phi: true`, `PERSON_NAME`         | must be found; today overlap 1.0 and exact 1.0                                                     |
| `var-*`, `label-*`, `term-*` | 19      | `is_phi: false`                       | must not be flagged; today none are                                                                |
| `mixed-*`                    | 3       | `is_phi: true` (date / karte / phone) | the row keeps its field name while its own span is redacted; today all 3 are detected and redacted |
| `known-*`                    | 6       | `is_phi: false`                       | five are cleared by the reviewed vocabulary; `レボフロキサシン` is still flagged                   |
| `known-long-name-unmasked`   | 1       | `is_phi: true`, `PERSON_NAME`         | a pinned **miss**, not a false positive: past 80 characters the guess does not run                 |

The `name-with-*` records are the ones the old whole-string guess dropped: it only fired when the text
carried no other span at all, so `山田太郎 65歳` and `山田太郎 2026-10-01` lost the name entirely. Their
gold carries both the `PERSON_NAME` span and the `DATE` span of the same record. `name-with-age-newline`
is the same defect one line down — the name sits alone on its line, which must not read as a heading.

The numbers above are the **current** measurements, and `dev-eval.test.ts` pins them. The `flagged`
set may only ever shrink: the test keeps the #95 baseline as a hard ceiling, and every record that
leaves it maps to one reviewed entry in `src/main/phi/ordinary-label.ts`.

Each `records_gold.jsonl` line carries a `note` explaining why that row is a name, a label, or a known
limitation. Read the note before changing a row.

`entities.jsonl` is empty on purpose but must exist: `scoreFixture` loads it (`src/main/phi/score.ts`
around line 286) for the entity-level checks that only the main fixture exercises.

## Known limitations (explicit, not "expected false positives")

`known-lung-cancer` (肺癌), `known-internal-medicine` (内科), `known-male` (男性),
`known-survival-rate` (生存率) and `known-chemotherapy` (化学療法) are cleared by the reviewed
vocabulary. `known-levofloxacin` (レボフロキサシン) is not: a katakana drug name and a katakana personal
name have the same shape, so it stays masked until someone adds it to that list with a reason. A new
drug name is masked until it is reviewed — that is the intended direction.

`known-long-name-unmasked` is the other direction: a **miss**. The unlabeled-name guess stops at 80
characters, so a longer note keeps the name. It is pinned so the gap is measured by the test set instead
of described in a comment, and it is owned by the ticket that extends or removes that window.

One shape stays open on purpose, inherited from the same window: a record longer than 80 characters is
never guessed at, only the labelled rules run there.

## Running it

```
node node_modules/vitest/vitest.mjs run src/main/phi/dev-eval.test.ts
```

The test prints the `shortRecords` block to stderr. `records: 0` on a fixture means the fixture cannot
see the branch at all — never read that as "no false positives".
