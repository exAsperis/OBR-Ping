# Ping for Owlbear Rodeo

Votes, quizzes, nominations, and messages for [Owlbear Rodeo](https://www.owlbear.rodeo/).

Ping for Owlbear Rodeo sends short, focused interactions to everyone in a room, a selected group, or one player. Every Ping has one purpose and a clear end; it is not a chat client.

## Features

- Timed single- and multiple-choice Quizzes with exact-set scoring and time-ranked results
- Single-choice and instant-runoff ranked-choice Votes
- Single-line Nominations that the sender can curate into a separate Vote
- Discrete Messages with read state, Reply, and Reply All
- Separate interaction deadlines and automatic deletion for every Ping
- Background action badges and configurable separate-popover, toast, or auto-open behavior
- GM-controlled player creation permissions and room metadata cleanup
- Full operation with or without an open scene

## Install

Add this manifest URL to your Owlbear Rodeo profile, then enable the extension for a room:

```text
https://obr-ping.ex-asperis.com/manifest.json
```

For a cache-independent `0.1.0` installation, use:

```text
https://obr-ping.ex-asperis.com/manifest-v0.1.0.json
```

New rooms begin in GM-only mode. The GM can enable player creation globally and then allow Messages, Votes, Quizzes, and Nominations individually.

## Development

```sh
pnpm install
pnpm run dev
```

Add `http://localhost:5173/manifest-local.json` as a development extension in Owlbear Rodeo.

Before delivery:

```sh
pnpm run check:identity
pnpm run check:versions
pnpm run typecheck
pnpm test
pnpm run build
```

## Storage, privacy, and limits

Ping has no backend. Its interactions and responses are stored in Owlbear room metadata under `com.ex-asperis.obr-ping`, and device notification preferences remain in extension-origin browser storage.

Owlbear room metadata is limited to 16 KB across all extensions. Ping checks the projected size before writes and gives the GM a meter showing total room usage, Ping usage, and estimated remaining capacity. Every Ping has a configurable deletion time (24 hours after sending by default), when it and its responses are automatically removed. The GM can configure room defaults for deadlines and deletion, and the GM and interaction senders also have explicit cleanup controls.

Vote choices are secret in the Ping interface: results never reveal voter-to-ballot mappings. Owlbear metadata is technically inspectable by room participants, so this is not cryptographic secrecy. Reliability is limited to Owlbear room metadata and stable Owlbear player IDs; there is no cross-room archive or trusted external clock.

## Production

The Azure Static Web Apps workflow validates and builds the Vite project before deploying `dist`. Production resources use `https://obr-ping.ex-asperis.com/` and release-version queries to prevent stale Owlbear caches.

Author: **ex Asperis**
