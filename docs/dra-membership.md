# DRA membership

Monthly USD pricing: Free $0, Plus $20, Pro $100. Activation, renewal, and cancellation are administered in Auth0; no checkout, automatic charges, or automatic renewal are implemented. Model API and cloud compute costs are separate.

Plus includes Notebook execution and research package export. Pro also includes delegated research agents, background execution, and AI review. Basic research chat, literature workflows, existing results, and cancellation remain available with Free. Foreground control REPL and ordinary shell tools remain available for basic chat; this is not a restriction on all local code execution.

Deploy `scripts/auth0-membership-action.cjs` as a Post Login Action and bind it to the Post Login trigger. The action is already deployed for the configured DRA Native client. When deploying to another tenant or app, update the intended client ID in the action and use the same membership claim namespace as `src/shared/membership.ts`.

Administrators maintain `app_metadata.dra_membership` on the user's actual Auth0 identity. Preserve unrelated metadata:

```json
{
  "dra_membership": {
    "plan": "plus",
    "status": "active",
    "valid_until": "2026-11-03T00:00:00.000Z"
  }
}
```

Set `plan` to `plus` or `pro`, and choose a future UTC ISO deadline corresponding to the manually managed monthly term. Set `status` to `canceled` to revoke future login grants. Do not use `user_metadata`, which users can edit. Re-login is required to immediately refresh an administrator-changed grant; there is no push revocation. Protected operations recheck the membership deadline. Where available, the desktop saves credentials using Windows encryption and restores or renews its signed session on startup. A restored session is not a permanent membership grant. Windows encrypted persistence and live refresh remain separate acceptance checks.

`scripts/admin-membership.cjs` prepares a reviewable administrator proposal from an exported `app_metadata` JSON file. It never invokes the Management API, modifies an account, starts checkout or charges money. Preserve unrelated metadata, inspect the proposal, then apply it in the correct Auth0 identity's App Metadata field. Never place Management API secrets in the desktop app.

```text
node scripts/admin-membership.cjs --input app-metadata.json --output reviewed-proposal.json --action activate --plan plus --months 1 --operator administrator
```

Use `renew` to extend the same plan from its current expiry when active, or from now when expired. Use `change` to explicitly replace an active plan with a new term starting now; prorating and payments are not implemented. Use `revoke` to mark a grant canceled. Months are UTC calendar months, with invalid month-end days clamped to the last day of the destination month. Proposals retain `dra_membership_history`; this is an administrator-maintained record, not a tamper-proof billing ledger. The output file must be new; accidental overwrites are rejected.

The candidate Auth0 Action preserves a valid past paid deadline in its signed claim so the desktop can display expiration and downgrade to Free. This source change requires a separate reviewed Action deployment; packaging it does not update Auth0. The previously deployed Action continues to fail closed for expired grants.

The main account owner consumes the claim only after issuer, audience, signature, nonce, expiry, and local identity binding checks. Invalid or absent grants produce Free. Deadline checks occur at each new protected operation. IPC/RPC command guards cover package export and reviewer invocation; Notebook core entry points, delegated model admission, and reviewer model admission enforce execution permissions. Reading results and canceling work are not paid gates. Unconfigured legacy local-only deployments preserve their original behavior; authenticated distribution includes the public Auth0 config. Desktop filesystem or source tampering is outside this product entitlement boundary.

Users view membership through Account → Membership and plans. No renderer endpoint can grant or switch a plan. No Auth0 Management API secret is embedded in the desktop package.

Account → Membership and plans → Check Notebook permissions invokes the same main-process guards used for execution. Free denies foreground and background; Plus permits foreground and denies background; Pro permits both. This does not create a Run or check whether a model session received the tool. The active deadline is displayed with date and local time.

The candidate DRA Research Project skill provides evidence-table records, manuscript citation linkage, expert review records, an issue register and a proposed package inventory. Its helpers do not perform source verification, scientific inference, expert dispatch or export. DRA Literature Expert, DRA Statistics Expert and DRA Writing Reviewer are validated builtin profiles; actual collaboration uses the existing Pro-gated delegated runtime. Reading a profile or producing a helper record is not a completed collaborative run.

Payment, automatic renewal, cancellation billing and usage quotas remain deferred. No new remote usage telemetry is enabled by this change.

Verify actual Free → Plus → Pro → Free transitions with a controlled Auth0 identity, re-login after metadata changes, and attempt the protected operations. Unit tests use signed RSA fixtures and administrator Action event fixtures; they do not establish that a real user's grant or model execution has succeeded.
