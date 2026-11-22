# Shared Postman generator (standalone lab family)

Generates a Postman v2.1 collection and a live environment per lab from a small spec file, and fills the live environment with the owner's real settings from the shared env file.

## Files

| File | Purpose |
| --- | --- |
| `generator.mjs` | spec → `<slug>.postman_collection.json` + `<slug>.live.environment.example.json` (placeholders, committed) |
| `fill-env.mjs` | shared env file → `<slug>.live.environment.json` (real values, **git-ignored**) |

## Per-lab layout

Each lab repo gets:

```
postman/
  spec.json                                 # hand-authored per lab
  <slug>.postman_collection.json            # generated, committed
  <slug>.live.environment.example.json      # generated, committed (placeholders)
  <slug>.live.environment.json              # filled locally, git-ignored
```

Add `postman/*.live.environment.json` to the lab's `.gitignore`.

## Workflow

```sh
node ../../shared/postman/generator.mjs --spec postman/spec.json
node ../../shared/postman/fill-env.mjs  --spec postman/spec.json   # owner machine only
npx newman run postman/<slug>.postman_collection.json -e postman/<slug>.live.environment.json
```

`fill-env.mjs` reads `~/Development/.env` by default (`--env` to override) and fails with a list of missing keys rather than writing blanks.

## Spec schema

```json
{
  "name": "CIMD LAB",
  "slug": "cimd-lab",
  "description": "...",
  "baseUrl": "http://localhost:5250",
  "env": { "PF_URL": "pf base", "PF_CLIENT_ID": "..." },
  "envAliases": { "PF_BASE_URL": "PF_URL" },
  "folders": [
    { "name": "Direction 1 — Real PingFederate", "requests": [
      { "name": "Probe", "method": "POST", "path": "/api/pf/probe",
        "body": {}, "tests": ["pm.response.to.have.status(200)"] }
    ]},
    { "name": "H2 2026 gateway-sim", "mockOnly": true, "requests": [] }
  ]
}
```

- `env` values are human descriptions of each key (used by `fill-env.mjs` error messages); keys map to the shared env file.
- Optional `envAliases`: `{ "envAliases": { "PF_BASE_URL": "PF_URL" } }` — when a key is absent from the shared env file, its alias is tried before failing.
- `mockOnly: true` folders get a `(MOCK ONLY)` suffix and an honest description — the lane has no live form; requests target the lab's in-process simulation.
- `tests` are raw Postman test-script lines.

## Rules

1. Real secrets never enter a repo: committed files carry placeholders only.
2. Mock-only lanes must be labelled `(MOCK ONLY)` in the folder name, matching the lab's own banners.
3. Regenerate with the script; never hand-edit the generated collection.
4. README in each lab links the collection and notes the fill step.
