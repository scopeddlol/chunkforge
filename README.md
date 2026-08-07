<div align="center">

# Chunkforge

**Forge Your World.**

A Windows 11 desktop app for creating, running, and managing Minecraft servers —
with a unified plugin browser that searches Modrinth, Hangar, SpigotMC, and
CurseForge in one place.

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
npm run typecheck    # type-check main, preload, and renderer
npm run build        # compile without packaging
npm run build:win    # produce a Windows installer in release/
```

To cut a release, push a tag — CI builds on Windows and publishes the installer
to GitHub Releases:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Where your data lives

```
Documents\Chunkforge\
  Instances\<server>\        server files, world, plugins, backups
  Runtimes\jdk-<major>\      Java runtimes Chunkforge downloaded
  instances-index.json       tracks servers created outside the default folder
  settings.json              app settings
```

Servers can be created anywhere — the wizard has an install-location picker, and
the index keeps them discoverable.

## Architecture

Electron main process owns all filesystem, process, and network work. The
renderer is sandboxed (`contextIsolation`, no `nodeIntegration`) and talks to
main only through a typed preload bridge. Live state — console output, status
changes, player joins — is pushed over IPC rather than polled.

```
src/
  main/         Electron main process
    ipc/          IPC handlers by domain
    services/     server engine, Java, downloads, plugins, files, backups
    store/        instance and settings persistence
  preload/      typed contextBridge API
  renderer/     React + Fluent UI v9
  shared/       types shared across the boundary
```

## Tech

TypeScript · Electron · React · [Fluent UI v9](https://react.fluentui.dev/) ·
Vite · electron-builder

## License

Not yet licensed. All rights reserved.
