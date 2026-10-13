# Biomni-inspired biomedical research in DRA

DRA includes a selectable **Biomedical Research** Specialist and the `biomedical-discovery` skill. They coordinate DRA's installed evidence-review, therapeutic-indication, omics, protein, and molecular-design skills. The workflow asks the researcher to confirm key study-design, eligibility, analysis, and patient-data execution decisions, and requires evidence provenance and privacy safeguards.

## Relationship to Stanford Biomni

This is an original DRA workflow inspired by the breadth of Stanford Biomni. It does **not** bundle or execute Biomni A1, download its data lake, reproduce every Biomni tool, or reuse Biomni code or datasets. Capabilities depend on the skills, models, compute environment, and connectors actually installed in DRA.

The upstream project describes an approximately 11 GB first-use data-lake download by default and warns that its agent can execute generated code with full system privileges. Keeping that runtime outside DRA's Electron main process avoids adding a large, unrestricted execution surface to the desktop app. If a deployment later chooses to connect a separately isolated Biomni MCP service, it should be opt-in, run under a restricted account/container, and expose only reviewed tools and data.

## Licensing

Stanford Biomni is published under Apache-2.0. Its README notes that bundled tools, datasets, and other components can have separate terms; review those licenses individually before redistribution or commercial use. DRA's capability profile does not itself grant rights to third-party model weights, datasets, or services.

References: [Stanford Biomni repository and setup notes](https://github.com/snap-stanford/Biomni#readme), [upstream license](https://github.com/snap-stanford/Biomni/blob/main/LICENSE).
