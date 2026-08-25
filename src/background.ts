import OBR from "@owlbear-rodeo/sdk";
import { isRecipient, projectedMetadata, readRoomState, responseFor, waitingPings, type PingRecord } from "./domain";
import { lifecycleUpdate } from "./lifecycle";
import { NOTIFICATION_POPOVER_ID } from "./constants";
import { getNotificationPreference, getSeenPings, getSoundEnabled, setSeenPings } from "./preferences";
import { playPingSound } from "./sound";
import { safeSetMetadata } from "./storage";
import { progressHostSession, stopSession } from "./session";

let processing = false;
let initialized = false;
let previousStatuses = new Map<string, PingRecord["status"]>();
let previouslyRelevant = new Set<string>();
let notificationPingId: string | null = null;

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
  notificationPingId = pingId;
}

async function synchronize(providedMetadata?: Awaited<ReturnType<typeof OBR.room.getMetadata>>) {
  if (processing) return;
  processing = true;
  try {
    let metadata = providedMetadata ?? await OBR.room.getMetadata();
    const relevantBeforeCompletion = new Set(readRoomState(metadata).pings.filter((ping) => ping.status === "active" && isRecipient(ping, OBR.player.id)).map((ping) => ping.id));
    const lifecycle = lifecycleUpdate(metadata);
    if (Object.keys(lifecycle).length) {
      await safeSetMetadata(lifecycle, metadata);
      metadata = projectedMetadata(metadata, lifecycle).metadata;
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
    const sessionCompleted = pings.filter((ping) => ping.session && ping.status === "completed" && (previousStatuses.get(ping.id) === "active" || !initialized && Date.now() - (ping.completedAt ?? 0) < 10_000) && (ping.sender.id === OBR.player.id || ping.recipients.some((recipient) => recipient.id === OBR.player.id)));
    if (sessionCompleted.length) {
      const result = sessionCompleted[0];
      await openNotificationPopover(result.id);
      window.setTimeout(() => { if (notificationPingId === result.id) { notificationPingId = null; void OBR.popover.close(NOTIFICATION_POPOVER_ID).catch(() => undefined); } }, 5_000);
    }
    const completed = initialized ? pings.filter((ping) => !ping.session && (ping.type === "quiz" || ping.type === "vote" || ping.type === "nomination") && ping.status === "completed" && previousStatuses.get(ping.id) === "active" && (ping.type === "nomination" ? ping.sender.id === OBR.player.id : ping.sender.id === OBR.player.id || ping.recipients.some((recipient) => recipient.id === OBR.player.id) || Boolean(responseFor(responses, ping.id, OBR.player.id)) || previouslyRelevant.has(ping.id) || relevantBeforeCompletion.has(ping.id))) : [];
    if (completed.length && preference === "popover") await openNotificationPopover(completed[0].id);
    else if (completed.length && preference === "auto-open") await OBR.action.open();
    else if (completed.length && preference === "badge-toast") await OBR.notification.show(`${completed[0].type === "quiz" ? "Quiz" : completed[0].type === "vote" ? "Vote" : "Nomination"} results are ready.`, "INFO");
    await progressHostSession(metadata, pings, responses, OBR.player.id).catch(async (cause) => { await stopSession(metadata, OBR.player.id, false).catch(() => undefined); await OBR.notification.show(cause instanceof Error ? cause.message : "Unable to advance the Ping session.", "ERROR"); });
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
