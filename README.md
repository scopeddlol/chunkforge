<div align="center">

# Chunkforge

**Forge Your World.**

A self-hostable Minecraft platform: create a server in a wizard, run it on any
machine you own, and reach it at its own subdomain — without opening a single
port on the machine it runs on.

</div>

---

## The four pieces

Chunkforge is one platform in four parts. Three of them are optional; the first
one works entirely on its own.

| | What it is | Where it runs |
| --- | --- | --- |
| **Chunkforge Desktop** | The Chunkforge UI. Creates and manages servers. Works standalone and offline. | Your Windows PC |
| **Chunkforge Web** | The same UI, in Docker, reachable from any browser on your network. Can run a node inside itself. | Your homelab |
| **Chunkforge Portal** | Subdomain manager and proxy, with its own small web interface. Runs no servers. | A VPS with a public address |
| **Chunkforge Node** | Runs the actual Minecraft servers. Holds no open ports. | Anywhere — a spare box, a friend's Docker host |

Desktop and Web are **control planes**: interchangeable front ends onto the same
platform. Pick whichever suits you; you do not need both.

## The two ways to run it

Both are the same triangle — a control plane you click in, a Portal with a
public address, and nodes that do the work.

### 1. Desktop + Portal + Nodes

```
Chunkforge Desktop (your PC) ──┐
                               ├── Chunkforge Portal (VPS) ── Chunkforge Nodes
                     players ──┘
```

Run the desktop app you already use. Point it at a Portal, pair some nodes, and
you can deploy servers onto them with automatic subdomains and the same mod,
plugin, and modpack support you get locally.

### 2. Web + Portal + Nodes

```
Chunkforge Web (homelab) ──┐
                           ├── Chunkforge Portal (VPS) ── Chunkforge Nodes
                 players ──┘
```

The panel lives in a browser instead of on one desktop. Closer in shape to
Pterodactyl and Wings — with automatic subdomain provisioning in the middle.

If the homelab box should also *host* servers, Chunkforge Web can run a node
inside its own container, so it is one service instead of two.

## No open ports. Anywhere.

This is the constraint the whole design is built around.

A node never accepts an inbound connection. It dials **out** to its Portal once
and keeps that one WebSocket open, and everything afterwards arrives down it:
player traffic to relay, and Chunkforge API calls to run. Portal owns every
public listener.

So a server in your bedroom and a server on a friend's box 500 miles away are
reached the same way, through an address Portal allocated:

```
player → survival.play.example.com → Portal → (existing socket) → node → server
```

Neither machine has a port forwarded, and neither needs a static address.

### What you publish in DNS

Portal allocates a public port per server, because every server on every node is
funnelled through one host. Players never see that port — an SRV record carries
it.

| Record | When | Why |
| --- | --- | --- |
| `portal.example.com A <portal ip>` | Once | The Portal itself, and what its certificate is issued for |
| `*.play.example.com CNAME portal.example.com` | Once | Covers every subdomain Portal will ever allocate |
| `_minecraft._tcp.<name>.play.example.com SRV 0 0 <port> <host>` | Per server | Lets players connect without typing a port |

The wildcard is a `CNAME` when Portal is reached at a domain, so changing the
VPS's IP needs no further DNS work. Point Portal at a bare IP instead and it
reports an `A` record.

Portal reports the exact records for each server under **Subdomains**. It does
not write them for you by default — it holds no credentials for your zone.

### Automatic DNS with Cloudflare

If your zone is on Cloudflare, give Portal an API token under **Settings →
Cloudflare DNS** — scoped to `Zone → DNS → Edit` on that one zone, nothing
broader — and it publishes the wildcard and every server's records itself.
The Subdomains page then shows what's already live instead of what to copy.

The token can also come from the environment, which behaves the same as the
domain does — set once at deploy time, read-only in the UI:

```bash
export CHUNKFORGE_CLOUDFLARE_API_TOKEN=<your token>
export CHUNKFORGE_CLOUDFLARE_ZONE_NAME=play.example.com   # defaults to the domain zone
```

Turning it off (or never setting it) changes nothing else — Portal falls back
to reporting the records exactly as before.

## Getting started

### Standalone

Grab the latest `Chunkforge-Setup-*.exe` from
[Releases](https://github.com/scopeddlol/chunkforge/releases). That is the whole
setup — Portal and nodes are only needed once you want servers running somewhere
other than your own machine.

### With a Portal

Portal needs a domain. It is the one public component — every node dials it,
every control plane pairs with it, and operator passwords and node tokens cross
it — so the stack terminates TLS in front of it and refuses to start without a
name to get a certificate for.

Point a domain at the VPS, then:

```bash
# 1. On the VPS
export CHUNKFORGE_PORTAL_DOMAIN=portal.example.com
export CHUNKFORGE_PORTAL_ZONE=play.example.com   # optional, seeds the zone
docker compose -f docker-compose.portal.yml up -d
```

Caddy obtains and renews the certificate automatically over ACME, which is why
ports 80 and 443 both have to reach the host. Portal itself is not published —
the only way in is through the proxy.

Open `https://portal.example.com`, create the operator account, then under
**Settings** confirm the zone and port range. The public URL is already filled in
and read-only: it comes from `CHUNKFORGE_PORTAL_DOMAIN`, so it can never
disagree with the certificate. Publish the wildcard record Portal shows you.

```bash
# 2. On each machine that should run servers
CHUNKFORGE_PORTAL_URL=https://portal.example.com \
CHUNKFORGE_PAIRING_PIN=<node pin from Portal → Nodes> \
docker compose -f docker-compose.node.yml up -d
```

```bash
# 3. If you want the browser panel rather than the desktop app
docker compose -f docker-compose.web.yml up -d
```

Then, in Desktop or Web, open **Settings → Chunkforge Portal** and redeem a
**control plane pin**. Adopt your nodes under **Nodes**, and create a server —
the wizard now asks which machine to run it on, and its address is allocated
automatically.

Ready-made stacks using the published images are in
[`examples/docker/`](examples/docker/).

## What it does

**Create a server without touching a terminal.** An eight-step wizard walks you
from server type through an optional modpack, version, resources, gameplay
toggles, and add-ons. It downloads the right server jar, fetches a matching Java
runtime if you don't already have one, accepts the EULA, and writes
`server.properties` for you.

**Run and manage it — wherever it is.** Each server gets a dashboard card with
live status, and a detail view with seven tabs:

| Tab | What's in it |
| --- | --- |
| **Console** | Live server output with a command input wired to stdin |
| **Chat** | In-game chat, joins, and leaves parsed from the log, plus broadcast |
| **Players** | Roster merged from ops/whitelist/bans and the live online set, with op, kick, ban, and whitelist actions |
| **Add-Ons** | Installed plugins or mods with enable/disable toggles and uninstall |
| **Files** | Sandboxed file browser with an inline text editor |
| **Backups** | Zip snapshots of the overworld, nether, and end — with optional upload to FileHub |
| **Settings** | Editable name, port, RAM, gameplay options, public address (rename the subdomain without losing the port), and delete |

A server on a remote node behaves identically to a local one. Requests for it
are forwarded to its node through Portal, so the console, the file browser, and
everything else work the same at any distance.

**Find add-ons anywhere.** One search box queries four sources in parallel.
Results are interleaved so no single source dominates, the same project found on
several sources merges into one card with the download source picked at install
time, and results filter by Minecraft version and loader.

**Install whole modpacks.** Browse Modrinth and CurseForge modpacks, install one
onto an existing server, or start a brand-new server from a pack — Chunkforge
reads the archive and sets the loader and Minecraft version to match.

## Supported servers

| Type | Add-ons | Notes |
| --- | --- | --- |
| Paper | Plugins | Recommended default |
| Purpur | Plugins | Paper fork |
| Spigot | Plugins | Compiled locally with BuildTools — slow |
| Vanilla | — | Mojang's unmodified server |
| Fabric | Mods | |
| Forge | Mods | Runs the official installer |
| NeoForge | Mods | Modern Forge fork, faster on new versions |

Java requirements are read live from the upstream projects — Mojang's version
manifest and Paper's build metadata — rather than guessed from the Minecraft
version, so a new release that raises its Java requirement works without an app
update. Paper's own recommended JVM tuning flags are applied automatically.

## Plugin sources

| Source | Auth needed | Notes |
| --- | --- | --- |
| [Modrinth](https://modrinth.com/plugins) | None | Full search and install |
| [Hangar](https://hangar.papermc.io/) | None | Projects hosting releases off-site open in your browser |
| [SpigotMC](https://www.spigotmc.org/resources/) | None | Via the Spiget API; premium and externally-hosted resources open in your browser |
| [CurseForge](https://www.curseforge.com/minecraft/bukkit-plugins) | Free API key | Add your key in Settings → Plugin sources |

## FileHub backups

Chunkforge can push world backups to a self-hosted
[FileHub](https://github.com/scopeddlol/filehub) instance. Connect it under
**Settings → FileHub**, pick a destination folder, and optionally have every new
backup upload automatically. Uploads are chunked and resumable. Only the session
token is stored — your password is never written to disk.

## Themes

Eight built-in themes — OLED Violet, Midnight, Nebula, Forest, Ember, Slate,
Light, and Parchment — selectable under Settings, or set to follow Windows.

Chunkforge Portal has its own single dark theme. It is infrastructure you
configure once, not something you sit in.

## Architecture

An npm-workspaces monorepo built around a **Core API**. The domain layer has no
UI and no Electron dependency, so the same code runs inside the desktop app,
inside Chunkforge Web, and on every node.

```
packages/
  core/         domain layer — server engine, Java, add-ons, files, backups, stats
  api/          Fastify HTTP + WebSocket over core, with auth, roles, and the Portal link
  portal/       Chunkforge Portal — subdomains, proxy, pairing, and its own admin UI
  web/          Chunkforge Web — the Chunkforge UI in Docker, optional embedded node
  desktop/      Electron shell; embeds the API and owns the shared renderer
  node-worker/  Chunkforge Node — embeds the API and reaches Portal outbound only
```

**One UI, two hosts.** Chunkforge Web builds the *same renderer* the desktop app
ships. The renderer holds no privileged bridge — it talks to the Core API over
HTTP with a typed client, exactly as a browser would — so running it in a
browser needed nothing but a different place to serve it from.

**Portal depends on nothing.** `packages/portal` has no `@chunkforge/core`
dependency, deliberately. It cannot start a Minecraft server even if asked,
because it holds none of the code that could. A Portal on a small VPS stays
small.

**Nodes embed a whole Chunkforge.** A node runs the same Core API the desktop
app does, on loopback. Portal forwards management calls to it over the node's
existing socket, which is why the UI can drive a remote node with the identical
code path it uses locally.

**Auth** is multi-user with an ordered role ladder — `viewer` → `member` →
`admin` → `owner` — plus per-project grants and hashed API tokens. Passwords use
scrypt from Node's standard library, so self-hosting needs no native build
toolchain. Portal keeps its own separate operator account: it is shared
infrastructure, and whoever runs the VPS is not necessarily a Chunkforge user.

**Pairing** is by short-lived, single-use pins, and pins are typed. A node pin
cannot be redeemed as a control plane, so a code you read out to a friend who is
hosting a node can only ever make them a node.

## Build from source

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck     # type-check every workspace
npm run build         # compile without packaging
npm run build:win     # produce a Windows installer in release/
npm run build:web     # build the Chunkforge Web bundle
npm run build:portal  # build Portal's admin UI
npm run build:images  # build all three Docker images
npm run dev:portal    # run Portal locally, no domain or TLS needed
npm run dev:web       # run the Chunkforge Web UI against a local API
npm run api           # run the Core API headless
```

### Releases

Push a tag and CI publishes the Windows installer to **GitHub Releases** and all
three images to **GHCR**:

- `ghcr.io/scopeddlol/chunkforge-portal:<tag>`
- `ghcr.io/scopeddlol/chunkforge-web:<tag>`
- `ghcr.io/scopeddlol/chunkforge-node:<tag>`

```bash
git tag v0.5.0 && git push origin v0.5.0
```

Suffix a tag with `-portal`, `-web`, or `-node` to ship only that image and skip
building a desktop installer.

## Where your data lives

Chunkforge Desktop, on Windows:

```
Documents\Chunkforge\
  Instances\<server>\        server files, world, plugins, backups
  Runtimes\jdk-<major>\      Java runtimes Chunkforge downloaded
  instances-index.json       tracks servers created outside the default folder
  settings.json              app settings, projects, and the Portal link
  auth.json                  accounts and API tokens (sessions stay in memory)
```

In Docker, `/data` holds the same layout. Chunkforge Web separates `panel/` from
`node/` so a co-located node's servers stay its own. Portal keeps only
`portal.json` — nodes, subdomains, routes, and pins.

## Status

The Portal and node runtime is young. Working today: pairing, node adoption,
automatic subdomain allocation with the DNS records to publish, the TCP/UDP
relay, and full remote management through the Portal channel.

TLS for the control surface is handled by the bundled Caddy proxy.

Not yet built: writing DNS records automatically through a provider API, TLS on
the allocated *player* routes (Minecraft is not HTTP, so the proxy cannot help
there), and scheduling logic that picks a node for you rather than asking.

## Tech

TypeScript · Electron · React · [Fluent UI v9](https://react.fluentui.dev/) ·
Fastify · Vite · electron-builder

## License

Not yet licensed. All rights reserved.
