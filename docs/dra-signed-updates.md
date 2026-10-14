# DRA signed update channel

DRA checks for updates with electron-updater's generic provider. The packaged feed URL is a placeholder until an operator replaces it:

`https://updates.REPLACE_ME/dra/`

`resources/dra-signing.yml` is copied into the app resources. Updates stay **disabled** while `updateFeedUrl`, `macTeamId`, or `windowsPublisherName` still contains `REPLACE_ME` or `.invalid`. A disabled channel does not contact the placeholder host.

## What the feed must contain

Publish `latest.yml` at the feed URL. It must include:

- `version`
- `channel`: `beta` or `stable` (this is a field in `latest.yml`, not a separate `beta.yml`)
- `stagingPercentage`: integer 0–100

An install is in the rollout when a stable local cohort id falls under that percent. The id is a random UUID in the app user-data directory (`update-cohort-id`). It is not an account id. A partial rollout with no saved cohort id is not offered. `100` includes every install. The requested channel in `dra-signing.yml` must match `latest.yml`.

Nothing is installed on quit. `autoDownload` and `autoInstallOnAppQuit` stay off. The installer starts only after the user confirms, and only after the signature check below succeeds.

## Signature check before install

- macOS: `codesign` team id must equal `macTeamId`. When `requireNotarization` is true, `spctl` must report the downloaded artifact as notarized.
- Windows: Authenticode status must be `Valid`, and the certificate subject or its `CN` must equal `windowsPublisherName`.
- Linux packages have no Authenticode publisher pin. They still require a real signing config before the channel turns on.

A failed check leaves the downloaded file uninstalled.

## CI secrets

`.github/workflows/dra-update-signing.yml` is a manual skeleton. It reads secrets from the CI environment and never stores them in the repo. The job only checks that each secret is present; it does not print secret values and it does not sign or upload a build.

Configure these repository secrets before the skeleton can pass:

| Secret                        | Use                                                                  |
| ----------------------------- | -------------------------------------------------------------------- |
| `CSC_LINK`                    | Base64 macOS Developer ID certificate (`.p12`)                       |
| `CSC_KEY_PASSWORD`            | Password for `CSC_LINK`                                              |
| `APPLE_ID`                    | Apple ID used for notarization                                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization                               |
| `APPLE_TEAM_ID`               | Apple Team ID. Must match `macTeamId` in the signing config you ship |
| `WIN_CSC_LINK`                | Base64 Windows Authenticode certificate (`.pfx`)                     |
| `WIN_CSC_KEY_PASSWORD`        | Password for `WIN_CSC_LINK`                                          |
| `DRA_SIGNING_PUBLISHER`       | Exact Windows publisher / certificate CN                             |

Also set the feed host and publisher in `resources/dra-signing.yml` and `electron-builder.yml` `publish.url` for the build you intend to ship. Do not commit the certificate files.

## Assumptions

- Operators replace the placeholder host with their own HTTPS server. This change does not upload releases.
- Release notes may still be absent until that server also hosts `version.json`. A missing notes file does not install an update.
- The existing manual download link is unchanged.
