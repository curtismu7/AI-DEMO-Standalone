#!/bin/bash
# Checks the one settings file (~/Development/.env, or $STANDALONE_ENV). Prints key names only, never values.
set -u
file="${STANDALONE_ENV:-$HOME/Development/.env}"
status=0
if [ ! -f "$file" ]; then
  echo "MISSING  $file (copy env/standalone.env.template and fill it in)"; exit 1
fi
mode="$(stat -f %Lp "$file" 2>/dev/null || stat -c %a "$file")"
if [ "$mode" != "600" ]; then echo "MODE     $file is $mode, should be 600 (chmod 600)"; status=1; fi
for key in PINGONE_ENVIRONMENT_ID PINGONE_REGION; do
  value="$(grep -E "^$key=" "$file" | tail -1 | cut -d= -f2-)"
  if [ -z "$value" ] || [ "$value" = "REPLACE_ME" ]; then
    echo "MISSING  $key"; status=1
  else
    echo "OK       $key"
  fi
done
for key in PINGONE_ADMIN_CLIENT_ID PINGONE_ADMIN_CLIENT_SECRET VAULT_PASSWORD; do
  if grep -q -E "^$key=" "$file"; then
    echo "FORBID   $key must not be in the shared file (move it to ~/.config/demo-kit/provisioning.json)"; status=1
  fi
done
exit $status
