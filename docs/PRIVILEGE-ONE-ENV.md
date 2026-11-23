# Run PingOne Privilege in your one demo environment

For: a colleague who wants the demo labs **and** PingOne Privilege (AI gateways, agent keys) in a single PingOne environment, with PingID for approvals.
Spec: [docs/specs/2026-11-23-privilege-one-env-setup.md](specs/2026-11-23-privilege-one-env-setup.md). Written from the 2026-11-23 rebuild of a locked-out Privilege environment.

## What you need
- A PingOne organization with a licence that includes Privilege, and a worker app in the Administrators environment holding **Organization Admin** (the same worker `scripts/pingone-setup.sh` already asks for).
- Your own console login in the Administrators environment (the one you sign in with at console.pingone.com).
- Node 26 (the labs already need it).
- A PingID admin login of your own, for step 5.

## The path, in order

1. **Create the environment and the lab worker** (script):
   ```
   scripts/pingone-setup.sh --admin-user <your console login>
   ```
   You get one SANDBOX environment with SSO, DaVinci and Authorize, **without PingOne MFA** (PingID cannot share an environment with it; add `--with-pingone-mfa` only if you do not want PingID). The worker holds Identity Data Admin and Environment Admin on this environment and nothing else. The script trims what it inherited from the org worker; if it prints that roles are left, remove them in the console under Environment > Applications > worker > Roles. `--admin-user` gives your login the same two roles here, so Users show up when you open the environment.

2. **Add Privilege** (console, you): Environment > Add Services > **PingOne Privilege** > **No Endpoint Controller** > Finish. Do this with *your own* admin login. Only the person who adds Privilege becomes **PingOne Privilege Administrator**, nobody can grant it afterwards, and an API call cannot do it. Check that PingOne Privilege now shows in the environment's services. The console may add other products on its own (Recognize, Ping Authorize): that is normal. Choosing *Endpoint Controller* here instead leaves the tenant half-built (no Nodes page, empty identity provider and client secret), so use step 4 to get agent mode.

3. **Prepare it, and create your admin inside the environment** (script). The Privilege console needs a user record **inside this environment**: your login in the Administrators environment is not enough.
   ```
   node scripts/pingone-admin.mjs privilege-prepare --create-admin <your login> --users demouser,demoAdmin
   ```
   Add `--dry-run` first to see what would change. It creates your admin as a user here (default population, Identity Data Admin and Environment Admin; the generated password goes to a mode-600 file whose path it prints, never to the screen), creates the group `PrivilegeAdmins`, a default `Single_Factor` sign-on policy if the environment has none (an API-made environment has none, and every app sign-in then fails with "unexpected error"), restricts the *PingOne Privilege* app to the group (keeping any group already there; a backup of the app is saved in `~/.config/demo-kit/backups`), and puts the users in the group. It adds the users first and restricts the app only once the group has a member, so it cannot lock everyone out (with no valid user it refuses and says so). Every item is read back as PASS or FAIL. It is safe to run again; an existing user keeps its password.

   Then, in the console, as the login that added Privilege: Environment > Users > your admin user > Roles > grant **PingOne Privilege Administrator** (an API cannot grant it). Now sign in to the Privilege console as that user.

4. **Agent mode (Endpoint Controller / local desktop agent)**, only if you need it (script, org-admin token):
   ```
   PINGONE_ACCESS_TOKEN=<org admin token> node scripts/pingone-admin.mjs set-privilege-mode --env <environment id> --mode agent
   ```
   It saves the bill of materials, changes only the Privilege tag to `AUTHENTICATION_MODE_AGENT`, and reads it back. `--mode agentless` goes back. Keep the tenant in agentless first and flip afterwards: that order gives the Nodes page and the agent onboarding on one tenant.

5. **Add PingID** (console, you): Environment > Add Services > PingID, with your own PingID admin login. A script cannot do this.

6. **Check**: sign in to the environment's Privilege console as the admin user. A user who is not in `PrivilegeAdmins` is refused on purpose.

## Lockout rules (learned the hard way)
- Do **not** turn on MFA for the Privilege tenant before you have proved a full agent reconnect with it on. A tenant whose MFA fails to start locks you out of the console, and the console is the only place to switch it off.
- Never edit the Privilege app with a partial PUT: send the whole object back (the script does).
- Keep a second admin login that holds PingOne Privilege Administrator.
- Changes to the Privilege tenant profile are accepted but reverted; change the product tag in the environment's bill of materials instead.

## Known risk: PingID-only and the AI-DEMO2 MFA flows
AI-DEMO2's step-up and approval demos call the PingOne MFA APIs. In an environment without PingOne MFA they may not work. This was not tested (it needs an environment that really has PingID). If you need those demos, run step 1 with `--with-pingone-mfa` and skip PingID.

## One environment and AI-DEMO2
When AI-DEMO2's `PRIVILEGE_CONSOLE_ENV_ID` is unset (or equals your environment) and the "PingOne Privilege" app exists there, its user sync puts the demo accounts into `PrivilegeAdmins` instead of copying them to a second environment.
