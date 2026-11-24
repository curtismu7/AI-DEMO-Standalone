# Run PingOne Privilege in your one demo environment

For: a colleague who wants the demo labs **and** PingOne Privilege (AI gateways, agent keys) in a single PingOne environment, with PingID for approvals.
Spec: [docs/specs/2026-11-23-privilege-one-env-setup.md](specs/2026-11-23-privilege-one-env-setup.md). Written from the 2026-11-23 rebuild of a locked-out Privilege environment.

## What you need
- A PingOne organization with a licence that includes Privilege, and a worker app in the Administrators environment holding **Organization Admin** (to adopt an environment you made in the console with `--existing-env`, **Environment Admin** at organization scope is enough) (the same worker `scripts/pingone-setup.sh` already asks for).
- Your own console login in the Administrators environment (the one you sign in with at console.pingone.com).
- Node 26 (the labs already need it).
- Permission to create a new PingID account (step 1 asks the console for it: "Create new").

## The path, in order

PingID and Privilege cannot be created by a script, so **you create the environment in the console and the script adopts it.** Measured 2026-11-24 on a throwaway environment: through the API PingOne accepts PingID in the bill of materials and creates the three PingID apps, but never provisions the PingID deployment, and a `PINGID_AUTHENTICATION` sign-on action is refused (`LICENSE_EXCEEDED: PingID is disabled for environment`). And only the person who adds Privilege in the console becomes PingOne Privilege Administrator.

1. **Create the environment** (console, you). Environments → **+**:
   - Type **Sandbox**, a name, licence type **Paid**, use case **Workforce**.
   - Capabilities: PingOne SSO, DaVinci, Authorize, Risk, **PingID → Create new** (a new PingID account), and **PingOne Privilege → No Endpoint Controller** (agentless). Do **not** add PingOne MFA: PingID cannot share an environment with it.
   - Use *your own* admin login; whoever finishes this wizard becomes **PingOne Privilege Administrator**, and nobody can grant it afterwards.
   - Copy the environment ID from the console URL.

2. **Adopt it and create the lab worker** (script):
   ```
   scripts/pingone-setup.sh --existing-env <environment id> --admin-user <your console login>
   ```
   Or run `scripts/bootstrap.sh` / `scripts/pingone-setup.sh` with no flags in a terminal on a machine with no configured environment: it asks for the environment ID (Enter makes a basic API-created environment with no PingID and no Privilege). It never asks when an environment is already configured in `~/Development/.env` (pass `--existing-env` to switch), under `bootstrap.sh --non-interactive`, with `--api-create` or with no terminal. Only a SANDBOX is accepted. The script checks the environment first (`node scripts/pingone-admin.mjs check-env --env <id>`: PingID Workforce with its deployment, Privilege, no PingOne MFA, the `Multi_Factor` and `Single_Factor` sign-on policies) and stops with the reason if something is missing. It creates no environment and needs no licence lookup. The worker holds Identity Data Admin and Environment Admin on this environment and nothing else; the script trims what it inherited from the org worker, and if it prints that roles are left, remove them in the console under Environment > Applications > worker > Roles. `--admin-user` gives your login the same two roles here, so Users show up when you open the environment.

3. **Prepare it, and create your admin inside the environment** (script). The Privilege console needs a user record **inside this environment**: your login in the Administrators environment is not enough.
   ```
   node scripts/pingone-admin.mjs privilege-prepare --create-admin <your login> --users demouser,demoAdmin
   ```
   Add `--dry-run` first to see what would change. It creates your admin as a user here (default population, Identity Data Admin and Environment Admin; the generated password goes to a mode-600 file whose path it prints, never to the screen), creates the group `PrivilegeAdmins`, a default `Single_Factor` sign-on policy if the environment has none, restricts the *PingOne Privilege* app to the group (keeping any group already there; a backup of the app is saved in `~/.config/demo-kit/backups`), and puts the users in the group. It adds the users first and restricts the app only once the group has a member, so it cannot lock everyone out (with no valid user it refuses and says so). Every item is read back as PASS or FAIL. It is safe to run again; an existing user keeps its password.

   Then, in the console, as the login that added Privilege: Environment > Users > your admin user > Roles > grant **PingOne Privilege Administrator** (an API cannot grant it). Now sign in to the Privilege console as that user.

4. **Agent mode (Endpoint Controller / local desktop agent)**, only if you need it (script, org-admin token):
   ```
   PINGONE_ACCESS_TOKEN=<org admin token> node scripts/pingone-admin.mjs set-privilege-mode --env <environment id> --mode agent
   ```
   It saves the bill of materials, changes only the Privilege tag to `AUTHENTICATION_MODE_AGENT`, and reads it back. `--mode agentless` goes back. Privilege was added agentless on purpose: that order gives the Nodes page and the agent onboarding on one tenant.

5. **Pair PingID** for each approver (phone) before any MFA or approval step depends on it. Copied or new users have no devices.

6. **Check**: sign in to the environment's Privilege console as the admin user. A user who is not in `PrivilegeAdmins` is refused on purpose.

### Teardown is protected
`scripts/pingone-teardown.sh` refuses to delete any environment that has a PingID deployment or PingOne Privilege, even with `--yes` (the PingID account and the Privilege Administrator role cannot be recreated or granted again). It reads this from the environment itself, so it holds on another laptop too. `--delete-privilege-env` lifts it; an unreadable bill of materials is refused as well.

### No PingID, no Privilege?
`scripts/pingone-setup.sh --api-create` (or a run with no terminal) still makes the basic environment through the API: SSO, DaVinci, Authorize. It has no PingID and no Privilege. To add them later, create a new environment as in step 1 and run step 2 with `--existing-env`.

## Lockout rules (learned the hard way)
- Do **not** turn on MFA for the Privilege tenant before you have proved a full agent reconnect with it on. A tenant whose MFA fails to start locks you out of the console, and the console is the only place to switch it off.
- Never edit the Privilege app with a partial PUT: send the whole object back (the script does).
- Keep a second admin login that holds PingOne Privilege Administrator.
- Changes to the Privilege tenant profile are accepted but reverted; change the product tag in the environment's bill of materials instead.

## Known risk: PingID-only and the AI-DEMO2 MFA flows
AI-DEMO2's step-up and approval demos call the PingOne MFA APIs. In an environment without PingOne MFA they may not work. This was not tested. If you need those demos, use an API-created environment with `--api-create --with-pingone-mfa`: that environment has no PingID and no Privilege.

## One environment and AI-DEMO2
When AI-DEMO2's `PRIVILEGE_CONSOLE_ENV_ID` is unset (or equals your environment) and the "PingOne Privilege" app exists there, its user sync puts the demo accounts into `PrivilegeAdmins` instead of copying them to a second environment.
