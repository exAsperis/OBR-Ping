import OBR from "@owlbear-rodeo/sdk";
import { readRoomState, waitingPings } from "./domain";
import { completionUpdate } from "./lifecycle";
import { getNotificationPreference, getSeenPings, setSeenPings } from "./preferences";
import { safeSetMetadata } from "./storage";

let processing = false;

async function synchronize(providedMetadata?: Awaited<ReturnType<typeof OBR.room.getMetadata>>) {
  if (processing) return;
  processing = true;
  try {
    let metadata = providedMetadata ?? await OBR.room.getMetadata();
    const completion = completionUpdate(metadata);
    if (Object.keys(completion).length) {
      await safeSetMetadata(completion, metadata);
      metadata = { ...metadata, ...completion };
    }
    const { pings, responses } = readRoomState(metadata);
    const waiting = waitingPings(pings, responses, OBR.player.id);
    await OBR.action.setBadgeText(waiting.length ? (waiting.length > 99 ? "99+" : String(waiting.length)) : undefined);
    const seen = getSeenPings();
    const incoming = waiting.filter((ping) => !seen.has(ping.id));
    const preference = getNotificationPreference();
    if (incoming.length) {
      if (preference === "auto-open") await OBR.action.open();
      else if (preference === "badge-toast") await OBR.notification.show(incoming.length === 1 ? `${incoming[0].sender.name} sent you a ${incoming[0].type}.` : `${incoming.length} new Pings are waiting.`, "INFO");
    }
    for (const ping of waiting) seen.add(ping.id);
    setSeenPings(seen);
  } finally { processing = false; }
}

OBR.onReady(() => {
  void synchronize();
  OBR.room.onMetadataChange((metadata) => void synchronize(metadata));
  window.setInterval(() => void synchronize(), 1000);
});
