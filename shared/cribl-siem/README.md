# cribl-siem: Cribl Stream between Privilege's SIEM feed and Elasticsearch

Privilege's SIEM setting sends console audit events to an Elasticsearch URL (see `AI-DEMO2/privilege/GATEWAY-LOGGING-WITH-ELASTICSEARCH.md`).
This puts Cribl Stream at that URL. Cribl masks secrets in the events, then always writes them to the index `ping-siem-events-v2` (where the existing history is; Privilege's sender itself names `audit-log`, which Cribl overrides),
in the same Elasticsearch (`elasticsearch-siem`, namespace `ping-devops-curtismuir`, context `us`).

```text
Privilege cloud --HTTPS, basic auth--> cmuir-cribl.ping-devops.com --> Cribl (in_elastic -> siem_mask -> es_siem) --> elasticsearch-siem:9200
```

## Credentials

Two separate logins, each in its own Secret in `ping-devops-curtismuir` (created by hand, never in git, values never printed):

| Secret | Used for | Keys |
|---|---|---|
| `cribl-siem-privilege-login` | What the **Privilege SIEM form** signs in to Cribl with (Username and password) | `username` (`privilege`), `password` (random) |
| `cribl-siem-es-writer` | What **Cribl** signs in to Elasticsearch with: user `cribl_siem`, role `privilege_siem_writer` (write on `ping-siem-events*`, cluster `monitor`, no read) | `username`, `password` (random) |

Read the values for the Privilege form on your own machine (the last part copies it to the clipboard instead of printing it):

```sh
kubectl --context us -n ping-devops-curtismuir get secret cribl-siem-privilege-login -o jsonpath='{.data.username}' | base64 -d | pbcopy   # paste into Username
kubectl --context us -n ping-devops-curtismuir get secret cribl-siem-privilege-login -o jsonpath='{.data.password}' | base64 -d | pbcopy   # paste into Password
```

Do **not** use Cribl's own `admin` login in the Privilege form: that is the Cribl UI account, and Cribl rejects it on the Elasticsearch port (the console shows "The token or API key was rejected").
The older Secret `elasticsearch-siem-privilege-credentials` (user `privilege_siem`) no longer matches Elasticsearch's password for that user (401 on 2026-11-24), so nothing here uses it.

## What is proven, and what is not

Proven here (`test/run-local.sh`, 14 checks, run 2026-11-23): Cribl 4.13.0 in front of a mock Elasticsearch refuses missing and wrong credentials (401),
accepts a `_bulk` request, writes it to `ping-siem-events-v2` (even when the sender names `audit-log`) with the writer user's credentials, masks `password`/`*token*`/`*apikey*`/`virtualkey`-style
values in `Data`, `sk-` keys, Bearer values and JWTs, keeps the other fields, and strips Cribl's `_time`. Passwords with `' & \ $` render correctly.
The manifests pass `kubectl apply -k . --dry-run=server` against `us`.

**Not proven: that Privilege's SIEM sender can talk to Cribl.** Cribl's Elasticsearch source only parses `_bulk` requests
(`/_bulk` and `/<index>/_bulk`). A single-document write (`POST /<index>/_doc`) gets `404 could not find parser`, and `PUT /<index>/_doc/<id>`
returns `{}` but is not forwarded. The runbook says a successful Privilege write returns 201, which is what a single-document write returns
(`_bulk` returns 200), so Privilege may use `_doc`. Nobody has captured its request. Also unknown: whether it needs the `X-elastic-product` response header
(Cribl's `GET /` reply does not send it), and which paths its health check calls.

So deployment is step one of a test, not the finish. The console's SIEM health check against Cribl shows the answer:
`kubectl --context us -n ping-devops-curtismuir logs deploy/cribl-siem -c cribl | grep "Could not find parser"` prints the path Privilege used.

If Privilege uses `_doc`: add a small nginx in front of Cribl that rewrites `POST /<index>/_doc` into a `_bulk` body and adds the `X-elastic-product: Elasticsearch` header.
Not built, because it is only worth building against the real request.

## Status

Deployed 2026-11-23 to context `us`, namespace `ping-devops-curtismuir` (owner's go in session). Checked: pod running with no errors, public HTTPS returns 401 without
credentials, the Privilege ingestion user gets 200 from inside the cluster. **The Privilege SIEM URL has not been switched yet**, so no real event has gone through Cribl.
The Cribl destination names its Elasticsearch version (`elasticVersion: '7'`) because the write-only ingestion user is refused on the version check (`GET /`).

## Deploy (changes the shared cluster: needs the owner's go)

```sh
cd shared/cribl-siem
test/run-local.sh                                   # local proof first
kubectl --context us apply -k . --dry-run=server    # then, with the go:
kubectl --context us apply -k .
kubectl --context us -n ping-devops-curtismuir rollout status deploy/cribl-siem
curl -s -u "$USER:$PASS" https://cmuir-cribl.ping-devops.com/ | head -c 200   # Cribl answers like Elasticsearch
```

Then in the Privilege console: SIEM configuration, **Elastic**, set URL to `https://cmuir-cribl.ping-devops.com`, enter the `cribl-siem-privilege-login` username and password (the form has no Index field now), run the health check, **Save Changes**,
and change something small. Check the count (`GET /ping-siem-events-v2/_count`) rises, and that `Data` shows `***` where a key would be.

Open Cribl's UI with `kubectl --context us -n ping-devops-curtismuir port-forward deploy/cribl-siem 9000:9000`, then <http://127.0.0.1:9000>
(`admin` / `admin` at first start: change it). The UI has no Service or Ingress on purpose.

## Test it

1. Health check in the console passes (Cribl logs a `GET /`, `HEAD /audit-log` and a `POST /_bulk`, all 200). That health check writes one event.
2. **Save Changes**, then change something harmless in the console (rename an app description and put it back).
3. Count and read the newest events (needs the Elasticsearch `elastic` login; port-forward `svc/elasticsearch-siem` 9200):
   `GET /ping-siem-events-v2/_search?size=3&sort=@timestamp:desc`. The `cribl_siem` user itself is write-only, so it cannot read.
4. In the newest event, `Data` must show `***` for any password, key or token, and the event has `cribl_pipe: siem_mask`.
5. Cribl's own view: `kubectl --context us -n ping-devops-curtismuir logs deploy/cribl-siem -c cribl | grep "Destination failed"` prints nothing when writes succeed.

## Roll back

Put the previous URL back in the Privilege SIEM form, then `kubectl --context us delete -k .`.

## Notes

- Config is rebuilt from the ConfigMap and Secret on every pod start (`render-config.sh`, in an init container). Changes made in the Cribl UI are lost on restart; change the files here.
- The masking rules are generic: the real field names inside `Data` have not been listed. After the first real events arrive, search `Data` for leftovers
  (`sk-`, `AKIA`, a password) and add a rule to `config/siem_mask.conf.yml`.
- Console housekeeping events (`carts`, `userpreferences`, a third of the feed) are kept. A drop rule would be one function in the pipeline.
- The gateway traffic lines (`LLM request`, `AIGuard`) are a separate feed and are not covered here. Cribl could replace the `log-tailer` sidecar for them too.
- Cribl Stream runs on its free license. Nothing is installed locally: the image is `cribl/cribl:4.13.0` (Docker Hub, pinned).
