import OBR from "@owlbear-rodeo/sdk";
import { isRecipient, readRoomState, responseFor, waitingPings, type PingRecord } from "./domain";
import { completionUpdate } from "./lifecycle";
import { NOTIFICATION_POPOVER_ID } from "./constants";
import { getNotificationPreference, getSeenPings, getSoundEnabled, setSeenPings } from "./preferences";
import { playPingSound } from "./sound";
import { safeSetMetadata } from "./storage";

let processing = false;
let initialized = false;
let previousStatuses = new Map<string, PingRecord["status"]>();
let previouslyRelevant = new Set<string>();

function notificationUrl(pingId: string) {
  const url = new URL("extension.html", window.location.href);
  url.searchParams.set("pingId", pingId);
  return url.href;
}

async function openNotificationPopover(pingId: string) {
  await OBR.popover.close(NOTIFICATION_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({
    id: NOTIFICATION_POPOVER_ID,
    url: notificationUrl(pingId),
    width: 420,
    height: 640,
    anchorReference: "POSITION",
    anchorPosition: { left: 24, top: 72 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
  });
}

async function synchronize(providedMetadata?: Awaited<ReturnType<typeof OBR.room.getMetadata>>) {
  if (processing) return;
  processing = true;
  try {
    let metadata = providedMetadata ?? await OBR.room.getMetadata();
    const relevantBeforeCompletion = new Set(readRoomState(metadata).pings.filter((ping) => ping.status === "active" && isRecipient(ping, OBR.player.id)).map((ping) => ping.id));
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
      if (getSoundEnabled()) await playPingSound();
      if (preference === "popover") await openNotificationPopover(incoming[0].id);
      else if (preference === "auto-open") await OBR.action.open();
      else if (preference === "badge-toast") await OBR.notification.show(incoming.length === 1 ? `${incoming[0].sender.name} sent you a ${incoming[0].type}.` : `${incoming.length} new Pings are waiting.`, "INFO");
    }
    const completed = initialized ? pings.filter((ping) => (ping.type === "quiz" || ping.type === "vote") && ping.status === "completed" && previousStatuses.get(ping.id) === "active" && (ping.sender.id === OBR.player.id || ping.recipients.some((recipient) => recipient.id === OBR.player.id) || Boolean(responseFor(responses, ping.id, OBR.player.id)) || previouslyRelevant.has(ping.id) || relevantBeforeCompletion.has(ping.id))) : [];
    if (completed.length && preference === "popover") await openNotificationPopover(completed[0].id);
    else if (completed.length && preference === "badge-toast") await OBR.notification.show(`${completed[0].type === "quiz" ? "Quiz" : "Vote"} results are ready.`, "INFO");
    for (const ping of waiting) seen.add(ping.id);
    setSeenPings(seen);
    previousStatuses = new Map(pings.map((ping) => [ping.id, ping.status]));
    previouslyRelevant = new Set(pings.filter((ping) => ping.status === "active" && isRecipient(ping, OBR.player.id)).map((ping) => ping.id));
    initialized = true;
  } finally { processing = false; }
}

OBR.onReady(() => {
  void synchronize();
  const unsubscribe = OBR.room.onMetadataChange((metadata) => void synchronize(metadata));
  const timer = window.setInterval(() => void synchronize(), 1000);
  window.addEventListener("beforeunload", () => { unsubscribe(); window.clearInterval(timer); }, { once: true });
});
