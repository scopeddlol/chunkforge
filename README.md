<div align="center">

# Chunkforge

**Forge Your World.**

A Minecraft hosting platform with a native Windows desktop app, a shared web
panel, a self-hosted Chunkforge Portal proxy, and Portal-connected Docker node
workers.

Chunkforge still works as a standalone desktop app, but it now also includes the
first end-to-end **Portal + Node** slice:

- **Chunkforge Desktop** for local management on Windows
- **Chunkforge Web** as the browser-hosted panel replica
- **Chunkforge Portal** as the proxy/control-plane entrypoint
- **Chunkforge Nodes** as Docker-ran remote hosts that pair into Portal with a pin

</div>

---

## What it does

**Create a server without touching a terminal.** An eight-step wizard walks you
from server type through an optional modpack, version, resources, gameplay
toggles, and add-ons. It
downloads the right server jar, fetches a matching Java runtime if you don't
already have one, accepts the EULA, and writes `server.properties` for you.

**Run and manage it.** Each server gets a dashboard card with live status, and a
detail view with seven tabs:

| Tab | What's in it |
| --- | --- |
| **Console** | Live server output with a command input wired to stdin |
| **Chat** | In-game chat, joins, and leaves parsed from the log, plus broadcast |
| **Players** | Roster merged from ops/whitelist/bans and the live online set, with op, kick, ban, and whitelist actions |
| **Add-Ons** | Installed plugins or mods with enable/disable toggles and uninstall |
| **Files** | Sandboxed file browser with an inline text editor |
| **Backups** | Zip snapshots of the overworld, nether, and end — with optional upload to FileHub |
| **Settings** | Editable name, port, RAM, gameplay options, and delete |

**Find add-ons anywhere.** One search box queries four sources in parallel.
Results are interleaved so no single source dominates, the same project found on
several sources merges into one card with the download source picked at install
time, and results filter by Minecraft version and loader. Separate Plugins and
Mods sections match what your server actually accepts.

**Install whole modpacks.** Browse Modrinth and CurseForge modpacks, install one
onto an existing server, or start a brand-new server from a pack — Chunkforge
reads the archive and sets the loader and Minecraft version to match.

**Keep an eye on everything.** The dashboard shows live CPU, memory, running
servers, players online, backup count, and disk use, with card or table views and
server groups you can start and stop in bulk.

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

## Install

Grab the latest `Chunkforge-Setup-*.exe` from
[Releases](https://github.com/scopeddlol/chunkforge/releases).

## Build from source

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run typecheck    # type-check every workspace
npm run build        # compile without packaging
npm run build:win    # produce a Windows installer in release/
npm run build:portal # build the browser panel into packages/api/portal-dist
npm run build:images # build the Portal and Node Docker images
npm run api          # run the Core API standalone, without the desktop shell
```

## Platform layout

### Chunkforge Portal

Chunkforge Portal is the self-hosted proxy and control-plane service between
Chunkforge Desktop, Chunkforge Web, and remote Chunkforge Nodes.

Current Portal responsibilities:

- serves Chunkforge Web
- stores the main app state and auth for self-hosted usage
- generates and redeems connector pins
- accepts node heartbeats and tunnel declarations
- hosts the first TCP/UDP relay runtime for remote nodes
- carries the first foundation for subdomain-aware proxy configuration

**Important:** the current codebase only implements the first Portal foundation.
It does **not** yet provide finished automatic Minecraft subdomain allocation or
a production-ready no-open-ports proxy runtime.

Run it with Docker Compose:

```bash
docker compose -f docker-compose.portal.yml up
```

Or build the image directly:

```bash
docker build -f Dockerfile.portal -t chunkforge-portal:local .
```

Then open `http://localhost:8080`, create the first owner account, and configure
Portal under **Settings → Chunkforge Portal**.

For a local non-Docker panel build:

```bash
npm run build:portal --workspace @chunkforge/desktop
npm run start --workspace @chunkforge/api
```

### Chunkforge Nodes

Chunkforge Nodes are Docker-ran workers that connect back to a Portal with a
pairing pin. They are intended to host Minecraft servers on remote machines and
relay traffic back through Portal to Chunkforge Desktop or Chunkforge Web.

Today, the implemented Node foundation provides:

- pin redemption through Portal
- heartbeat reporting with CPU, memory, and storage telemetry
- initial TCP/UDP tunnel registration and framed relay plumbing

It does **not** yet provide a finished remote Minecraft hosting runtime with
full lifecycle orchestration, automatic allocation logic, or production-grade
tunnel recovery.

Run a node worker with Docker Compose:

```bash
docker compose -f docker-compose.node.yml up
```

Or build the image directly:

```bash
docker build -f Dockerfile.node -t chunkforge-node:local .
```

Set these environment variables for node workers:

- `CHUNKFORGE_PORTAL_URL`
- `CHUNKFORGE_PAIRING_PIN`
- `CHUNKFORGE_NODE_NAME` (optional)
- `CHUNKFORGE_HEARTBEAT_MS` (optional)

### Chunkforge Desktop

Chunkforge Desktop is the existing Windows 11 application. It remains the main
native app and now includes the first shared Portal/Node management surfaces.

### Chunkforge Web

Chunkforge Web is the browser-served replica of the shared Chunkforge UI. It is
built from the same renderer and served by Chunkforge Portal.

Today, the repository includes:

- a browser-safe shared renderer build
- a Portal-served web panel build output
- Docker packaging for the web panel through the Portal image
- an explicit all-in-one compose mode with an optional co-located Chunkforge Node

Run Web only:

```bash
docker compose -f docker-compose.web-node.yml up
```

Run Web with a co-located Node worker:

```bash
docker compose -f docker-compose.web-node.yml --profile with-node up
```

When using the co-located node profile, set `CHUNKFORGE_PAIRING_PIN` to the pin
generated in **Settings → Chunkforge Portal**.

### Current foundation flow

1. Start the Portal panel and open **Settings → Chunkforge Portal**.
2. Set the public Portal URL, then generate the **Desktop/Web connector pin**.
3. Use **Add Node** in the app and enter the node pairing code.
4. Start a node worker and point it at the same Portal.
5. The node redeems the pin, registers its exposed tunnel metadata, and starts
   sending heartbeats.

The current transport slice supports the first Portal-to-node relay path with
TCP and UDP tunnel metadata for Minecraft-style workloads, including multi-port
announcements. It is still an early runtime, not the final production tunnel
system your target architecture calls for.

## Build outputs

### Desktop app

Build the desktop shell:

```bash
npm run build --workspace @chunkforge/desktop
```

Build the Windows installer:

```bash
npm run build:win
```

### Web panel

Build the browser panel that the Portal serves:

```bash
npm run build:portal
```

### Docker images

Build both Docker images:

```bash
npm run build:images
```

Build them individually:

```bash
docker build -f Dockerfile.portal -t chunkforge-portal:local .
docker build -f Dockerfile.node -t chunkforge-node:local .
```

To cut a release, push a tag — CI builds on Windows and publishes the installer
to GitHub Releases:

```bash
git tag v0.3.0 && git push origin v0.3.0
```

## Where your data lives

```
Documents\Chunkforge\
  Instances\<server>\        server files, world, plugins, backups
  Runtimes\jdk-<major>\      Java runtimes Chunkforge downloaded
  instances-index.json       tracks servers created outside the default folder
  settings.json              app settings, projects, and known nodes
  auth.json                  accounts and API tokens (sessions stay in memory)
```

Servers can be created anywhere — the wizard has an install-location picker, and
the index keeps them discoverable.

## Architecture

Chunkforge is an npm-workspaces monorepo built around a **Core API**. The domain
layer has no UI and no Electron dependency, so the same code runs inside the
desktop app, inside a Docker panel, and on remote nodes.

```
packages/
  core/       domain layer — server engine, Java, add-ons, files, backups, stats
  api/        Fastify HTTP + WebSocket over core, with auth and roles
  desktop/    Electron shell; embeds the API and renders the UI
  node-worker/ Portal-connected node runtime for remote hosts
```

The desktop app starts the Core API in-process on loopback with an
OS-assigned port, so it still works standalone and offline. The renderer holds no
privileged bridge — it talks to that API over HTTP with a typed client, exactly
as a browser would. Live state (console output, status changes, player joins,
install progress) arrives on a single WebSocket rather than being polled.

**Auth** is multi-user with an ordered role ladder — `viewer` → `member` →
`admin` → `owner` — plus per-project grants and hashed API tokens. Passwords use
scrypt from Node's standard library, so self-hosting needs no native build
toolchain. The desktop shell holds an owner session for the local machine, which
is why it never shows a login screen.

**Models.** A server's identity, its owner, and its location are separate
records: `Project` (ownership and permission scope), `Server` (the logical
definition), `Instance` (that server materialised on a host), and `Node` (a host
that can run servers). Existing installs are migrated on first launch — the
migration is additive and idempotent, so nothing is stranded.

## Tech

TypeScript · Electron · React · [Fluent UI v9](https://react.fluentui.dev/) ·
Fastify · Vite · electron-builder

## License

Not yet licensed. All rights reserved.
