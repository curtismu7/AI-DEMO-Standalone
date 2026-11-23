#!/usr/bin/env bash
# Step 09: re-enrol a gateway to the new tenant. Run per gateway, in the window.
#   step09_gateway_cutover.sh check            # validate all token files (prints tenant/cluster only)
#   step09_gateway_cutover.sh upgrade <tag>    # helm upgrade: new token + OIDC + image v1.261120
#   step09_gateway_cutover.sh identity <tag>   # PRINTS the in-pod command the OWNER runs
#   step09_gateway_cutover.sh restart <tag>    # rollout restart + status
#   step09_gateway_cutover.sh verify <tag>     # tenant in log, node stream, door answers
#   step09_gateway_cutover.sh local            # local Docker gateway (all of the above)
# Tags used for the new tenant: cmuir-pingid (mcpgw-cm-pool1)  curtismuir-pingid3 (mcpgw-ct-pool2).
#   Not moved: cmuir-pingid2 (mcpgw-cm-spare1, parked), cmuir-mcpgw2 (mcpgw-cm-nyl), local Docker.
# Token files (owner writes them, mode 600, one line ENV_PROXY_TOKEN=eyJ...):
#   ~/.config/demo-kit/rebuild-gw/token-<tag>.env   and   token-local.env
# EXTRA_HELM_ARGS adds helm flags to `upgrade`, e.g. for curtismuir-pingid3: --set oidc.serverUrl=https://mcpgw-pingid3.ai-demo.ping-devops.com
#   (oidc.serverUrl MUST equal the release's own host, or the chart sets backend-protocol HTTP and conflicts with the live HTTPS ingress annotation).
# Never prints a token or secret: every output passes through mask().
set -euo pipefail
NEW_ENV=$(python3 -I -c 'import json,os;print(json.load(open(os.path.join(os.path.dirname(os.path.abspath("$0")),"..","state.json")))["env_id"])')
CLUSTER=ai-demo-cmuir
IMAGE_TAG=v1.261120
GW=~/.config/demo-kit/rebuild-gw
CHART=~/Development/AI-DEMO2/pingone-privgateway-helm-main/agentless/agentless-mcpgw

mask() { sed -E 's/eyJ[A-Za-z0-9_.=-]{20,}/<JWT>/g; s/((SECRET|TOKEN|PASSWORD|KEY)[A-Z_]*[=:][[:space:]]*)[^[:space:]]+/\1<masked>/Ig'; }

row() { # tag -> namespace release deployment host
  case "$1" in
    cmuir-pingid)       echo "ping-devops-cmuir agentless-mcpgw-pingid agentless-mcpgw-pingid mcpgw-pingid.ai-demo.ping-devops.com" ;;
    cmuir-pingid2)      echo "ping-devops-cmuir agentless-mcpgw-pingid2 agentless-mcpgw-pingid2 mcpgw-pingid2.ai-demo.ping-devops.com" ;;
    curtismuir-pingid3) echo "ping-devops-curtismuir agentless-mcpgw-pingid agentless-mcpgw-pingid mcpgw-pingid3.ai-demo.ping-devops.com" ;;
    cmuir-mcpgw2)       echo "ping-devops-cmuir agentless-mcpgw2 agentless-mcpgw mcpgw2.ai-demo.ping-devops.com" ;;
    *) echo "unknown tag $1" >&2; exit 2 ;;
  esac
}

token_value() { sed -E 's/^[[:space:]]*ENV_PROXY_TOKEN=//' "$1" | tr -d '[:space:]'; }  # whitespace breaks enrolment

check_token() { # file -> prints tenant/cluster/expiry, fails if wrong
  local f=$1
  [[ -f $f ]] || { echo "MISSING $f"; return 1; }
  [[ $(stat -f %Lp "$f") == 600 ]] || { echo "BAD MODE $(stat -f %Lp "$f") on $f (want 600)"; return 1; }
  [[ -n $(token_value "$f") ]] || { echo "EMPTY (no token pasted yet)"; return 1; }
  token_value "$f" | NEW_ENV="$NEW_ENV" CLUSTER="$CLUSTER" python3 -I -c '
import sys,json,base64,time,os
t=sys.stdin.read().strip()
try:
    p=t.split(".")[1]; p+="="*(-len(p)%4); d=json.loads(base64.urlsafe_b64decode(p))
except Exception:
    print("BAD  not a token (wrong text pasted?)"); sys.exit(1)
ten=d.get("tenantName") or d.get("tenant"); cl=d.get("clusterID"); exp=d.get("exp")
left=int((exp-time.time())/60) if exp else None
ok = ten==os.environ["NEW_ENV"] and cl==os.environ["CLUSTER"] and (left is None or left>5)
nt=d.get("nodeType")
print(("OK  " if ok else "BAD ")+"tenant="+str(ten)+" cluster="+str(cl)+" nodeType="+str(nt)+" minutes_left="+str(left))
sys.exit(0 if ok else 1)'
}

pod_of() { kubectl -n "$1" get pods --no-headers | awk -v n="$2" '$1 ~ "^"n"-[a-z0-9]+-[a-z0-9]+$" && $3=="Running" {print $1; exit}'; }

cmd=${1:-}; tag=${2:-}
case "$cmd" in
  check)
    for t in cmuir-pingid curtismuir-pingid3; do printf '%-20s ' "$t"; check_token "$GW/token-$t.env" || true; done ;;
  upgrade)
    read -r ns rel dep host <<<"$(row "$tag")"
    check_token "$GW/token-$tag.env"
    helm -n "$ns" upgrade "$rel" "$CHART" --reuse-values -f "$GW/oidc-new.values.yaml" \
      --set image.tag="$IMAGE_TAG" ${EXTRA_HELM_ARGS:-} --set "proxyToken=$(token_value "$GW/token-$tag.env")" 2>&1 | mask | grep -E "STATUS|REVISION|Error|error" || true
    helm -n "$ns" list --filter "^$rel\$" | mask ;;
  identity)
    read -r ns rel dep host <<<"$(row "$tag")"
    pod=$(pod_of "$ns" "$dep"); c=$(kubectl -n "$ns" get pod "$pod" -o jsonpath='{.spec.containers[0].name}')
    echo "OWNER: run this (moves the old-tenant identity aside, does not delete it):"
    echo "kubectl -n $ns exec $pod -c $c -- sh -c 'cd /procyon/ssl && mkdir -p pre-$NEW_ENV-move && mv proxy-ca.pem proxy-crt.pem proxy-key.pem proxy-token.data pre-$NEW_ENV-move/ && ls'" ;;
  restart)
    read -r ns rel dep host <<<"$(row "$tag")"
    kubectl -n "$ns" rollout restart deploy/"$dep" && kubectl -n "$ns" rollout status deploy/"$dep" --timeout=300s ;;
  verify)
    read -r ns rel dep host <<<"$(row "$tag")"
    pod=$(pod_of "$ns" "$dep"); c=$(kubectl -n "$ns" get pod "$pod" -o jsonpath='{.spec.containers[0].name}')
    echo "pod $pod image: $(kubectl -n "$ns" get pod "$pod" -o jsonpath='{.spec.containers[0].image}')"
    kubectl -n "$ns" exec "$pod" -c "$c" -- sh -c 'ls -la --time-style=+%H:%M /procyon/ssl 2>/dev/null | grep -E "proxy-(crt|key)" ; cat /var/log/procyon/*.log 2>/dev/null | grep -o -E "(tenant [0-9a-f-]{36} compiled [0-9]+ policies|command stream connected|x509[^\"]{0,80}|verification error)" | sort | uniq -c | tail -6' | mask
    echo "new-tenant id seen in logs: $(kubectl -n "$ns" exec "$pod" -c "$c" -- sh -c "grep -c $NEW_ENV /var/log/procyon/*.log 2>/dev/null | awk -F: '{s+=\$2} END{print s+0}'")"
    echo "door probe https://$host/ -> $(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "https://$host/")" ;;
  local)
    check_token "$GW/token-local.env"
    cd ~/Development/pingid-gateway
    cp procyon/config/pingone.env "procyon/config/pingone.env.pre-$NEW_ENV" && chmod 600 procyon/config/pingone.env.pre-*
    install -m 600 "$GW/local-pingone.env" procyon/config/pingone.env
    printf 'ENV_PROXY_TOKEN=%s\n' "$(token_value "$GW/token-local.env")" > procyon/config/proxy-token.env.new && chmod 600 procyon/config/proxy-token.env.new
    echo "OWNER: then run, in ~/Development/pingid-gateway:"
    echo "  mv procyon/config/proxy-token.env.new procyon/config/proxy-token.env"
    echo "  docker run --rm -v pingid-gateway_pingid-mcpgw-ssl:/ssl alpine sh -c 'cd /ssl && mkdir -p pre-$NEW_ENV-move && mv proxy-ca.pem proxy-crt.pem proxy-key.pem proxy-token.data pre-$NEW_ENV-move/'"
    echo "  sed -i '' -E 's#(image: public.ecr.aws/s7q1z8z4/privilege-aigw)[@:][^ ]+#\\1:$IMAGE_TAG#' docker-compose.yml && docker compose up -d" ;;
  *) sed -n '2,12p' "$0" ;;
esac
