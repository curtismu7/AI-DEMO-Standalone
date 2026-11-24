# Privilege in one PingOne environment: setup spec

**Status:** draft (addendum 2026-11-24 below)   **Owner:** Curtis (decides before any push or PR)   **Repos:** AI-DEMO-Standalone (this file, setup + prepare script + docs), AI-DEMO2 (`syncPrivilegeUsers.js`)

## Goal
A colleague who downloads the demos gets **one** PingOne environment that also runs PingOne Privilege (agent mode, AI gateways, PingID), with the admin access, group, sign-in policy and app settings that the Pingid-privilege rebuild (2026-11-23) proved are required. Today the setup script creates an environment without Privilege and with PingOne MFA, gives the per-environment worker every role its creator had, and AI-DEMO2's Privilege user sync does nothing when Privilege shares the demo environment.

## What the rebuild proved (the reasons for each requirement)
1. Only a **person** becomes PingOne Privilege Administrator, and only by adding Privilege in the console (an API-made Privilege has no admin and a half-built tenant). Adding it to an existing API-made environment works (tested 2026-11-23 on a throwaway environment: the console login got the role, the "PingOne Privilege" app appeared, the tag was `AUTHENTICATION_MODE_AGENTLESS`).
2. A worker created through the API inherits every role of its creator (Organization Admin, Identity Data Admin on 54 environments).
3. An API-made environment has no sign-on policy: every app sign-in fails with "unexpected error".
4. Privilege only admits users of its own environment who are in the group its app is restricted to; Identity Data Admin is what makes Users visible to a person.
5. PingID cannot share an environment with PingOne MFA, and a script cannot add PingID (it needs a PingID admin login).

## Acceptance criteria (each is a runnable check)
1. `scripts/pingone-setup.sh` requests the products BASE, DAVINCI, AUTHORIZE (no `PING_ONE_MFA`); `--with-pingone-mfa` restores the old set. Check: a node test asserts the default products line has no MFA and MFA appears only behind the flag; the real run (criterion 9) reads the bill of materials back.
2. After the worker is created, `pingone-admin.mjs ensure-worker-roles` leaves it with exactly Identity Data Admin and Environment Admin, both scoped to its own environment. Check: node test with a fake API holding extra org-scope and other-environment roles; the read-back lists none of them.
3. `--admin-user <login>` grants Identity Data Admin and Environment Admin on the new environment to that user of the Administrators environment (matched by username or email). An unknown login is a warning, never a failure. Check: node test.
4. The setup output ends with the console steps that cannot be scripted: add Privilege (No Endpoint Controller), add PingID, grant PingOne Privilege Administrator to your admin user, then run `node scripts/pingone-admin.mjs privilege-prepare`.
5. `node scripts/pingone-admin.mjs privilege-prepare --users a,b` (logic in `scripts/lib/pingone-admin.mjs`) is idempotent, uses the environment's own worker from the settings file, and: confirms Privilege and its app exist (else exits 2 with the console step); creates group `PrivilegeAdmins`; creates a default `Single_Factor` sign-on policy if none is default; restricts the Privilege app to the group (GET, back up, change one field, PUT the whole app); adds the given logins to the group; with `--create-admin <login>` first creates that login as a user inside the environment (password generated, written to a mode-600 file, never printed; an existing user is untouched); reads every item back and prints PASS/FAIL, exit 1 on any FAIL. `--dry-run` writes nothing.
6. AI-DEMO2 `syncPrivilegeUsers.js`: when no separate Privilege environment is configured (or it equals the demo environment) and the demo environment has a "PingOne Privilege" app, it ensures `PrivilegeAdmins` and adds the demo accounts to it; with a separate environment configured it behaves exactly as before. Check: jest tests in `tests/scripts/syncPrivilegeUsers.test.js`.
7. `docs/PRIVILEGE-ONE-ENV.md` gives a colleague the whole path in order, including the lockout rules, and `docs/REAL-PREREQUISITES.md` points to it.
8. Gates: `node --test test/*.test.mjs scripts/*.test.mjs`, `bash -n scripts/*.sh`, `scripts/check-no-ai-attribution.sh` pass in the Standalone worktree; the jest file passes in the AI-DEMO2 worktree.
9. A real run on a throwaway environment (setup, add Privilege in the console, prepare) ends with `privilege-prepare` all PASS and a sign-in to the Privilege app as a group member working; the throwaway is deleted afterwards.

5b. `node scripts/pingone-admin.mjs set-privilege-mode --env <id> --mode agent|agentless` (org token) backs the bill of materials up (mode 600), changes only the `PING_ONE_PAM` tag, reads it back; idempotent; refuses when Privilege is absent. Check: node tests and the real run.
5c. The doc says: the Privilege console needs a user record inside the environment; Privilege Administrator is granted in the console by the login that added Privilege; Endpoint Controller is chosen by the tag flip, not at add time.

## Unhappy paths (each needs a check)
- Org worker lacks Organization Admin (existing guard stays). Role removal denied (HTTP 403): the script warns with the exact roles left and how to trim them in the console; it fails hard only if Environment Admin cannot be ensured.
- `--admin-user` not found, or matches several users: warning with the count; the worker and environment are still created.
- Privilege not yet added, or its app missing: `privilege-prepare` exits 2 and prints the console step; nothing is written.
- Re-run after a partial failure: every step skips what exists (group, policy, app restriction, memberships).
- A user to add is not in the environment: reported as MISSING, not created, exit 1 at the end.
- PingOne allows one assignment of a role per app whatever its scope (found in the real run): extras are removed first, then missing kept roles are added, then everything is read back; a kept role that is not held at the end fails the step.
- Lockout: the app is restricted to the group only after the group has a member; no members means FAIL and the app is untouched. An existing `ALL_GROUPS` type is kept. An unreadable app is a FAIL.
- Wrong target: `ensure-worker-roles` refuses any principal that is not a WORKER app named "Standalone Labs Worker" in the given environment; a role refused as "unique" but not actually held is reported.
- A shell `PINGONE_ACCESS_TOKEN` / `PINGONE_ENVIRONMENT_ID` is ignored by `privilege-prepare`: the settings file's worker is used.
- API 429: retried; 5xx or network error: GET retried, writes not (they may have applied). 30 s timeout. No token or secret is ever printed.
- The Privilege app already has `accessControl` for other groups: the new group is added, existing ones are kept.

## Out of scope
Adding PingID or Privilege by script (cannot give an admin role, cannot type a PingID login); Privilege tenant objects (apps, grants, policies, keys: covered by the separate rebuild runbook); the OIDC app a local Docker gateway signs in through (see the Ping local-gateway guide); gateways and the desktop agent; changing any OAuth scope in AI-DEMO2; deleting environments.

## Protected / must not break
Existing flags and the mock-mode path of every lab; `pingone-teardown.sh`; AI-DEMO2's separate-environment sync; secrets never in output or in `$ENV_FILE` beyond what the script already writes; no AI attribution.

## Known risks (open, not hidden)
- **PingID-only (owner decision 2026-11-23) vs AI-DEMO2 step-up MFA.** AI-DEMO2 calls the PingOne MFA APIs in 12 runtime files (device management, step-up, CIBA approval with a "PingOne MFA device"). An environment without PingOne MFA may break those demos. Unverified: it needs a test on an environment that really has PingID, which needs a PingID account. `--with-pingone-mfa` is the escape hatch, and the guide says so.
- The worker's role removal cannot be exercised against the real API from an agent session that restricts role deletion; the unit tests cover the logic and the real run covers what the harness allows.

## Verification plan
Unit tests with an injected fake PingOne API; the jest file; the throwaway real run; independent `/code-review` of each branch diff. Nothing is pushed, no PR opened, and nothing merged until the owner says so in the conversation.


## Addendum 2026-11-24: the environment is created in the console, with PingID, and the script adopts it
**Owner request:** bootstrap must set up the environment with PingID (Workforce, "create new") at creation, because the API-made environment (no PingID, no Privilege) does not work for the PingID approval demos or Privilege.
**Measured (throwaway environment, deleted):** `PING_ONE_ID` subtype `WORKFORCE` is accepted in the bill of materials via the API and the PingID apps appear after about a minute, but the product has no `deployment` and `PINGID_AUTHENTICATION` is refused (HTTP 403 `LICENSE_EXCEEDED`, "PingID is disabled for environment"). A console-made environment (`5bfb4e12`) has `solutionType WF_TRIAL`, `PING_ONE_ID` with a `deployment`, Privilege tagged agentless, and both `Multi_Factor` and `Single_Factor` policies. So a script cannot create it; a person does, and the script adopts it. This replaces "5. ... a script cannot add PingID" as a side note with the actual path, and moves PingID from "add it last" to "choose it at creation".
**Today's default was not PingOne MFA** (that is `--with-pingone-mfa`, off by default); it was no second factor at all.

Acceptance criteria (each a runnable check):
10. `checkWorkforceEnv` (`node scripts/pingone-admin.mjs check-env --env <id> [--no-privilege]`, read-only) PASSes a console-made environment and FAILs, with the console fix in the message: PingID missing, PingID not Workforce, PingID without a deployment, PingOne MFA present, Privilege missing (WARN with `--no-privilege`), unknown environment. Missing sign-on policies only WARN. Check: five node tests with a fake API, and a real run against `5bfb4e12` (all PASS, exit 0) and an unknown id (FAIL, exit 1).
11. `scripts/pingone-setup.sh --existing-env <id>` checks the environment first, stops with exit 1 on any FAIL, creates no environment and does no licence lookup, finds an existing lab worker instead of making a second, and rejects an id that is not 8-4-4-4-12 hex before it reaches a URL. Check: a node test that the licence lookup and the create POST sit only inside the "no --existing-env" guard; `bash -n`.
12. With a real terminal, no flag, no `ASSUME_YES` and no environment already configured in the settings file, the script prints the console steps and asks for the environment ID (Enter = basic API environment). With no terminal (a readable but dead `/dev/tty` does not count), `ASSUME_YES=1`, `bootstrap.sh --non-interactive` (exports `STANDALONE_NON_INTERACTIVE=1`), `--api-create`, or a configured environment, it never asks and behaves as before. `--existing-env` (also `PINGONE_EXISTING_ENV_ID`) conflicts with `--api-create` and `--with-pingone-mfa`, checked before and after the question. `check-env` accepts only a SANDBOX. `--existing-env` also comes from `PINGONE_EXISTING_ENV_ID`. Check: node test of the guard condition. Bootstrap reaches the question through `pingone-setup.sh` (step 6), unchanged.
13. `docs/PRIVILEGE-ONE-ENV.md` gives the new order (console creates, script adopts) and says why.
14. `pingone-teardown.sh` refuses, even with `--yes` and `--dry-run`, any environment whose bill of materials has `PING_ONE_PAM` or a `PING_ONE_ID` with a deployment, and refuses when the bill of materials cannot be read; `--delete-privilege-env` lifts it. The decision is read from the tenant, not from a local file. Check: three node tests that run the real script against a stubbed `curl` (refused, forced, basic environment still deletable, fail closed), and a mutation run with the guard disabled (two tests fail).

Unhappy paths: the id is a real environment in another organization or region (check-env FAILs on the GET); the environment has PingOne MFA (FAIL: create it again); PingID exists but Privilege does not (FAIL, or WARN with `--no-privilege`); the person picked "Use existing" PingID (still has a deployment: PASS; the account is theirs); re-running adopt (finds the existing "Standalone Labs Worker", re-mints its secret as the reuse path already does).
Not verified: a full adopt run against a console-made throwaway (worker creation, `.env` write) because an agent cannot create the console environment; the worker/`.env` part of the script is unchanged and was exercised on 2026-11-23.
