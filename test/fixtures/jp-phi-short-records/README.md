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

| Group                        | Records | Gold                                  | Expectation                                                                                                        |
| ---------------------------- | ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `name-*`                     | 14      | `is_phi: true`, `PERSON_NAME`         | must be found; today overlap 1.0 and exact 1.0                                                                     |
| `var-*`, `label-*`, `term-*` | 19      | `is_phi: false`                       | must not be flagged; today none are                                                                                |
| `mixed-*`                    | 3       | `is_phi: true` (date / karte / phone) | the row keeps its field name while its own span is redacted; today all 3 are detected and redacted                 |
| `insurer-*`                  | 3       | `is_phi: true`, `INSURER_NO`          | the labelled forms a sentence and a table use: 保険者番号：/ 保険者番号は / 保険者番号 \| all keep hitting         |
| `tool-*`                     | 6       | `is_phi: false`                       | machine payloads — artifact metadata, a UUID tail, a hex hash, a PMID list, an id and an account number — released |
| `known-*`                    | 8       | `is_phi: false`                       | pinned residual false positives and category gaps; the set may shrink, never grow                                  |
| `known-long-name-unmasked`   | 1       | `is_phi: true`, `PERSON_NAME`         | a pinned **miss**, not a false positive: past 80 characters the guess does not run                                 |

The `name-with-*` records are the ones the old whole-string guess dropped: it only fired when the text
carried no other span at all, so `山田太郎 65歳` and `山田太郎 2026-10-01` lost the name entirely. Their
gold carries both the `PERSON_NAME` span and the `DATE` span of the same record. `name-with-age-newline`
is the same defect one line down — the name sits alone on its line, which must not read as a heading.

The `tool-*` records come from the beta.20 notebook block: `write_artifact_file` returns a JSON object
whose `version_id` is a UUID, and the unlabeled law-code rule read its last eight digits
(`02852897`, offset 120) as an insurer number. Five sends were refused before the sixth failed, so
`tool-artifact-metadata.txt` is the 282-character result verbatim. It is longer than 80 characters on
purpose: that rule is not bounded by the short-record window.

The numbers above are the **current** measurements, and `dev-eval.test.ts` pins them. The `flagged`
set is pinned exactly, so a record entering or leaving fails either way, and a must-clean record can
never re-enter: the #95 baseline is that group's hard ceiling. Every record that leaves it maps to one
reviewed entry in `src/main/phi/ordinary-label.ts` or to a tightened boundary in `detect.ts`.

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
of described in a comment, and it is owned by issue #103, the ticket that extends or removes that window.

`known-hex-leading-zero` (`"hash": "abcdef0123456789"`) is flagged by a **different** rule: the phone
pattern `(?<!\d)0\d{9,10}` reads the ten-digit run `0123456789` as a phone number. It is the same
"right boundary only rejects digits" family as the insurer bug fixed here, and it belongs to **issue
#97** (the phone rule's boundaries), so that one ticket changes one failure mode. The record stays in
this set on purpose: it is that ticket's red case, and the moment #97 lands it drops out of `flagged`
by itself. Removing it would make the fixture report a false positive rate that omits a false
positive that exists today.

The `flagged` set is therefore `known-hex-leading-zero` + `known-levofloxacin` today.

`insurer-bare` (症例は 02123456 の通り) and `insurer-branch` (02123456-1) were downgraded from PHI to decoys
when the unlabeled eight-digit law-code rule was removed (issue #105). An eight-digit run inside text is
no longer an insurer number: it read PMIDs, UUID segments and record ids. What still counts is a
labelled number and a whole-string number, and the fixture pins both.

`known-insurance-card-unmasked` (保険証 02123456) is the third kind of known entry: a **category gap**,
not a miss and not a false positive. 保険証 with a number is not classified today, and it may be a
ten-digit 被保険者番号 rather than an 保険者番号; folding the two into one category just to make this
record green would be the wrong fix. It is owned by the 保険証 / 被保険者番号 ticket.

One shape stays open on purpose, inherited from the same window: a record longer than 80 characters is
never guessed at, only the labelled rules run there.

**Fifty-six files, fifty-three scored records.** The directory holds 56 `.txt` files;
`shortRecords.records` reports 53 because `scoreFixture` only scores records inside the
80-character window, and `known-long-name-unmasked.txt` (84), `tool-artifact-metadata.txt` (282) and
`tool-pubmed-description.txt` (9245) are deliberately outside it. All three still run through
`detectPhi` in the aggregate numbers; none is part of the short-record block. Subtract those three
before comparing the two numbers, not after.

## Running it

```
node node_modules/vitest/vitest.mjs run src/main/phi/dev-eval.test.ts
```

The test prints the `shortRecords` block to stderr. `records: 0` on a fixture means the fixture cannot
see the branch at all — never read that as "no false positives".
