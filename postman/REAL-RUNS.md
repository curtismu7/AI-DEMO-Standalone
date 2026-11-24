# Real runs — which collections hit real Ping products, and what each needs

The lab collections call **the lab server**, and each lab has a Mock/Real toggle
(rule 19). So "real" is usually **not** a different collection — it is the same
collection against a lab that is in real mode, with the environment filled from the
owner's shared settings. Four collections are real-only (they talk straight to a Ping
product and skip the lab entirely); they live in `ping-postman-packages`.

**Secrets rule:** filled live environments (`postman/<slug>.live.environment.json`) are
git-ignored — never commit them. The committed `*.live.environment.example.json` files
are placeholders.

---

## The one fill command

```bash
cd ~/Development/AI-DEMO-Standalone/standalone/<lab>
node ../../shared/postman/fill-env.mjs --spec postman/spec.json
# reads ~/Development/.env, writes postman/<slug>.live.environment.json (git-ignored)
```

It fails loudly listing any key missing from `~/Development/.env`. Then import that
environment into Postman (it appears beside the example), select it, run.

---

## Per-lab: real mode, what to set, where the secret lives

### Real-capable via fill-env + the lab's mode toggle

| Lab | Env keys (spec → shared .env) | Also needed |
|---|---|---|
| **cimd-LAB** | `PF_BASE_URL` ← `PF_URL`; `CIMD_CLIENT_ID_URL` ← `HOSTED_CIMD_URL`; `CIMD_REDIRECT_URI` ← `HOSTED_CIMD_URL` | A CIMD document allowlisted in PingFederate (the hosted lab serves it); Direction 1 folder runs real |
| **id-jag-standalone-LAB** | `PF_URL`, `PF_EXCHANGE_CLIENT_ID`, `PF_EXCHANGE_CLIENT_SECRET`, `ID_JAG_RESOURCE`, `RESOURCE_AS_ISSUER`, `RESOURCE_AS_CLIENT_SECRET`, `MCP_URL` | The idjag-* PF objects pre-created (see `IDJAG-SE-Package/SETUP-LOG-SE-PF.md`); the pi.flow folder needs a browser-assisted sign-in first — Postman covers the exchange/redeem/MCP calls |
| **token-workbench-LAB** | `PINGONE_ENVIRONMENT_ID` ← `PINGONE_ADMIN_ENV_ID`, `PINGONE_CLIENT_ID`, `PINGONE_CLIENT_SECRET`, `PINGONE_REGION` | The lab's Real toggle on (owner opt-in); mints a real client_credentials token |
| **mcp-resource-server-LAB** | `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`, `MCP_RESOURCE_SERVER_RESOURCE_URI` (optional) | Lab in real mode; tokens must carry the configured `aud` |
| **privilege-api-explorer-LAB** | `PRIVILEGE_EXPLORER_MODE=real` | The lab's saved console connection (origin, `x-api-key`/`x-api-secret`); writes still gated by the lab's own switch |

### Real via the lab server's own settings (collection unchanged)

These labs read real credentials from `~/Development/.env` **on the server side** —
the Postman collection is identical in both modes; you flip the mode and the same
requests hit real Ping:

| Lab | Flip to real | Real target |
|---|---|---|
| **obo-lab-LAB** | lab reads `OBO_LAB_*` (PingOne env, Worker app, person token) from `~/Development/.env`; toggle via `POST /api/mode {"source":"real"}` or the header button | Real PingOne OBO exchange via the Worker app; token bodies stay server-side, Worker secret never displayed |
| **workload-identity-LAB** | lab reads the SE PingFederate + Privilege gateway settings from `~/Development/.env`; toggle in the header | Real SE PF federated-identity mint + Privilege gateway call chain |

### Mock-only by design (no real run exists — do not "fix" these)

| Lab | Why |
|---|---|
| **stolen-token-LAB** | Attacking a real API with a stolen token is not a demo you run against production; the defences are the lesson, and the lab's mock gateway exists to be attacked |
| **mock-authorize-LAB** | The mock authorization server IS the lab; point it at a real AS and it would be a different lab |
| **wimse-lab-LAB** | No WIMSE issuer exists as a product yet; the lab mints with its own key by design |
| **session-LAB** | The cookie/MFA/widget story needs browser-assisted pi.flow collectors Postman cannot complete; the collection covers the read surface and the mode-refusal contract |
| **intent-par-inspector-LAB**, **delegation-lab-LAB**, **gateway-claims-LAB**, **pf-array-claims-LAB**, **mcp-gateway-lab-LAB**, **p1-third-party-exchange-LAB**, **ciba-approval-sequence-LAB**, **saas-access-LAB** | The lab's simulated engine is the subject (intent rules, consent chain, claims mapping, gateway policy, vendor JWT profiles, sequence story, live platforms). Real counterparts exist elsewhere: real PAR + real PingOne exchange ride inside the id-jag/token-workbench real modes; **real CIBA is proven and documented in [REAL-CIBA-RUN.md](REAL-CIBA-RUN.md)** (via pingfederate-LAB + `ciba-backchannel/`); real SaaS is `salesforce-privilege-LAB` |

---

## Real-only collections (skip the lab, straight to the product)

In `curtismu7/ping-postman-packages`:

| Collection | Real target | Secrets to set |
|---|---|---|
| `pf-admin-config/` + `use-cases/pf-admin/*` | PingFederate Admin REST API | `admin_pass` (Administrator) |
| `ciba-backchannel/` + `use-cases/ciba/*` | PingFederate/PingOne CIBA endpoints | `ciba_b64` = base64(client_id:client_secret) of a CIBA-enabled client; the approval is a human on a device |
| `idjag-se-package/` | PingFederate 13.1+ ID-JAG, full setup + demo | `admin_pass` for setup; demo client secrets created by the setup run |
| `privilege-cimd/` | Privilege console CIMD door | console origin + credentials in the environment |
| `labs/<lab>/` | The lab-fleet collections (see tables above) | per-lab live env from fill-env |

## Provenance check

The one-big import (`postman/all-labs.postman_collection.json`) mirrors every lab
folder. After changing any `spec.json`: regenerate in the lab, then
`node shared/postman/generate-all.mjs` re-mirrors and re-merges (see `postman/README.md`).
