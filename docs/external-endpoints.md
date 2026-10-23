# External endpoints

Catalog of outbound hosts this application may contact. These hosts are registered in the unified outbound endpoint allowlist. Scraped catalogues also send the User-Agent `DRA/<version> (+support@dra-hph.com)`. The contact address is the company address support@dra-hph.com.

JENGER (`jenger.riken.jp`) was checked on 2026-10-15: TCP port 443 accepted a connection but the TLS handshake timed out, and TCP port 80 accepted a connection but returned no bytes. The catalogue request stays on `http://jenger.riken.jp/en/result` until HTTPS serves a response.

## Runtime, package, and marketplace downloads

These downloads are separate from model requests. The app sends no telemetry and auto-update stays off.

| Destination | Purpose | When | Size | Optional | Code |
| --- | --- | --- | --- | --- | --- |
| `statics.aipoch.com` (AWS S3 + CloudFront, us-east-1) | Windows Notebook runtime Node and PowerShell archives; official Skill/Specialist marketplace metadata and artifacts; Python/R language packs when the build configures a runtime CDN | First protected-mode Notebook use, opening a marketplace, or the first managed Python/R environment | Node ~33 MB; PowerShell ~101 MB; an R pack is ~345 MB | Runtime packs are required only for a managed environment; marketplace browsing is optional. A build with no configured CDN makes no request and shows a localized notice. | `src/main/notebook/windows-runtime-catalog.json`, `build/native-components.json`, `src/main/skill-marketplace/source.ts`, `src/main/specialist/marketplace/official-source.ts` |
| `conda.anaconda.org` | conda-forge and bioconda package indexes and archives | Creating or repairing a managed Python/R environment and installing packages | Varies by package | Required for an online environment; a local bundle avoids it | `packages/environment/src/package-manager.ts` |
| `pypi.org` | Python package index and archives | A user installs a Python package with pip | Varies by package | Optional | `packages/environment/src/package-manager.ts` |
| `cloud.r-project.org` | CRAN mirror for R `install.packages()` | A user installs an R package | Varies by package | Optional | `packages/environment/src/package-manager.ts` |
| `mirrors.tuna.tsinghua.edu.cn`, `mirrors.ustc.edu.cn`, `mirrors.aliyun.com` | Mainland conda/PyPI/CRAN mirrors | Only when the app language is zh-Hans, during automatic mirror selection (HEAD probes, then the chosen download) | Probes are header-only | Optional. ja, en, and every non-zh-Hans locale never probe these hosts and stay on the public indexes. | `src/shared/mirror.ts`, `src/main/notebook/mirror-probe.ts` |
| `registry.npmjs.org`, `registry.npmmirror.com` | Managed CLI installation packages | Installing or repairing a managed CLI | Varies by package | Optional; the second registry is a fallback | `src/main/settings/managed-claude.ts` |
| `github.com`, `api.github.com`, `raw.githubusercontent.com` | Official Skill/Specialist marketplace fallback metadata and release assets | Opening a marketplace when the static source is unavailable | Varies | Optional; official marketplaces are on by default in this beta (Leo, 2026-10-17) | `src/main/skill-marketplace/source.ts`, `src/main/specialist/marketplace/official-source.ts` |

The managed CLI registry fallback is noted for APPI Article 28 review; removing it is a separate change. Official Skill and Specialist marketplaces can be disabled with `OPEN_SCIENCE_SKILL_MARKETPLACE_DISABLED=1` and `OPEN_SCIENCE_SPECIALIST_MARKETPLACE_DISABLED=1`; installed content keeps working.

## Patient tables and the model

Synthetic sample rows are generated only from the column name, the column type, and the row index (`src/main/notebook/schema-only/synthetic-sample.ts`). The generator does not read cell values and does not derive samples from real rows. The same name, type, and row index always produce the same placeholder.

By default, a patient table contributes only the following to the model:

- column names and column types
- the row count
- synthetic sample rows built from those names, types, and row indexes

Identifier columns are dropped before that context is built. Real categorical values are not sent unless the doctor opts in for that column. Free-text columns cannot be opted in. A categorical column with more than 12 distinct values can still be opted in: at most 12 distinct values (the most frequent) are sent, followed by `他 N 種類は省略` (N is the number of omitted values). Opted-in values pass the PHI gate before they are sent. Notebook execution output (stdout, error text, head, and result tables) reaches the model only after that gate. Output that contains individual patient rows — `.head()` / `.tail()` / `.sample()` tables, per-row prints, single-patient values, and filtered single-patient views — is replaced with a Japanese refusal. Aggregate summaries may pass, and aggregate count cells under 10 are shown to the model as `<10>`. The local Notebook still shows the real output.

| Host | What is sent | Recipient | Country | Purpose |
| --- | --- | --- | --- | --- |
| `cir.nii.ac.jp` | IP address; query terms; optional NII appid | National Institute of Informatics (NII), CiNii Research | Japan | Search public CiNii article, project, and dataset metadata when an optional NII appid is saved. |
| `api.jstage.jst.go.jp` | IP address; query terms | Japan Science and Technology Agency (JST), J-STAGE | Japan | Search public J-STAGE article metadata through the official JST API. |
| `pheweb.jp` | IP address; query terms | BioBank Japan PheWeb | Japan | Query public BioBank Japan GWAS summary statistics through the official API and the public download catalogue. Individual-level data is not requested. |
| `humandbs.dbcls.jp` | IP address; query terms | NBDC Human Database, Database Center for Life Science (DBCLS) | Japan | Read the public NBDC hum0014 catalogue and allow only datasets marked 制限なし / unrestricted. |
| `jenger.riken.jp` | IP address; query terms | RIKEN, JENGER | Japan | Read the public JENGER result catalogue and official download links. |
| `pdc.cancer.gov` | IP address; query terms | National Cancer Institute Proteomic Data Commons | United States | Discover public PDC study, biospecimen, and file metadata. Study files are not downloaded by these tools. |

## Complete model-bound inventory

See [Model-bound content and PHI release](model-bound-phi-audit.md) for the path audit, default content limits, independent-process restrictions, home-wording differences and jRCT/UMIN personal-column conclusion.
