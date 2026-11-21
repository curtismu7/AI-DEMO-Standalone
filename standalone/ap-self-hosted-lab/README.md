# Self-Hosted Agents Mock LAB

Tier: Demo. A guided mock of Self-Hosted Agents: a sensor discovers a shadow agent on a host and a Shadow AI policy stops it.

## Run and test

```sh
npm ci
npm start          # http://127.0.0.1:7842 (Docker publishes the same port on 127.0.0.1 only)
npm test
```

## What is simulated

**Mock only.** Everything runs offline inside this app. There is no Privilege tenant, no gateway, no token and no sign-in behind the screens; every value is sample data and every screen says so. The banner at the top of the page and the "Demoing" caption on every guided step name what the step demonstrates. Related full labs: federated-identity-LAB (sensor section), mcp-discovery-LAB.
