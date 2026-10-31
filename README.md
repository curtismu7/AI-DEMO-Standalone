# AI-DEMO-Standalone

Parent repo for the standalone SE demo apps. Each app is its own repo under `ping-sandbox`, added as a git submodule under `standalone/`.

```sh
git clone --recurse-submodules https://github.com/ping-sandbox/AI-DEMO-Standalone.git
git submodule update --init --recursive
```

| App | Tier | Repo |
| --- | --- | --- |
| ai-gateway-client | Tester | standalone/ai-gateway-client |
| privilege-a2a-anthropic-demo | Demo | standalone/privilege-a2a-anthropic-demo |
| mcp-demo-client-privilege | Demo | standalone/mcp-demo-client-privilege |
