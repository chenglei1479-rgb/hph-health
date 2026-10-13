# DRA source evaluation snapshot

Actual product version: **0.1.33-unified.1** (package.json and package-lock.json).
This is the latest complete integrated local product candidate, based on upstream
open-science v0.36.0, commit 724d95e208209cc5fd12ffc54e715fa590454ba5.
The newer v0.37.1 integration workspace is incomplete and is not this product.

Use the exact Git commit URL supplied with this snapshot. A version label alone
does not identify the source. See source-publication.json for provenance, privacy
changes, exclusions and verification boundaries, and published-source-manifest.json
for exact file hashes. The manifest excludes itself.

## Review entry points

- README.md: researcher governed medical research workflows.
- docs/PRD.md and docs/design.md: requirements and architecture; validate claims against code.
- src/main: Electron services, agent frameworks, persistence, connectors, account,
  permissions, Notebook execution, specialist and research orchestration.
- src/preload and src/shared: desktop API boundary and shared contracts.
- src/renderer/src: React workspaces, research UX, account and settings.
- prisma/schema.prisma: data model.
- packages/notebook-network-sandbox: execution isolation and platform helpers.
- resources/notebook/templates/bbj: BBJ/MR templates, example configuration and synthetic tests.
- resources/skills and resources/specialists: bundled research capabilities.
- scripts, e2e, and *.test.ts: verification and regression coverage.

## Reproduction and evidence

Follow CONTRIBUTING.md and package.json scripts. Install your own dependencies and
configure your own provider credentials; no configured user profile is supplied.
CI stages micromamba and native runtimes from their source/build configuration;
local node_modules, native build caches and resources/bin are excluded.

Publication checks: original 7,965 manifest files matched their SHA256 hashes;
i18n guard passed 777 tests. A complete build and full regression suite were not
run for this publication. Historical 2026-10-10 records contain 10,017 passed,
58 failed and 26 skipped tests; they are not a claim that this snapshot passes all tests.
Review implemented, verified and real-world accepted behavior separately.

No user database, credential profile, session log, research input document or
patient dataset is supplied. Security test fixtures deliberately contain fake
tokens and private-key marker strings. Public literature parsing fixtures are
test inputs, and personal email fields were replaced with example.invalid.
The original local product source remains unchanged.
