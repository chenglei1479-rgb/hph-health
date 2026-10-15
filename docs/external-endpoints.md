# External endpoints

Catalog of outbound connector hosts this application may contact. These hosts are registered in the unified outbound endpoint allowlist. Scraped catalogues also send the User-Agent `DRA/<version> (+support@dra-hph.com)`. The contact address is the company address support@dra-hph.com.

JENGER (`jenger.riken.jp`) was checked on 2026-10-15: TCP port 443 accepted a connection but the TLS handshake timed out, and TCP port 80 accepted a connection but returned no bytes. The catalogue request stays on `http://jenger.riken.jp/en/result` until HTTPS serves a response.

| Host | What is sent | Recipient | Country | Purpose |
| --- | --- | --- | --- | --- |
| `cir.nii.ac.jp` | IP address; query terms; optional NII appid | National Institute of Informatics (NII), CiNii Research | Japan | Search public CiNii article, project, and dataset metadata when an optional NII appid is saved. |
| `api.jstage.jst.go.jp` | IP address; query terms | Japan Science and Technology Agency (JST), J-STAGE | Japan | Search public J-STAGE article metadata through the official JST API. |
| `pheweb.jp` | IP address; query terms | BioBank Japan PheWeb | Japan | Query public BioBank Japan GWAS summary statistics through the official API and the public download catalogue. Individual-level data is not requested. |
| `humandbs.dbcls.jp` | IP address; query terms | NBDC Human Database, Database Center for Life Science (DBCLS) | Japan | Read the public NBDC hum0014 catalogue and allow only datasets marked 制限なし / unrestricted. |
| `jenger.riken.jp` | IP address; query terms | RIKEN, JENGER | Japan | Read the public JENGER result catalogue and official download links. |
| `pdc.cancer.gov` | IP address; query terms | National Cancer Institute Proteomic Data Commons | United States | Discover public PDC study, biospecimen, and file metadata. Study files are not downloaded by these tools. |
