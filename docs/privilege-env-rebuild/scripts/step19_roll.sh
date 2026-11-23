#!/usr/bin/env bash
# Roll one gateway deployment onto the rotated Redis URL and prove it: new pod ready, URL env holds the NEW password (compared by value, never printed),
# no Redis auth errors in its log, its public host answers. usage: step19_roll.sh <namespace> <deployment> <container> <host>
set -uo pipefail
NS=$1; DEP=$2; CT=$3; HOST=$4
NEW=$(cat ~/.config/demo-kit/redis-rotation-20261123/new-password)
kubectl -n "$NS" rollout restart deploy/"$DEP" >/dev/null && kubectl -n "$NS" rollout status deploy/"$DEP" --timeout=300s | tail -1
pod=$(kubectl -n "$NS" get pods --no-headers | awk -v n="$DEP" '$1 ~ "^"n"-[a-z0-9]+-[a-z0-9]+$" && $3=="Running" {print $1; exit}')
echo "pod: $pod"
has_new=$(kubectl -n "$NS" exec "$pod" -c "$CT" -- sh -c 'env | grep -i redis' 2>/dev/null | grep -c -F -- ":$NEW@")
echo "redis URL env in pod holds the NEW password: $([ "$has_new" -ge 1 ] && echo yes || echo NO)"
sleep 25
echo "redis auth errors in log since start: $(kubectl -n "$NS" exec "$pod" -c "$CT" -- sh -c 'tail -n 400 /var/log/procyon/cyonproxy.log | grep -a -i -c -E "WRONGPASS|NOAUTH|invalid password|redis.*(auth|refused|error)"' 2>/dev/null)"
for i in 1 2 3; do printf "host %s -> " "$HOST"; curl -sk -m 15 -o /dev/null -w "%{http_code}\n" "https://$HOST/opensearch/mcp/"; sleep 3; done
