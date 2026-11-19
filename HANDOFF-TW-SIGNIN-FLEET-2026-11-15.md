# HANDOFF — token-workbench sign-in + fleet top-menu convergence (2026-11-15, supersedes overlap in HANDOFF-FLEET-2-2026-11-06.md)

Everything below is committed and pushed. Verified live in the browser unless noted.

## 1. token-workbench-LAB — dual-provider user sign-in (main feature)

`curtismu7/token-workbench-LAB`, main pushed through `4ded6a1` (14 commits, origin/main..main = 0).

- **Sign in to PingOne or PingFederate** on the Decode / Trace tab (provider picker, `Sign in to:`). Both verified live: authorization code + PKCE with `response_mode=pi.flow`, login stays in the page, password typed once, never stored/logged/shown.
- **Three tokens issued raw per provider**: Access, ID, Refresh — each decoded with claims, expiry countdown, cnf analysis; "View:" buttons per token kind.
- **Refresh tokens** (`grant_type=refresh_token`) per provider; **Sign out** drops the per-workspace session.
- **REAL trace accumulates** the whole session history (authorize → flows password → resume → token, plus one entry per refresh) and stays visible while signed in; survives reload (`GET /api/signin/session` returns the trace; server scrubs secrets/username). Trace entries scrubbed as JSON (`scrubEntries`, `config.scrub` is string-only).
- Provider paths are per-provider config in `server/src/realSignin.js` (`providerCfg`): PingOne `/as/authorize` `/as/token` `/flows/{id}` + `usernamePassword.check`; PingFederate `/as/authorization.oauth2` `/as/token.oauth2` (discovery) `/pf-ws/authn/flows/{id}` + `checkUsernamePassword` + `X-XSRF-Header: PingFederate`.

### Config that makes it work (do not relearn)

- Lab `.env` (git-ignored, beside docker-compose.yml): `TW_REAL_*` (PingOne client_credentials + `TW_REAL_3LO_CLIENT_ID/SECRET`), `TW_REAL_USERNAME=<set in the lab's .env>` (the exact login, with its casing, is whatever the lab `.env` holds; the generic demo login was reported to get INVALID_CREDENTIALS, and sign-in with the `.env` value has not been re-run since the 2026-11-15 rebuild), and the PF block: `TW_REAL_PF_BASE_URL=<set in the lab's .env>`, `TW_REAL_PF_CLIENT_ID=<set in the lab's .env>`, `TW_REAL_PF_CLIENT_SECRET=<set in the lab's .env>`, `TW_CA_FILE=<set in the lab's .env>` (compose mounts it read-only, `NODE_EXTRA_CA_CERTS`).
- Sign-in passwords for the PingOne 3LO user and the PingFederate users are held by the owner and are not recorded in this repo (Simple PCV `aiDemoPfSimplePcv`, static user table, no LDAP — see UC40 doc).
- The PF client `<the PF client id from .env>` exists on ai-demo-pingfederate with `allowAuthenticationApiInit=true` and `clientAuth.type=SECRET` (set via admin API `https://localhost:9999/pf-admin-api/v1/oauth/clients/...`, `X-XSRF-Header: x` required, secret field is `clientAuth.secret` not `clientSecret`).
- PingOne `TW_REAL_ISSUER` already ends in `/as`; the sign-in code strips it before adding paths. A double `/as/as/authorize` = 403 Missing Authentication Token.
- PingOne flows step 400 with `INVALID_DATA` + no details = wrong content type or username case; step 400 with `INVALID_CREDENTIALS` = wrong password.

### Tests / gates

- Server: **134/134** (`cd server && node --test test/*.test.js`); web: **64/64** (`cd web && npx vitest run`). All green.
- Stub issuer in `server/test/real.test.js` simulates both providers (PF: `/as/authorization.oauth2`, `/pf-ws/authn/flows/{id}` with XSRF, `/as/token.oauth2`, base discovery at `/.well-known/openid-configuration`). Test for PF provider at ~line 519.
- `scripts/compose.test.mjs` was relaxed to allow the one read-only CA-file mount (`.pem` only); still no sockets/rw mounts.
- Port-collision flakes under parallel runs (api/checker/hardening timing out): re-run the failing file alone before believing a failure.

## 2. token-workbench-LAB — standard shell adopted (top-menu sweep exemplar)

- The lab now uses the standard `shell-bar` (Core Dark, Ping-red gradient rule, TW logo, brand, REAL/DEMO badge, pill tab nav with `aria-current`, TopMenu right-aligned, 1100px page frame). `check-ui-patterns --app token-workbench-LAB`: P1/P3 clean; the old `.top` header is gone.
- `web/src/standalone-ui.css` is byte-identical to canonical `shared/standalone-ui.css` (pin `165e9741` in scripts/standalone-ui.sha256); the lab-local button-gradient rule that had snuck into a previous commit was moved to `web/src/app.css`. `scripts/check-ui-standard.sh` OK for this lab.

## 3. Fleet convergence — done this session

- **top-menu token fix** (`a7a52ac`, merged to main; an identical PR #234 landed remotely and was reconciled): canonical `top-menu.css` reads `--surface-2`/`--text` instead of the hex palette; help button without href renders a button. This cleared the false P10 failures on 43 enforced pages.
- **All 90 vendored copies re-vendored** (`scripts/check-top-menu.sh`: 180/180 OK). Some `~/Development/<name>` labs are orphaned worktrees (`.git` file → deleted parent); their files are updated on disk but cannot be committed there.
- **privilege-check shared component** (`shared/privilege-check/`): buttons read shared tokens (P10), new opt-in `primaryRetry` prop (P9: page's one primary is unique; opted in per page in agent-registry, hostile-a2a, privilege-demo).
- **UI checker**: `node scripts/check-ui-patterns.mjs` → `367 pages ... 43 enforced (0 failing)`. Advisory drift (316 pages) remains: legacy headers, P3 frame, etc.
- **mcp-demo-client-privilege-LAB**: inline styles moved to `.top-menu--framed` classes / `data-font-step`; `public/top-menu.css` re-vendored.
- **Meta-repo** `curtismu7/AI-DEMO-Standalone` main pushed through `d8092e9` (pin bumps for the 5 touched labs; `f20aa7c` from another session is included). Submodule pins bumped: token-workbench, agent-registry-demo, hostile-a2a, privilege-demo, mcp-demo-client-privilege.
- `shared/check-ui-standard.sh` gained a Rule 24 advisory check (no hand-rolled JSON panes); lab-proxy nginx gained the returnTo prefix rebuild for sign-in callbacks.

## 4. OPEN — what remains

1. **62 labs still on legacy headers** (advisory P1): token-workbench is the exemplar; batch-convert with the allowlist in `scripts/ui-pattern-converted.txt`. Big job, no deadline.
2. **P9-style advisory** on other pages; fix in the PR that touches the page (family rule).
3. **Orphaned worktree labs** (`~/Development/gateway-claims-lab-node26`, `cimd-lab-node26`, `session-lab-node26` — `.git` files point at deleted repos like `~/Development/cimd-lab`): their top-menu updates are on disk only. Recreate the parent repo or re-clone to commit.
4. **Unrelated WIP left untouched**: other labs' modified submodule state in the meta repo (other sessions' work — do not bump those pins). `.wt-attr/` untracked clutter in the meta repo.
5. **~47 other labs** show modified submodule state only because of the canonical top-menu/stylesheet drift; bump their pins opportunistically when their sessions next touch them (or in a dedicated sweep PR).
6. **Hosted (SE-mock) build**: sign-in is `hosted ? null` in `/api/info` — it does not appear on the hosted build by design (rule 18). If hosted sign-in is ever wanted, that gate is the place.
7. **PF client state**: `<the PF client id from .env>` config on ai-demo-pingfederate is runtime state (docker container), not in any repo. If that container is recreated, re-apply: grants AUTHORIZATION_CODE+REFRESH_TOKEN, redirect `https://<PF host>:8443/token-workbench/auth/callback`, `allowAuthenticationApiInit=true`, `clientAuth.type=SECRET` with the lab's `.env` secret.
