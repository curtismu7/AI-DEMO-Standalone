# AI-DEMO-Standalone

Parent repo for the standalone SE demo apps. Each app is its own repo under `ping-sandbox`, added as a git submodule under `standalone/`.

```sh
git clone --recurse-submodules https://github.com/ping-sandbox/AI-DEMO-Standalone.git
git submodule update --init --recursive
```

| App | Tier | Repo |
| --- | --- | --- |
| ai-gateway-client-LAB | Tester | standalone/ai-gateway-client-LAB |
| privilege-a2a-anthropic-demo-LAB | Demo | standalone/privilege-a2a-anthropic-demo-LAB |
| mcp-demo-client-privilege-LAB | Demo | standalone/mcp-demo-client-privilege-LAB |

## Ports, and what to do if a port is taken

Each app sets its own ports. Ranges and variables are in each app's README:
- ai-gateway-client-LAB: 6880 (`PORT`)
- mcp-demo-client-privilege-LAB: 6884 (`PORT`)
- privilege-a2a-anthropic-demo-LAB: 6881-6883 (`MAIN_AGENT_PORT`, `WORKER_AGENT_PORT`, `MCP_SERVER_PORT`)
- id-jag-standalone: 4720-4723 (`PORT`, and the Docker `HOST_PORT`, `AS_HOST_PORT`, `MCP_HOST_PORT`)

If a port is taken: find the process with `lsof -iTCP:<port> -sTCP:LISTEN -n -P`. Stop it if it is an old copy of the app (`kill <PID>`). Otherwise start the app on another port, using the variable above.
