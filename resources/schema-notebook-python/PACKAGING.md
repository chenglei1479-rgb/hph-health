# Offline schema-notebook Python

The schema-only Notebook runs patient tables locally. Its interpreter and the
statistical packages must already be inside the installer. The app looks for
that prefix first and does not download Python, wheels, or a conda environment
on first run.

This pull request does not commit the prefix. A CPython 3.12 install plus
pandas, numpy, scipy, statsmodels, matplotlib, openpyxl, and lifelines is about
**450–800 MB unpacked per operating system and CPU architecture** (numpy, scipy,
and matplotlib are most of that). Putting win-x64, macOS arm64, and macOS x64
into one installer adds roughly **1.5–2.5 GB**. Package only the target being
built.

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

## electron-builder

Add this only in the release job that has staged the prefix. A `from` path that
does not exist fails the packaging build. Keep the tree **out of app.asar**
(a binary cannot be spawned from inside the archive). Add a `files` exclusion
and one `extraResources` entry for the platform being built:

```yaml
files:
  - '!resources/schema-notebook-python{,/**/*}'

extraResources:
  - from: resources/schema-notebook-python
    to: schema-notebook-python
```

That copy lands at `process.resourcesPath/schema-notebook-python`. Installer
size grows by the compressed size of that one prefix, typically a few hundred
megabytes on top of the current DRA installer. Do not also leave the prefix in
the asar file list.
