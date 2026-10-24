# Seed invite operations

Seed builds receive one-time invite material through `BASELIO_SEED_INVITES_JSON`. The value is a JSON object whose keys are invite codes and whose values are restricted OpenAI Project API keys. Keep it in the build or launch secret store; never commit it, paste it into email, or put it in logs.

Example shape (placeholders only):

```json
{"invite-code-from-secure-channel":"restricted-project-key"}
```

The operator creates one restricted OpenAI Project per seed participant, sets the hard budget to USD 20, and distributes only the invite code through the approved secure channel. On redemption, Baselio compares hashes, writes the API key using Electron `safeStorage`, stores only the encrypted reference, a fixed mask with at most the last four characters, and the redeemed-code SHA-256 hash, then activates the pinned `gpt-5.4-mini` provider. The invite is single-use on that device. Remove the mapping from future builds after redemption; revocation and the USD cap remain authoritative in the OpenAI Project.

The local allowance is two writing packages. Starting a charged workflow consumes one package; its first draft and one revision remain in that package. The static fictional abstract and literature-search entry do not consume a package. BYOK overrides the company provider and bypasses the seed allowance. Seed mode never changes the fictitious-data-only import gate.
