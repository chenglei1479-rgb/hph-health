# External endpoints

Catalog of outbound connector hosts this application may contact. These hosts are registered in the unified outbound endpoint allowlist. Scraped catalogues also send the User-Agent `DRA/<version> (+support@dra-hph.com)`. The contact address is the company address support@dra-hph.com.

JENGER (`jenger.riken.jp`) was checked on 2026-10-15: TCP port 443 accepted a connection but the TLS handshake timed out, and TCP port 80 accepted a connection but returned no bytes. The catalogue request stays on `http://jenger.riken.jp/en/result` until HTTPS serves a response.

## Patient tables and the model

Synthetic sample rows are generated only from the column name, the column type, and the row index (`src/main/notebook/schema-only/synthetic-sample.ts`). The generator does not read cell values and does not derive samples from real rows. The same name, type, and row index always produce the same placeholder.

By default, a patient table contributes only the following to the model:

- column names and column types
- the row count
- synthetic sample rows built from those names, types, and row indexes

Identifier columns are dropped before that context is built. Real categorical values are not sent unless the doctor opts in for that column. Free-text columns cannot be opted in. A categorical column with more than 12 distinct values can still be opted in: at most 12 distinct values (the most frequent) are sent, followed by `他 N 種類は省略` (N is the number of omitted values). Opted-in values pass the PHI gate before they are sent. Notebook execution output (stdout, error text, head, and result tables) reaches the model only after that gate. Output that contains individual patient rows — `.head()` / `.tail()` / `.sample()` tables, per-row prints, single-patient values, and filtered single-patient views — is replaced with a Japanese refusal. Aggregate summaries may pass, and aggregate count cells under 10 are shown to the model as `<10>`. The local Notebook still shows the real output.

| Host                   | What is sent                                | Recipient                                                     | Country       | Purpose                                                                                                                                                |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cir.nii.ac.jp`        | IP address; query terms; optional NII appid | National Institute of Informatics (NII), CiNii Research       | Japan         | Search public CiNii article, project, and dataset metadata when an optional NII appid is saved.                                                        |
| `api.jstage.jst.go.jp` | IP address; query terms                     | Japan Science and Technology Agency (JST), J-STAGE            | Japan         | Search public J-STAGE article metadata through the official JST API.                                                                                   |
| `pheweb.jp`            | IP address; query terms                     | BioBank Japan PheWeb                                          | Japan         | Query public BioBank Japan GWAS summary statistics through the official API and the public download catalogue. Individual-level data is not requested. |
| `humandbs.dbcls.jp`    | IP address; query terms                     | NBDC Human Database, Database Center for Life Science (DBCLS) | Japan         | Read the public NBDC hum0014 catalogue and allow only datasets marked 制限なし / unrestricted.                                                         |
| `jenger.riken.jp`      | IP address; query terms                     | RIKEN, JENGER                                                 | Japan         | Read the public JENGER result catalogue and official download links.                                                                                   |
| `pdc.cancer.gov`       | IP address; query terms                     | National Cancer Institute Proteomic Data Commons              | United States | Discover public PDC study, biospecimen, and file metadata. Study files are not downloaded by these tools.                                              |

## Complete model-bound inventory

See [Model-bound content and PHI release](model-bound-phi-audit.md) for the path audit, default content limits, independent-process restrictions, home-wording differences and jRCT/UMIN personal-column conclusion.
