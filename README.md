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

## Integration for other extensions

Other Owlbear extensions can ask Ping to send a Message on behalf of the current player. Send the request on `com.ex-asperis.obr-ping/api/v1/message` with broadcast destination `LOCAL`. Ping ignores requests from other player connections, validates the current room roster and settings, and applies the same Message-creation permission used by its interface. A GM may always send; a player requires both player creation and Messages to be enabled.

```ts
import OBR from "@owlbear-rodeo/sdk";

const requestId = crypto.randomUUID();

await OBR.broadcast.sendMessage("com.ex-asperis.obr-ping/api/v1/message", {
  version: 1,
  requestId,
  message: "The door opens.",
  recipients: { everyone: true, includeFutureRecipients: false },
  options: {
    deadlineMinutes: 5,
    expiryMinutes: 1440,
    allowReply: false,
    allowReplyAll: false,
  },
}, { destination: "LOCAL" });
```

`message` is trimmed and must contain 1–300 characters. `playerIds` may be used instead of, or alongside, `everyone`; IDs must identify connected players other than the sender. `includeFutureRecipients` may be used by itself. Timing overrides are positive whole minutes, and expiry must be later than the deadline. Omitted timing values use Ping's room defaults. Reply All automatically enables replies.

Callers may listen on `com.ex-asperis.obr-ping/api/v1/message-result` for a local acknowledgement. Results contain `version`, `requestId`, and either `{ status: "accepted", pingId }` or `{ status: "rejected", code, message }`. Rejection codes are `INVALID_REQUEST`, `PERMISSION_DENIED`, `INVALID_RECIPIENTS`, `CAPACITY_EXCEEDED`, and `WRITE_FAILED`. Listening is optional, so an extension can use the request as fire-and-forget when it does not need to detect whether Ping is installed or enabled.

Broadcasts do not provide an authenticated originating-extension identity. Any extension on the current Owlbear player connection can use this API when that player has permission to create Messages; a caller-provided extension ID must not be treated as proof of identity.

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

## Publishing

Publishing is performed by the Azure Static Web Apps workflow when an authorized maintainer pushes to `main`. Pull requests targeting `main` receive temporary preview deployments; closing a pull request removes its preview environment.

Before publishing a release:

1. Choose the release version. Keep it synchronized in `package.json`, `src/version.ts`, `public/manifest.json`, `public/manifest-local.json`, and the matching `public/manifest-v<version>.json` file.
2. Ensure the stable and versioned production manifests are identical. All production icon, background, and popover URLs must use the same release version in their `?v=` query.
3. Install the locked dependencies and run the complete verification suite:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run check:identity
   pnpm run check:versions
   pnpm run typecheck
   pnpm test
   pnpm run build
   ```

4. Review and merge the release changes into `main`. Do not push, merge, deploy, or publish without explicit authorization from the project owner.
5. Confirm the `Azure Static Web Apps CI/CD` workflow completes successfully. It repeats the checks above and deploys the prebuilt `dist` directory using the repository's Azure deployment secret.
6. Verify the production site and both manifest forms:
   - `https://obr-ping.ex-asperis.com/`
   - `https://obr-ping.ex-asperis.com/manifest.json`
   - `https://obr-ping.ex-asperis.com/manifest-v<version>.json`

The stable manifest is the normal installation URL. Keep each versioned manifest available as a cache-independent installation target. Production resources use release-version query parameters to prevent stale Owlbear caches.

Author: **ex Asperis**
