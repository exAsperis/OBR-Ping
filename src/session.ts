import type { Metadata } from "@owlbear-rodeo/sdk";
import { HOST_SESSION_KEY, SESSION_LOCK_KEY } from "./constants";
import { SCHEMA_VERSION, pingKey, responsesFor, type MessagePing, type Participant, type PingRecord, type PingResponse, type RoomSettings, type SessionScore } from "./domain";
import { parseCatalogItem, type Catalog, type CatalogItem } from "./catalog";
import { safeSetMetadata } from "./storage";

export interface SessionLock { schemaVersion: 1; id: string; host: Participant; currentPingId: string; type: Catalog["type"]; index: number; total: number; phase: "active" | "results" }
export interface HostSession { schemaVersion: 1; id: string; host: Participant; roster: Participant[]; items: CatalogItem[]; index: number; currentPingId: string; scores: SessionScore[]; resultsUntil?: number; defaultDeadlineMinutes: number; defaultExpiryMinutes: number }

export function readSessionLock(metadata: Metadata): SessionLock | null {
  const value = metadata[SESSION_LOCK_KEY] as Partial<SessionLock> | undefined;
  return value?.schemaVersion === SCHEMA_VERSION && typeof value.id === "string" && value.id.length > 0 && value.host && typeof value.host.id === "string" && value.host.id.length > 0 && typeof value.host.name === "string" && typeof value.currentPingId === "string" && value.currentPingId.length > 0 && ["message", "quiz", "vote", "nomination"].includes(String(value.type)) && Number.isSafeInteger(value.index) && Number(value.index) >= 0 && Number.isSafeInteger(value.total) && Number(value.total) > Number(value.index) && (value.phase === "active" || value.phase === "results") ? value as SessionLock : null;
}

export function loadHostSession(): HostSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(HOST_SESSION_KEY) ?? "null") as Partial<HostSession> | null;
    if (value?.schemaVersion !== SCHEMA_VERSION || typeof value.id !== "string" || !value.host || typeof value.host.id !== "string" || typeof value.host.name !== "string" || !Array.isArray(value.roster) || !value.roster.every((player) => player && typeof player.id === "string" && typeof player.name === "string") || !Array.isArray(value.items) || !Number.isSafeInteger(value.index) || Number(value.index) < 0 || Number(value.index) >= value.items.length || typeof value.currentPingId !== "string" || !Array.isArray(value.scores) || !value.scores.every((score) => score && typeof score.playerId === "string" && typeof score.playerName === "string" && Number.isFinite(score.score) && Number(score.score) >= 0 && Number.isFinite(score.correctTimeMs) && Number(score.correctTimeMs) >= 0) || !Number.isSafeInteger(value.defaultDeadlineMinutes) || Number(value.defaultDeadlineMinutes) <= 0 || !Number.isSafeInteger(value.defaultExpiryMinutes) || Number(value.defaultExpiryMinutes) <= Number(value.defaultDeadlineMinutes)) return null;
    const items = value.items.map(parseCatalogItem);
    if (items.some((item) => !item)) return null;
    return { ...value, items } as HostSession;
  } catch { return null; }
}

export function saveHostSession(session: HostSession | null) {
  try { session ? localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(HOST_SESSION_KEY); }
  catch { throw new Error("Unable to persist the session on this device."); }
}

export function buildSessionPing(item: CatalogItem, host: Participant, roster: Participant[], sessionId: string, index: number, total: number, scores: SessionScore[], now = Date.now()): PingRecord {
  const base = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), sender: host, recipients: roster, createdAt: now, deadlineAt: now + item.deadlineMinutes * 60_000, expiresAt: now + item.expiryMinutes * 60_000, status: "active" as const, session: { id: sessionId, host, index, total, ...(item.type === "quiz" ? { scores } : {}) } };
  return { ...base, type: item.type, content: item.content } as PingRecord;
}

export async function startSession(catalog: Catalog, host: Participant, roster: Participant[], settings: RoomSettings, metadata: Metadata) {
  if (readSessionLock(metadata)) throw new Error("Another automated session is already running in this room.");
  if (!catalog.items.length || !roster.length) throw new Error("A session needs at least one Ping and one active player.");
  const id = crypto.randomUUID();
  const scores = roster.map((player) => ({ playerId: player.id, playerName: player.name, score: 0, correctTimeMs: 0 }));
  const ping = buildSessionPing(catalog.items[0], host, roster, id, 0, catalog.items.length, scores);
  const lock: SessionLock = { schemaVersion: SCHEMA_VERSION, id, host, currentPingId: ping.id, type: catalog.type, index: 0, total: catalog.items.length, phase: "active" };
  const local: HostSession = { schemaVersion: SCHEMA_VERSION, id, host, roster, items: structuredClone(catalog.items), index: 0, currentPingId: ping.id, scores, defaultDeadlineMinutes: settings.defaultDeadlineMinutes, defaultExpiryMinutes: settings.defaultExpiryMinutes };
  saveHostSession(local);
  try { await safeSetMetadata({ [SESSION_LOCK_KEY]: lock, [pingKey(ping.id)]: ping }, metadata); }
  catch (cause) { saveHostSession(null); throw cause; }
  return ping;
}

export function calculateSessionScores(baseScores: SessionScore[], ping: PingRecord, responses: PingResponse[]) {
  if (ping.type !== "quiz") return baseScores;
  const relevant = responsesFor(responses, ping.id);
  return baseScores.map((standing) => {
    const response = relevant.find((item) => item.type === "quiz" && item.playerId === standing.playerId);
    const correct = response?.type === "quiz" && response.optionIds.length === ping.content.correctOptionIds.length && response.optionIds.every((id) => ping.content.correctOptionIds.includes(id));
    return correct ? { ...standing, score: standing.score + 1, correctTimeMs: standing.correctTimeMs + Math.max(0, response.respondedAt - ping.createdAt) } : standing;
  });
}

export function rankScores(scores: SessionScore[]) {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.correctTimeMs - b.correctTimeMs || a.playerName.localeCompare(b.playerName));
  let previous: SessionScore | undefined, previousRank = 0;
  return sorted.map((score, index) => {
    const rank = previous && score.score === previous.score && score.correctTimeMs === previous.correctTimeMs ? previousRank : index + 1;
    previous = score; previousRank = rank;
    return { ...score, rank };
  });
}

export function rankingMessage(scores: SessionScore[], limit = 300) {
  const ranked = rankScores(scores);
  let text = "Final ranking\n";
  for (const standing of ranked) {
    const label = standing.rank === 1 ? "1st" : standing.rank === 2 ? "2nd" : standing.rank === 3 ? "3rd" : `${standing.rank}th`;
    const line = `${label}: ${standing.playerName} — ${standing.score} point${standing.score === 1 ? "" : "s"}\n`;
    if (text.length + line.length > limit) { const omitted = "… lower ranks omitted"; if (text.length + omitted.length <= limit) text += omitted; break; }
    text += line;
  }
  return text.trimEnd();
}

export async function progressHostSession(metadata: Metadata, pings: PingRecord[], responses: PingResponse[], currentPlayerId: string, now = Date.now()) {
  const session = loadHostSession(), lock = readSessionLock(metadata);
  if (!session || !lock || session.id !== lock.id || session.host.id !== lock.host.id || session.host.id !== currentPlayerId) return;
  const ping = pings.find((item) => item.id === session.currentPingId);
  if (!ping || ping.status !== "completed") return;
  if (!session.resultsUntil) {
    session.scores = calculateSessionScores(session.scores, ping, responses);
    session.resultsUntil = now + 5_000;
    saveHostSession(session);
    await safeSetMetadata({ [SESSION_LOCK_KEY]: { ...lock, phase: "results" } }, metadata);
    return;
  }
  if (now < session.resultsUntil) return;
  const nextIndex = session.index + 1;
  if (nextIndex < session.items.length) {
    const next = buildSessionPing(session.items[nextIndex], session.host, session.roster, session.id, nextIndex, session.items.length, session.scores, now);
    const nextLock: SessionLock = { ...lock, currentPingId: next.id, index: nextIndex, phase: "active" };
    const update = { [SESSION_LOCK_KEY]: nextLock, [pingKey(next.id)]: next };
    await safeSetMetadata(update, metadata);
    session.index = nextIndex; session.currentPingId = next.id; delete session.resultsUntil; saveHostSession(session);
    return;
  }
  if (ping.type === "quiz") {
    const createdAt = now;
    const final: MessagePing = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), type: "message", sender: session.host, recipients: session.roster, createdAt, deadlineAt: createdAt + session.defaultDeadlineMinutes * 60_000, expiresAt: createdAt + session.defaultExpiryMinutes * 60_000, status: "active", content: { message: rankingMessage(session.scores), allowReply: false, allowReplyAll: false } };
    await safeSetMetadata({ [SESSION_LOCK_KEY]: undefined, [pingKey(final.id)]: final }, metadata);
  } else await safeSetMetadata({ [SESSION_LOCK_KEY]: undefined }, metadata);
  saveHostSession(null);
}

export async function stopSession(metadata: Metadata, currentPlayerId: string, isGm: boolean) {
  const lock = readSessionLock(metadata);
  if (!lock || (!isGm && lock.host.id !== currentPlayerId)) throw new Error("You cannot stop this session.");
  const update: Record<string, unknown> = { [SESSION_LOCK_KEY]: undefined };
  const ping = metadata[pingKey(lock.currentPingId)] as PingRecord | undefined;
  if (ping?.status === "active") update[pingKey(ping.id)] = { ...ping, status: "cancelled", cancelledAt: Date.now() };
  await safeSetMetadata(update, metadata);
  const local = loadHostSession(); if (local?.id === lock.id) saveHostSession(null);
}
