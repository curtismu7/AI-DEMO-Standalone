# Hosted P1AZ decision proxy: design only (not built)

Status: proposal. Needs owner approval before any build or deploy. The SE k8s builds are deferred (owner, 2026-10-31).

## Problem
Installers run the standalone apps in mock mode. Some want real PingOne Authorize decisions without owning a tenant. A real decision
call needs a worker client id and secret, and the standalone rules keep real tenants and secrets owner-only.

## Proposal
A small service that holds the worker secret and exposes one call: `POST /decide` with `{parameters}`, returning the decision and statements.
Installers never see a credential.

## Requirements
- The worker secret lives only in the service (env or secret store). It is never returned, logged or echoed in an error.
- Only `/decide` and `/api/health` (`demo-health/1`). No policy read or write, no endpoint choice: the service picks the decision endpoint.
- Per-visitor isolation by workspace id: decision logs and rate limits are per workspace, never shared.
- Rate limit per workspace and a global cap, with HTTP 429 and a Retry-After header, so one visitor cannot exhaust PingOne's limits.
- Parameters validated against an allow-list of names and a size cap; unknown names refused.
- A banner on every response page and in the apps: "Hosted and simulated by a shared tenant."
- Apps opt in with an explicit "Hosted P1AZ" mode next to Mock and Real. Mock stays the default.

## Out of scope
Deploying it, any change to the apps, and credentials for visitors' own tenants (they use Real P1AZ with their own snapshot).

## Open questions for the owner
1. Which tenant and worker app does the proxy use, and who rotates its secret?
2. Where does it run (SE k8s is deferred; a local Docker option would only serve this Mac)?
3. Is a shared decision log acceptable if workspace ids are anonymous?
