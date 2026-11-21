# Agent Registry Mock LAB

Tier: Demo. A guided mock of the Agent Registry: register, grant, cap and revoke an agent key, with the gateway refusal each change produces.

## Run and test

```sh
npm ci
npm start          # http://127.0.0.1:7839 (Docker publishes the same port on 127.0.0.1 only)
npm test
```

## What is simulated

**Mock only.** Everything runs offline inside this app. There is no Privilege tenant, no gateway, no token and no sign-in behind the screens; every value is sample data and every screen says so. The banner at the top of the page and the "Demoing" caption on every guided step name what the step demonstrates. Related full labs: agent-registry-demo-LAB (full lifecycle), agent-kill-switch-LAB (caps and revocation).
