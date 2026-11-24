# Real CIBA run — proven working (2026-11-23)

Real Client-Initiated Backchannel Authentication against the local PingFederate
(`local.ping-devops.com:9031`), approved through `pingfederate-LAB`'s web-approver
channel. The whole chain ran green: `bc-auth.ciba` issued a real `auth_req_id`, the
approval flipped PingFederate's poll, and the token endpoint returned real RS256 tokens
(767-char access token, `iss=local.ping-devops.com:9031`, `sub=demouser`).

This file records the exact setup so it survives a reboot.

---

## 1. The pieces

| Piece | Where | What it does |
|---|---|---|
| PingFederate + CIBA client `pfLab-ciba` | `ai-demo-pingfederate` container (admin 9999 / runtime 9031) | runs CIBA itself: issues `auth_req_id`, asks the approver, decides the poll |
| Web-approver plugin `pfLabCibaWebApprover` | PF config | points PF at `https://local.ping-devops.com:5400/api/ciba-approver` |
| **pingfederate-LAB** (host-run) | `standalone/pingfederate-LAB`, port 5400 | answers PF's approver calls; the human approves on its CIBA card |
| Client secret | `~/.config/demo-kit/pingfederate-lab/pingfederate.json` → `values.ciba.clientSecret` | PF stores secrets write-only; the lab's settings file holds it |

The CIBA-enabled client lives on the AI-DEMO2 PingFederate (`pfLab-ciba`, grant `CIBA`,
request policy `aiDemoPfCibaPolicy`). Check with:

```
GET https://local.ping-devops.com:9999/pf-admin-api/v1/oauth/clients/pfLab-ciba
```

## 2. Start pingfederate-LAB with TLS + the PF-reachable name (the two fixes)

PF calls the approver over **https** (plugin config) and from **inside the container**,
so the lab must serve TLS and answer to `local.ping-devops.com` — loopback-only binds
get 403/TLS errors. From the lab repo:

```bash
cd ~/Development/AI-DEMO-Standalone/standalone/pingfederate-LAB

LAB_ALLOWED_HOSTS=local.ping-devops.com \
LAB_TLS_CERT=$HOME/Development/AI-DEMO2/certs/api.ping.demo+2.pem \
LAB_TLS_KEY=$HOME/Development/AI-DEMO2/certs/api.ping.demo+2-key.pem \
npm start
```

The mkcert cert already covers `local.ping-devops.com`. Without these flags PF's
approver call fails with `could not reach the approval service` (plain http) or 403
(host guard). If port 5400 is held by an old instance: `lsof -tiTCP:5400 | xargs kill`.

Verify PF can reach the lab from inside the container:

```bash
docker exec ai-demo-pingfederate sh -c \
  "curl -sk -m 3 -o /dev/null -w '%{http_code}' https://local.ping-devops.com:5400/api/ciba-approver/requests"
# 404 is correct (GET on a POST route) — it proves TLS + host guard are fixed
```

## 3. The client secret

PingFederate never returns it (write-only). It is stored in the lab's settings file:

```
~/.config/demo-kit/pingfederate-lab/pingfederate.json  →  values.ciba.clientSecret
```

Build the Basic auth value Postman needs:

```bash
python3 - <<'EOF'
import json, base64, os
d = json.load(open(os.path.expanduser('~/.config/demo-kit/pingfederate-lab/pingfederate.json')))
c = d['values']['ciba']
print(base64.b64encode(f"{c['clientId']}:{c['clientSecret']}".encode()).decode())
EOF
```

A filled live environment already exists (git-ignored):
`ping-postman-packages/ciba-backchannel/ciba.live.environment.json` — import that into
Postman and select it.

## 4. Two ways to run it

### A. The lab's card flow (recommended — includes the human approval hop)

```bash
# start (the lab calls real bc-auth.ciba; returns state pending + a trace of the wire)
curl -sk -c /tmp/ciba-cookies.txt -X POST https://127.0.0.1:5400/api/cards/ciba/start \
  -H 'content-type: application/json' \
  -d '{"loginHint":"demouser","bindingMessage":"APPROVE-4821"}'

# the human approves (real decision through PF's web-approver channel)
curl -sk -b /tmp/ciba-cookies.txt -X POST https://127.0.0.1:5400/api/cards/ciba/decision \
  -H 'content-type: application/json' -d '{"decision":"approve"}'

# poll — real token endpoint; state becomes "approved" with the tokens
curl -sk -b /tmp/ciba-cookies.txt -X POST https://127.0.0.1:5400/api/cards/ciba/poll \
  -H 'content-type: application/json' -d '{}'
```

The same three calls are runnable from Postman against `https://127.0.0.1:5400`.

### B. The raw collection (direct to PF)

Import `ping-postman-packages/ciba-backchannel/CIBA-Backchannel-Flow.postman_collection.json`
+ the filled `ciba.live.environment.json`. ACT 1 issues a real `auth_req_id` — but the
approval for a request initiated *outside* the lab's card flow cannot be approved from
the card (the card only decides on runs it started). For a raw-collection run, approve
on the lab's UI: open https://127.0.0.1:5400, start a CIBA card run with the same
binding message and approve there — then ACT 3's poll gets the tokens.

> Practical consequence: for demos, path A is the complete Postman-ready story;
> the raw collection proves the wire shape of each hop.

## 5. Notes

- `login_hint` (plain username) works; `login_hint_token` must be a real JWT on this
  PF policy — a raw `{"sub":...}` JSON string is refused.
- The auth_req_id expires in 120s (policy default); the poll interval comes back in the
  initiation response (3s here).
- The collected cookies (`/tmp/ciba-cookies.txt`) are the lab session — keep them for
  the decision/poll calls.
- `ciba-approval-sequence-LAB`'s `409 real_not_configured` is unaffected: that lab is
  the diagram story; its real mode is a contract placeholder, not a wiring gap.
