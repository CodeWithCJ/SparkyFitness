# SparkyFitness MCP Server (DEPRECATED)

> **DEPRECATED:** This standalone MCP server is superseded by the in-process
> `/mcp` route on the main `SparkyFitnessServer`. New integrations should point
> at the main server's `/mcp` endpoint. This package and its Dockerfiles remain
> only during a deprecation window and will be removed in a scheduled follow-up.

## What changed

MCP is now served in-process by the main `SparkyFitnessServer` at `POST /mcp`.
That route reuses the chatbot tool registry, so the server and the assistant
expose a single, shared tool surface instead of two separate implementations.

This standalone package previously ran MCP as its own service (HTTP and stdio).
It is no longer the recommended way to run MCP.

## Where to point MCP clients

Use the main server's `/mcp` endpoint:

- Production: `https://<your-host>/mcp`
- Local dev: `http://localhost:3010/mcp`

stdio-only MCP clients (that cannot speak Streamable HTTP) can bridge to the
HTTP endpoint with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```bash
npx mcp-remote https://<your-host>/mcp
```

## Why this package still exists

The Docker image `codewithcj/sparkyfitness_mcp:latest` is still published during
the deprecation window, so this package and its Dockerfiles
(`docker/Dockerfile.mcp`, `docker/Dockerfile.mcp.dev`) remain in the repo for
now. Existing deployments that depend on the standalone image keep working until
the window closes.

## Removal

Removal of this package, its Dockerfiles, and the CI build/publish steps is
tracked as a scheduled follow-up (Phase 3b), at the upstream maintainer's
discretion.
