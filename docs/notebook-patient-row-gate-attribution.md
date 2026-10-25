# Notebook patient-row gate: reading the attribution log

The schema-only Notebook gate refuses output that looks like individual patient rows before it can
reach a model. A beta.15 report showed a complex aggregate being refused, but no record of the
decision existed, so there was nothing to diagnose. The gate now writes one content-free log record
for every refusal.

## What is logged

Scope: `notebook:patient-row-gate`. One `info` record per refused output, in `main.log` (the normal
JSONL main-process log; nothing here opens a new file or leaves the machine).

| Field                | Meaning                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `block`              | `record-series`, `per-row-dicts`, `single-patient-fields`, `non-aggregate-table` |
| `textLength`         | Character count of the refused output                                       |
| `digest`             | First 12 hex characters of SHA-256 over the output text                     |
| `tables`             | Number of tables the parser found                                           |
| `tableShapes`        | Up to 20 entries of `{ rows, columns, statHeaders, groupKeys, describe }`   |
| `describeTables`     | How many parsed tables matched the describe() shape                         |
| `frameFooter`        | Whether a `[N rows x M columns]` / `Name: …, dtype:` footer was present     |
| `frequencySeries`    | Set on the `record-series` branch when the series looked like frequencies   |

`statHeaders` counts header cells the gate treats as statistics; `groupKeys` is the remaining header
count. Neither value names a column. No field carries output text, cell values, or variable names:
the record deliberately holds only counts, booleans, a length, and a truncated digest.

## Reproducing the beta refusal

1. In the Notebook, run the aggregate that was refused. Keep the output in the same session.
2. Open the main log: **Settings → Logs** opens the directory, or use the path shown there
   (`main.log` under the app log directory).
3. Search for `notebook:patient-row-gate`. The matching record is the refusal, and its `block` plus
   `tableShapes` say why.
4. Report the record as-is. It is safe to paste: it holds no patient content. Add how the table was
   produced (`groupby` keys, aggregation columns, row count) so the shape can be compared.

## What this does not do

The heuristics are unchanged and the refusal message is unchanged. This ticket only makes the
existing decision observable; tuning the gate needs a real refused output, and the `tableShapes`
entry is the substitute that can be shared.
