# Offline schema-notebook Python

The schema-only Notebook runs patient tables locally. Its interpreter and the
statistical packages must already be inside the installer. The app looks for
that prefix first and does not download Python, wheels, or a conda environment
on first run.

This pull request does not commit the prefix. The unsigned beta workflow
downloads a stripped CPython 3.12 and the wheels for one architecture. That
adds roughly **120–200 MB** to each installer (about 110 MB compressed before
the dmg or NSIS packer). Package only the target being built.

## Layout

Stage one prefix per target. Paths are relative to the repository root before
packaging, and to `process.resourcesPath/schema-notebook-python` in the
installed app.

| Target        | Interpreter               |
| ------------- | ------------------------- |
| Windows x64   | `win-x64/python.exe`      |
| Windows arm64 | `win-arm64/python.exe`    |
| macOS arm64   | `darwin-arm64/bin/python` |
| macOS x64     | `darwin-x64/bin/python`   |
| Linux x64     | `linux-x64/bin/python`    |
| Linux arm64   | `linux-arm64/bin/python`  |

The lookup is `resolveSchemaNotebookPython` in
`src/main/notebook/schema-only/bundled-python.ts`. It never calls micromamba,
the runtime CDN, or pip.

## Build the prefix

Use the Python version you intend to ship (3.12). Install from `requirements.txt`
with no network at app runtime; the network is only for this staging step.

```bash
python3.12 -m venv "resources/schema-notebook-python/linux-x64"
"resources/schema-notebook-python/linux-x64/bin/python" -m pip install --upgrade pip
"resources/schema-notebook-python/linux-x64/bin/python" -m pip install -r resources/schema-notebook-python/requirements.txt
"resources/schema-notebook-python/linux-x64/bin/python" -c "import pandas, numpy, scipy, statsmodels, matplotlib, openpyxl, lifelines"
```

On Windows, `python.exe` must sit at the root of `win-x64`, which is the venv
layout. Do not commit the prefix.

## Unsigned internal beta

`.github/workflows/prerelease.yml` (Unsigned internal beta) stages one prefix
per matrix leg, after the electron-vite build and before packaging:

- macOS arm64 → `darwin-arm64`
- macOS x64 → `darwin-x64` (the arm64 GitHub runner launches it with `arch -x86_64`)
- Windows x64 → `win-x64`

`scripts/stage-schema-notebook-python.mjs` downloads the pinned
python-build-standalone CPython 3.12 `install_only_stripped` archive, checks
its SHA256, and `pip install --only-binary=:all:` from `requirements.txt`.
Each job stages only its own architecture.

`build/prerelease-electron-builder.cjs` then copies that directory with
`extraResources` to `schema-notebook-python` and excludes it from `app.asar`.
A `from` path that does not exist fails the packaging build, so the stage step
is required. Signed pilot workflows keep `electron-builder.yml` and do not
package this prefix.

The macOS jobs keep `NODE_OPTIONS=--max-old-space-size=6144`. `macos-latest`
has 7 GB of RAM; an 8 GB Node heap does not fit beside the OS. The prefix stays
on disk while electron-builder copies it.

Current wheels plus the stripped CPython archive are about 110 MB compressed
per architecture (about 85–95 MB of wheels and about 22–25 MB of CPython).
Installed into the prefix that is closer to 200 MB, and the dmg or NSIS
installer grows by roughly 120–200 MB for that one architecture. Do not also
leave the prefix in the asar file list. Do not commit the staged tree.
