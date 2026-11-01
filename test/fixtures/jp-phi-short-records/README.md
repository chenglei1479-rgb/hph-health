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

| Group | Records | Gold | Expectation |
| --- | --- | --- | --- |
| `name-*` | 10 | `is_phi: true`, `PERSON_NAME` | must be found, span-exact |
| `var-*`, `label-*`, `term-*` | 19 | `is_phi: false` | must not be flagged (`mustCleanRate === 0`) |
| `mixed-*` | 3 | `is_phi: true` (date / karte / phone) | the row's own span is redacted, the label survives |
| `known-*` | 6 | `is_phi: false` | still flagged today; the set may shrink, never grow |

Each `records_gold.jsonl` line carries a `note` explaining why that row is a name, a label, or a known
limitation. Read the note before changing a row.

## Known limitations (explicit, not "expected false positives")

`known-lung-cancer` (肺癌), `known-internal-medicine` (内科), `known-male` (男性),
`known-levofloxacin` (レボフロキサシン), `known-survival-rate` (生存率), `known-chemotherapy` (化学療法).

These are two-to-four kanji terms whose shape cannot be told apart from a two-kanji surname such as
田中. Only the reviewed vocabulary in `src/main/phi/ordinary-label.ts` can clear them; a shape rule
must not pretend to.

## Running it

```
node node_modules/vitest/vitest.mjs run src/main/phi/dev-eval.test.ts
```

The test prints the `shortRecords` block to stderr. `records: 0` on a fixture means the fixture cannot
see the branch at all — never read that as "no false positives".
