# ping-log-collector

A local Vector 0.50.0 collector. It ships the logs of the local Ping containers
to Elasticsearch in the `ping-logs-<ping_product>` indexes. It runs on OrbStack
(`docker --context orbstack`), has a read-only root filesystem and publishes no ports.

## What it reads

| Source | How | `ping_product` | `ping_component` |
|---|---|---|---|
| `$PING_PF_CONTAINER` stdout (the image tails `/opt/out/instance/log/*.log` as `<path>:  <line>`) | Docker socket, own `docker_logs` source `ping_pf` with `multiline` (a line with PF's timestamp starts an event, the lines after it, such as parameter dumps and stack traces, are joined to it) | `pingfederate` | `server`, `audit`, `admin`, `admin-api` (from the file prefix) |
| `$PING_GATEWAY_CONTAINER` stdout (logback) | Docker socket (`docker_logs` source `ping_docker`) | `pinggateway` | `server`, or `access-audit` / `mcp-audit` for JSON audit lines |
| Privilege gateway `cyonproxy.log` (container `$PING_PRIVILEGE_GW_CONTAINER`, volume `$PING_PRIVILEGE_GW_LOG_VOLUME`, path `/var/log/procyon/cyonproxy.log`) | volume mounted read-only, `file` source, current file only, reads from the end on first start | `privilege-gateway` | `gateway` |

Today only PingFederate `server.log` (and `init.log`) reach stdout. `admin.log`,
`admin-api.log` and `audit.log` are handled, but nothing sends them yet.

## The AI-DEMO2 and lab containers (`demo-logs-*`)

A second pipeline (`demo_docker`, `normalize_demo`, `elasticsearch_demo`) reads eight containers that are not Ping products and writes them to
`demo-logs-<service>`, so the `ping-logs-<ping_product>` indexes stay Ping-only. The containers are matched by name prefix and have fixed
names: `lab-proxy-lab-proxy-1` (service `lab-proxy`), `procyon-nodesensor`, and the AI-DEMO2 services `ai-demo-mcp-gateway`,
`ai-demo-llm-proxy`, `ai-demo-authz-server`, `ai-demo-mcp-server`, `ai-demo-mcp-weather` and `ai-demo-hitl-service` (service name without the
`ai-demo-` prefix). A container that is not running is simply absent.

They get exactly the same masking as the Ping pipeline (a test keeps the two blocks identical), then these fields: `@timestamp` (Docker's
per-line time), `demo_service`, `host` (the container), `environment` (`local`), `event_kind` (`runtime`), `message`, and `level` only when the
line has a JSON `level` or a logfmt `level=` (never guessed from words). Document id: SHA-256 of the container, Docker's per-line time and the raw line.

The key in `PING_LOGS_ES_APIKEY` must be allowed to write `demo-logs-*` as well as `ping-logs-*`. Run `./make-write-key.sh` (you run it; it needs
the Elasticsearch port-forward and the password of a user that may create keys, typed hidden or read from a cluster Secret) to make a
write-only key for both families and save it as `PING_LOGS_ES_APIKEY` in `~/Development/.env` (the shared settings file the collector gets its URL and key from); then recreate the collector with `docker --context orbstack compose --env-file $HOME/Development/.env --env-file .env up -d --force-recreate`. Reading is a separate,
read-only key (observability-LAB's `scripts/make-read-key.sh`).

## What it writes

Each event has these fields: `@timestamp`, `ping_product`, `ping_component`,
`event_kind` (`admin` for PingFederate admin and admin-api lines, otherwise
`runtime`), `environment` (`local`), `host` (the container name), `message`, and
where a line can be parsed, `level`, `logger`, `thread`, `route`, `request_id`
(PingFederate `tid`), `log_file`. JSON audit lines also get `audit`, `event_type`
and `user`.

Before any parsing it masks the values of Authorization, Proxy-Authorization,
Cookie, Set-Cookie and X-Api-Key headers, `Bearer` and `Basic` credentials,
`sk-` keys, JWTs and PingFederate `Cookie{...}` dumps. It also replaces with `***`
the values of `client_secret`, `password`, `client_assertion`, `refresh_token`,
`access_token`, `id_token`, `subject_token`, `actor_token`, `assertion` and
`code_verifier` (same-line `name: value`, `name=value`, JSON, and PingFederate's
multi-line parameter dumps where the value is on the next indented line), and of
`code` as a query, form or JSON parameter.

Document id: SHA-256 of the container, the Docker per-line timestamp (the file
and byte offset for `cyonproxy.log`) and the raw line, so two events with the
same text get two documents. PingFederate `admin.log`, `admin-api.log`,
`audit.log` and `init.log` lines leave the timestamp out, because the image
replays their last lines with new Docker times when it starts.

Sink: Elasticsearch `_bulk` with `create` into `ping-logs-{{ ping_product }}`,
`Authorization: ApiKey ${PING_LOGS_ES_APIKEY}`, healthcheck off, and a disk
buffer of about 256 MiB (the smallest size Vector allows) in the `vector-data` volume.

## Environment

| Variable | Meaning |
|---|---|
| `PING_LOGS_ES_URL` | Elasticsearch URL as seen from the container, for example `http://host.docker.internal:9200` with a port-forward running on the Mac |
| `PING_LOGS_ES_APIKEY` | The encoded Elasticsearch API key. It needs `create_doc` (and `create_index`, or a template) on `ping-logs-*` |
| `PING_PF_CONTAINER` | PingFederate container name (Docker matches by name prefix) |
| `PING_GATEWAY_CONTAINER` | PingGateway container name |
| `PING_PRIVILEGE_GW_CONTAINER` | Privilege gateway container name, written to the `host` field of its events |
| `PING_PRIVILEGE_GW_LOG_VOLUME` | External Docker volume that holds the Privilege gateway `/var/log/procyon` |

Copy `.env.example` to `.env` and fill them all in. Compose will not start without them.

## Start and stop

```sh
kubectl --context <context> -n <namespace> port-forward pod/<elasticsearch-pod> 9200:9200   # separate terminal
cp .env.example .env    # then fill in the API key and the container names
docker --context orbstack compose up -d
docker --context orbstack compose logs -f vector
docker --context orbstack compose down        # stop (keeps checkpoints + buffer)
docker --context orbstack compose down -v     # stop and drop the vector-data volume
```

The `$PING_PRIVILEGE_GW_LOG_VOLUME` volume is external. `down -v` does not remove it.

## Check the config

```sh
docker --context orbstack run --rm --read-only -e PING_LOGS_ES_URL=http://x:9200 -e PING_LOGS_ES_APIKEY=x \
  -e PING_PF_CONTAINER=pf -e PING_GATEWAY_CONTAINER=gw -e PING_PRIVILEGE_GW_CONTAINER=pgw \
  -v "$PWD/vector.yaml:/etc/vector/vector.yaml:ro" timberio/vector:0.50.0-alpine \
  validate --no-environment /etc/vector/vector.yaml
```

The file also holds Vector unit tests for the demo pipeline (masking, service name, level). Run them with the same command and `test` in place of `validate`.
Do not put a dollar sign in a comment: Vector reads variables inside comments too.

`validate --no-environment` does not compile the VRL. To catch VRL errors, run
the pipeline against a console sink.
