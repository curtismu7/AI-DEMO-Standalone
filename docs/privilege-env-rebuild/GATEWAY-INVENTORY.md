# Gateway inventory and naming (decided 2026-11-23)

Scheme: **`mcpgw-<where>-<role><n>`**. Names never contain a PingOne environment name, because the environment behind a gateway changes (`pingid` became `Pingid-privilege` within a week).

- **where**: `cm` = namespace `ping-devops-cmuir`, `ct` = namespace `ping-devops-curtismuir`, `local` = the owner's Mac.
- **role**: `lb` front door, `pool` behind the load balancer and takes traffic, `spare` running but parked, `dev` development or demo gateway outside the pool, `retired` old-tenant gateway scaled to 0.
- Cluster ID in the console for every node of the new tenant: **`ai-demo-cmuir`** (it is the mesh cluster of all 31 apps; it cannot change after registration). Individual nodes are told apart by the names below, not by cluster ID.

Kubernetes labels `ping.demo/gateway`, `ping.demo/where`, `ping.demo/role` and annotation `ping.demo/purpose` are set on each Deployment. List them:
`kubectl get deploy -A -l ping.demo/gateway -o custom-columns='NS:.metadata.namespace,DEPLOY:.metadata.name,NAME:.metadata.labels.ping\.demo/gateway,ROLE:.metadata.labels.ping\.demo/role'`

| Name | Where | Role | What it does | Helm release / deployment | Public host | HAProxy backend today | Image |
|---|---|---|---|---|---|---|---|
| `mcpgw-lb` | ct | lb | HAProxy front door for `mcpgw.ai-demo…`; used by AI-DEMO2 and the labs on that host | `mcpgw-lb` (part of release `agentless-mcpgw`) | `mcpgw.ai-demo.ping-devops.com` | n/a | haproxy 3.2 |
| `mcpgw-cm-pool1` | cm | pool | Takes traffic; primary for AI-DEMO2 and `privilege-gateway-client-LAB` | `agentless-mcpgw-pingid` | `mcpgw-pingid.ai-demo…` | `mcpgw-cm-pool1` | v1.261127 |
| `mcpgw-ct-pool2` | ct | pool | Takes traffic; used by `spiffe-issuer-LAB` | `agentless-mcpgw-pingid` | `mcpgw-pingid3.ai-demo…` | `mcpgw-ct-pool2` | v1.261127 |
| `mcpgw-ct-new1` | ct | pool | Takes traffic; the node behind `mcpgw.ai-demo…` directly. Its Deployment still carries the old label `mcpgw-ct-retired1` / role `retired` (label drift, harmless; fix with the next chart change) | `agentless-mcpgw` / deploy `agentless-mcpgw` (1 replica; the same release also owns `mcpgw-lb` and its ConfigMap) | `mcpgw.ai-demo…` | `mcpgw-ct-new1` | v1.261127 |
| `mcpgw-cm-spare1` | cm | spare | Parked out of the pool, kept for migration; no lab uses its host. Still on the old tenant `4cb38c18` | `agentless-mcpgw-pingid2` | `mcpgw-pingid2.ai-demo…` | `mcpgw-cm-spare1` (disabled) | v1.261120 |
| `mcpgw-cm-nyl` | cm | dev | NYL demo build, outside the pool | `agentless-mcpgw2` / deploy `agentless-mcpgw` | `mcpgw2.ai-demo…` | none | v1.261120 (read live 2026-11-27) |
| `mcpgw-local-dev` | local | dev | **Dropped 2026-11-23.** Local Docker gateway; the hosted shared gateways are used instead. Its node was removed (volumes and backups kept) | compose in `~/Development/pingid-gateway` (stack stopped) | `pingid-gw.local.ping-devops.com:8723` (redirect removed from the shared OIDC app) | none | digest of v1.261120 when stopped |
| `mcpgw-ct-retired2` | ct | retired | Old-tenant gateway 3, scaled to 0, enrolment kept | `agentless-mcpgw3` | none | none | v1.261112-NYLb |

**New-tenant nodes (`5bfb4e12`): three, `mcpgw-cm-pool1`, `mcpgw-ct-pool2` and `mcpgw-ct-new1`** (all in the HAProxy pool, all v1.261127). `mcpgw-cm-spare1`, `mcpgw-cm-nyl` and `mcpgw-local-dev` are not moved to the new tenant. The retired `mcpgw-ct-retired1` of the first version of this table is the same Deployment that now runs as `mcpgw-ct-new1`.

## Upgrading the gateway image (staged roll, done 2026-11-27: v1.261120 → v1.261127 on pool2, pool1, new1)
Newest tag on `public.ecr.aws/s7q1z8z4/privilege-aigw` was v1.261127; `latest` matched none of the v1.2611xx tags, so **pin the version, never `latest`**. One node at a time, in this order (least traffic first), checking before the next:
1. Backup (mode 600) to `~/.config/demo-kit/backups/gw-<node>-upgrade-<ts>/`: `helm get values -a`, `helm get manifest`, the Deployment yaml (new1 also the `mcpgw-lb-config` ConfigMap). Rollback copies of this roll: `gw-pool2-upgrade-20261127-182332`, `gw-pool1-upgrade-20261127-182830`, `gw-new1-upgrade-20261127-183223`.
2. Values file holding **only** `image.tag` changed from the deployed values. Pin the live `proxyToken` and `replicaCount` when they were set by hand. Never `helm rollback` blindly.
3. `helm upgrade --dry-run=server`, then render and diff against the deployed manifest: it must be one image line.
4. Apply, `kubectl rollout status` (Deployments use strategy Recreate; the PVC `/procyon/ssl` keeps the node identity, so there is no re-enrolment).
5. Test the node's own host directly, before it takes traffic (9 checks per node on 2026-11-27, all passed): health, a keyed call on a door, tool list, a bad key refused with 401, and the like.
6. Promote in HAProxy at once, or the restarted backend stays out for about 10 minutes: `echo "set server gateways/<backend> health up" | nc 127.0.0.1 9999` in each `mcpgw-lb` pod.
Helm revisions made: pool2 → 6, pool1 → 15, new1 (release `agentless-mcpgw`) → 111. New in this image: a `ShadowAIPolicyService ... Unimplemented` log line at start; cosmetic, no effect on traffic. **Not yet re-tested on v1.261127:** a held (human-in-the-loop) call end to end, because it sends a phone push. **spare1 and nyl stay on v1.261120** (no decision to upgrade them). **Drift risk:** AI-DEMO2 `pingone-privgateway-helm-main/agentless/gateway1-lb.values.yaml` still pins `image.tag: v1.261120` (and `docker-compose.yml` an older digest); a `helm upgrade` of release `agentless-mcpgw` from that overlay would downgrade new1. Update the overlay in an AI-DEMO2 PR before the next upgrade from it.

## Sign-in client (read live 2026-11-27; the 2026-11-25 decision is not what runs)
The decision of 2026-11-25 was that every gateway uses the PingOne app **`1bd04cae` "PingOne Privilege"** (the Privilege tenant's own OIDC app), which holds a callback for each active node host (`mcpgw.ai-demo…`, `mcpgw-pingid.ai-demo…`, `mcpgw-pingid3.ai-demo…`). **Reading `oidc.clientId` from each release on 2026-11-27 shows a mix: pool1 and pool2 use `1bd04cae`, but `mcpgw-ct-new1` (release `agentless-mcpgw`) uses `d8fbd995` `mcpgw-oidc`** (shared-host callback only). This is a record of what runs, not a diagnosed fault; browser sign-in through each client was not re-tested for this note. Open question for the owner: move new1 to `1bd04cae` (as decided), or keep `d8fbd995` and drop the decision. Do not delete `d8fbd995` while new1 uses it. **Before re-enrolling `mcpgw-cm-spare1` (it still carries the old-tenant app `33bb98ce` in its OIDC Secret): add `https://mcpgw-pingid2.ai-demo…/callback` to `1bd04cae`, then point spare1's `agentless-mcpgw-pingid2-oidc-config` Secret at `1bd04cae` with the new tenant's URLs.**

## HAProxy backend renaming (done in the live ConfigMap before 2026-11-27)
The live `mcpgw-lb-config` already names its backends `mcpgw-ct-new1`, `mcpgw-cm-pool1`, `mcpgw-cm-spare1` (disabled) and `mcpgw-ct-pool2`, and its state-strip line has one `regsub(~<name>,,g)` per node plus the legacy names. The section below is the original plan, kept for the reasoning; check the AI-DEMO2 chart and `gateway1-lb.values.yaml` match the live names before the next `helm upgrade` of `agentless-mcpgw`.

## Original rename plan (needs a chart change)
The HAProxy backend names (`gateway-pingid-1/2/3`, `gateway-old-1`) were generated by the chart `pingone-privgateway-helm-main/agentless/agentless-mcpgw/templates/loadbalancer-haproxy.yaml` from `loadBalancer.peers[].name`. The OAuth callback strips the node tag from `state` with a regex hard-coded in the template: `regsub(~gateway-[0-9]+,,g)`. **Renaming the backends without changing that regex breaks logins through `mcpgw.ai-demo…`.** The change is: make the regex generic (for example `~[A-Za-z0-9_-]+` after the `~`), rename the peers in `gateway1-lb.values.yaml`, render with `helm template`, diff against the live ConfigMap, then apply. It is an AI-DEMO2 repo change, so it goes through a worktree, a PR and a review. Do not hand-edit the live ConfigMap names.

Target backend names: `gateway-pingid-1` → `mcpgw-cm-pool1`, `gateway-pingid-3` → `mcpgw-ct-pool2`, `gateway-pingid-2` → `mcpgw-cm-spare1`, `gateway-old-1` → `mcpgw-ct-retired1`.

Hostnames: add the new names next to the old ones (`mcpgw-cm-pool1.ai-demo…`, and so on) as extra ingress hosts and certificate names, then move labs over, then retire the old hosts. Helm release names stay as they are unless a gateway is reinstalled anyway.

**PingID:** present in `5bfb4e12` (the earlier "not migrated" note applied to `ea040334`, now deleted). Startup MFA there completes by PingID Mobile push; see the handoff `HANDOFF-2026-11-24-state-after-replay.md`.
