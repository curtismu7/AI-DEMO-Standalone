#!/bin/bash
# Owner-run: map every lab to its local.ping-devops.com name and restart the labs with LAB_ALLOWED_HOSTS.
# Idempotent. Sudo needed for /etc/hosts.
set -e
LABS="pingone-lab pingfederate-lab privilege-demo ciba-hitl gateway-claims cimd"
# 1. /etc/hosts
for n in $LABS; do
  grep -q "$n.local.ping-devops.com" /etc/hosts || echo "127.0.0.1 $n.local.ping-devops.com" | sudo tee -a /etc/hosts > /dev/null
done
echo "/etc/hosts updated"
# 2. lab .env files: allow the domain
declare -A DIRS=( [pingone-lab]=~/Development/pingone-lab [pingfederate-lab]=~/Development/pingfederate-LAB [privilege-demo]=~/Development/privilege-demo-LAB [ciba-hitl]=~/Development/ciba-hitl-lab [gateway-claims]=~/Development/gateway-claims-LAB [cimd]=~/Development/cimd-LAB-build )
for n in $LABS; do
  f="${DIRS[$n]}/.env"
  [ -f "$f" ] || continue
  grep -q "LAB_ALLOWED_HOSTS" "$f" || echo "LAB_ALLOWED_HOSTS=$n.local.ping-devops.com,local.ping-devops.com" >> "$f"
done
echo "env files updated"
# 3. point each lab at the shared wildcard cert (LAB_TLS_CERT/KEY env names differ per lab; pingone uses P1LAB_*, pf uses PFLAB_*)
echo "next: set each lab's TLS cert to shared/tls/local.ping-devops.com-wild.pem and docker compose up -d --force-recreate"
