# Deployment examples

Prebuilt-image stacks for the two ways Chunkforge is meant to be run. Both use
the same triangle — a **control plane** you click in, a **Portal** with a public
address, and **nodes** that actually run servers.

| File | What it is |
| --- | --- |
| `portal.example.yml` | Portal on a VPS. Needed by both modes. |
| `node.example.yml` | A node. Run one per machine that should host servers. |
| `web.example.yml` | Chunkforge Web on a homelab, panel only. |
| `web-with-node.example.yml` | Chunkforge Web plus a node in the same container. |
| `.env.example` | Environment template. |

## Mode 1 — Chunkforge Desktop

Run Portal on the VPS, nodes wherever you like, and the desktop app on your PC.

```bash
# on the VPS
docker compose -f portal.example.yml up -d
# on each machine that should run servers
docker compose -f node.example.yml up -d
```

Then install Chunkforge Desktop and pair it under **Settings → Chunkforge
Portal**.

## Mode 2 — Chunkforge Web

Same, with the panel in a browser instead of on one desktop.

```bash
# on the VPS
docker compose -f portal.example.yml up -d
# on the homelab box
docker compose -f web.example.yml up -d
```

If that homelab box should also *host* servers rather than only manage them, use
`web-with-node.example.yml` instead and it runs a node in the same container.

## Order of operations

1. Bring up Portal and open its web interface.
2. Create the operator account, then set the **public base URL**, the **domain
   zone**, and the **port range** under Settings.
3. Publish a wildcard `A` record for the zone pointing at the Portal.
4. Generate a **control plane pin**, redeem it in Desktop or Web.
5. Generate a **node pin** per machine, put it in that node's
   `CHUNKFORGE_PAIRING_PIN`.
6. Create a server, pick a node. Its subdomain is allocated automatically.
