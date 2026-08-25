import OBR from "@owlbear-rodeo/sdk";
import { isRecipient, projectedMetadata, readRoomState, responseFor, waitingPings, type PingRecord } from "./domain";
import { lifecycleUpdate } from "./lifecycle";
import { NOTIFICATION_POPOVER_ID } from "./constants";
import { getNotificationPreference, getSeenPings, getSoundEnabled, setSeenPings } from "./preferences";
import { playPingSound } from "./sound";
import { safeSetMetadata } from "./storage";
import { progressHostSession, readSessionLock, stopSession } from "./session";
import { archiveRoomState, claimArchiveFailureWarning } from "./archive";

let processing = false;
let initialized = false;
let previousStatuses = new Map<string, PingRecord["status"]>();
let previouslyRelevant = new Set<string>();
let notificationPingId: string | null = null;
const shownSessionResults = new Set<string>();
const warnedPopoverFailures = new Set<string>();

function notificationUrl(pingId: string) {
  const url = new URL("extension.html", window.location.href);
  url.searchParams.set("pingId", pingId);
  return url.href;
}

async function openNotificationPopover(pingId: string) {
  try {
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
      disableClickAway: true,
    });
    warnedPopoverFailures.delete(pingId);
    notificationPingId = pingId;
  } catch (cause) {
    if (!warnedPopoverFailures.has(pingId)) {
      warnedPopoverFailures.add(pingId);
      await OBR.notification.show(`Ping could not open its separate popover: ${cause instanceof Error ? cause.message : "unknown Owlbear error"}`, "ERROR").catch(() => undefined);
    }
    throw cause;
  }
}

async function synchronize(providedMetadata?: Awaited<ReturnType<typeof OBR.room.getMetadata>>) {
  if (processing) return;
  processing = true;
  try {
    let metadata = providedMetadata ?? await OBR.room.getMetadata();
    const before = readRoomState(metadata);
    try { await archiveRoomState(OBR.room.id, OBR.player.id, before.pings, before.responses); }
    catch (cause) { if (claimArchiveFailureWarning()) await OBR.notification.show(`Ping could not save local history: ${cause instanceof Error ? cause.message : "unknown browser storage error"}`, "ERROR").catch(() => undefined); }
    const relevantBeforeCompletion = new Set(before.pings.filter((ping) => ping.status === "active" && isRecipient(ping, OBR.player.id)).map((ping) => ping.id));
    const lifecycle = lifecycleUpdate(metadata);
    if (Object.keys(lifecycle).length) {
      await safeSetMetadata(lifecycle, metadata);
      metadata = projectedMetadata(metadata, lifecycle).metadata;
      const projected = readRoomState(metadata);
      await archiveRoomState(OBR.room.id, OBR.player.id, projected.pings, projected.responses).catch(() => undefined);
    }
    const { pings, responses } = readRoomState(metadata);
    const waiting = waitingPings(pings, responses, OBR.player.id);
    await OBR.action.setBadgeText(waiting.length ? (waiting.length > 99 ? "99+" : String(waiting.length)) : undefined);
    const seen = getSeenPings(OBR.player.id);
    const incoming = waiting.filter((ping) => !seen.has(ping.id));
    const preference = getNotificationPreference();
    if (incoming.length) {
      if (getSoundEnabled()) await playPingSound();
      if (incoming[0].session || preference === "popover") await openNotificationPopover(incoming[0].id);
      else if (preference === "auto-open") await OBR.action.open();
      else if (preference === "badge-toast") await OBR.notification.show(incoming.length === 1 ? `${incoming[0].sender.name} sent you a ${incoming[0].type}.` : `${incoming.length} new Pings are waiting.`, "INFO");
    }
    const sessionLock = readSessionLock(metadata);
    const sessionCompleted = pings.filter((ping) => ping.session && ping.status === "completed" && !shownSessionResults.has(ping.id) && (previousStatuses.get(ping.id) === "active" || sessionLock?.id === ping.session.id && sessionLock.currentPingId === ping.id && sessionLock.phase === "results") && (ping.sender.id === OBR.player.id || ping.recipients.some((recipient) => recipient.id === OBR.player.id)));
    if (sessionCompleted.length) {
      const result = sessionCompleted[0];
      shownSessionResults.add(result.id);
      await openNotificationPopover(result.id);
      window.setTimeout(() => { if (notificationPingId === result.id) { notificationPingId = null; void OBR.popover.close(NOTIFICATION_POPOVER_ID).catch(() => undefined); } }, 5_000);
    }
    const completed = initialized ? pings.filter((ping) => !ping.session && (ping.type === "quiz" || ping.type === "vote" || ping.type === "nomination") && ping.status === "completed" && previousStatuses.get(ping.id) === "active" && (ping.type === "nomination" ? ping.sender.id === OBR.player.id : ping.sender.id === OBR.player.id || ping.recipients.some((recipient) => recipient.id === OBR.player.id) || Boolean(responseFor(responses, ping.id, OBR.player.id)) || previouslyRelevant.has(ping.id) || relevantBeforeCompletion.has(ping.id))) : [];
    if (completed.length && preference === "popover") await openNotificationPopover(completed[0].id);
    else if (completed.length && preference === "auto-open") await OBR.action.open();
    else if (completed.length && preference === "badge-toast") await OBR.notification.show(`${completed[0].type === "quiz" ? "Quiz" : completed[0].type === "vote" ? "Vote" : "Nomination"} results are ready.`, "INFO");
    await progressHostSession(metadata, pings, responses, OBR.player.id).catch(async (cause) => { await stopSession(metadata, OBR.player.id, false).catch(() => undefined); await OBR.notification.show(cause instanceof Error ? cause.message : "Unable to advance the Ping session.", "ERROR"); });
    for (const ping of waiting) seen.add(ping.id);
    setSeenPings(seen, OBR.player.id);
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
