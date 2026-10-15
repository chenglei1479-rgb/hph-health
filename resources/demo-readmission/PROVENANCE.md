# demo-readmission

## Search before this folder existed

- `git log --all -- '*readmission*' '*demo-readmission*'` on this clone returned no commits.
- `git ls-tree -r --name-only` for every remote branch returned no path matching `readmission` or `demo-read`.
- The sentence about a 240-case readmission dataset is only in `build/prerelease-release-notes.md`. It was added in commit `1e5559cecf699f9ea944bf237db007c7d8821069` ("Add an unsigned internal beta build and offline experience mode."). `git show --stat` for that commit lists release notes and prerelease wiring, and no csv, script, or seed.
- No generator and no source table were in the repository. There is no file here that could show derivation from real records, because no records were stored.

## This folder

`scripts/demo-readmission/generate.mjs` writes these files. It builds 240 rows with mulberry32 seed `0xd4ba9a11`. Every row has `provenance=SYNTHETIC` and an id `SYNTH-####`. Columns are `record_id`, `provenance`, `age_band`, `sex`, `los_days`, and `readmitted_30d`. There are no names, birth dates, chart numbers, or addresses. Sample-abstract counts are computed from those rows in the same script. The script does not use the network or a model.
