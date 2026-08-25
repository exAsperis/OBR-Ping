import { ARCHIVE_CHANNEL, ARCHIVE_DB_NAME, ARCHIVE_WARNING_KEY } from "./constants";
import { isPastDeadline, isRecipient, parsePing, parseResponse, responsesFor, type PingRecord, type PingResponse } from "./domain";

const STORE = "pings";
const DB_VERSION = 1;

export interface ArchivedPingRecord {
  schemaVersion: 1;
  key: string;
  roomId: string;
  playerId: string;
  ping: PingRecord;
  responses: PingResponse[];
  archivedAt: number;
  expiresAt: number;
}

export interface ArchiveStats { count: number; bytes: number }
export type ArchiveStatus = "ready" | "unavailable";

const archiveKey = (roomId: string, playerId: string, pingId: string) => `${roomId}\u0000${playerId}\u0000${pingId}`;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed.")); });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")); transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")); });
}

async function openArchive() {
  if (!globalThis.indexedDB) throw new Error("Local Ping history is unavailable in this browser.");
  const request = indexedDB.open(ARCHIVE_DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE)) {
      const store = database.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("owner", ["roomId", "playerId"], { unique: false });
      store.createIndex("expiry", "expiresAt", { unique: false });
    }
  };
  return requestResult(request);
}

export function parseArchivedPing(value: unknown): ArchivedPingRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ArchivedPingRecord>;
  const ping = parsePing(record.ping);
  if (record.schemaVersion !== 1 || typeof record.key !== "string" || typeof record.roomId !== "string" || !record.roomId || typeof record.playerId !== "string" || !record.playerId || !ping || !Array.isArray(record.responses) || typeof record.archivedAt !== "number" || !Number.isFinite(record.archivedAt) || record.expiresAt !== ping.expiresAt || record.key !== archiveKey(record.roomId, record.playerId, ping.id)) return null;
  const responses = record.responses.map(parseResponse);
  if (responses.some((response) => !response || response.pingId !== ping.id)) return null;
  return { ...record, ping, responses: responses as PingResponse[] } as ArchivedPingRecord;
}

export function isArchiveRelevant(ping: PingRecord, responses: PingResponse[], playerId: string, now = Date.now()) {
  return ping.sender.id === playerId || isRecipient(ping, playerId, now) || responsesFor(responses, ping.id).some((response) => response.playerId === playerId);
}

function announceArchiveChange() {
  if (typeof BroadcastChannel === "undefined") return;
  try { const channel = new BroadcastChannel(ARCHIVE_CHANNEL); channel.postMessage("changed"); channel.close(); } catch { /* Archive persistence remains usable without cross-context messaging. */ }
}

export function claimArchiveFailureWarning() {
  try { if (localStorage.getItem(ARCHIVE_WARNING_KEY)) return false; localStorage.setItem(ARCHIVE_WARNING_KEY, "1"); return true; }
  catch { return true; }
}

export async function archiveRoomState(roomId: string, playerId: string, pings: PingRecord[], responses: PingResponse[], now = Date.now()) {
  const database = await openArchive();
  const transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE);
  const existingValues = await requestResult(store.index("owner").getAll(IDBKeyRange.only([roomId, playerId])));
  let changed = false;
  const existingRecords: ArchivedPingRecord[] = [];
  for (const value of existingValues) {
    const record = parseArchivedPing(value);
    if (record && record.expiresAt > now) existingRecords.push(record);
    else if (value && typeof value === "object" && typeof (value as { key?: unknown }).key === "string") { store.delete((value as { key: string }).key); changed = true; }
  }
  const existingByPing = new Map(existingRecords.map((record) => [record.ping.id, record]));
  for (const ping of pings) {
    const key = archiveKey(roomId, playerId, ping.id);
    const existing = existingByPing.get(ping.id);
    if (ping.expiresAt <= now) { if (existing) { store.delete(key); changed = true; } continue; }
    if (!existing && !isArchiveRelevant(ping, responses, playerId, now)) continue;
    const relevantResponses = responsesFor(responses, ping.id);
    if (existing && JSON.stringify(existing.ping) === JSON.stringify(ping) && JSON.stringify(existing.responses) === JSON.stringify(relevantResponses)) continue;
    const record: ArchivedPingRecord = { schemaVersion: 1, key, roomId, playerId, ping, responses: relevantResponses, archivedAt: now, expiresAt: ping.expiresAt };
    store.put(record); changed = true;
  }
  await transactionDone(transaction); database.close();
  if (changed) announceArchiveChange();
}

export async function getArchivedPings(roomId: string, playerId: string, now = Date.now()) {
  const database = await openArchive();
  const transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE), index = store.index("owner");
  const values = await requestResult(index.getAll(IDBKeyRange.only([roomId, playerId])));
  const records: ArchivedPingRecord[] = [];
  let changed = false;
  for (const value of values) {
    const record = parseArchivedPing(value);
    if (!record || record.expiresAt <= now) { if (value && typeof value === "object" && typeof (value as { key?: unknown }).key === "string") store.delete((value as { key: string }).key); changed = true; }
    else records.push(record);
  }
  await transactionDone(transaction); database.close();
  if (changed) announceArchiveChange();
  return records;
}

export async function deleteArchivedPing(roomId: string, playerId: string, pingId: string) {
  const database = await openArchive(), transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(archiveKey(roomId, playerId, pingId));
  await transactionDone(transaction); database.close(); announceArchiveChange();
}

export async function clearArchivedPings(roomId: string, playerId: string, mode: "expired" | "all", now = Date.now()) {
  const database = await openArchive(), transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE), index = store.index("owner");
  const values = await requestResult(index.getAll(IDBKeyRange.only([roomId, playerId])));
  let removed = 0;
  for (const value of values) {
    const record = parseArchivedPing(value), key = value && typeof value === "object" && typeof (value as { key?: unknown }).key === "string" ? (value as { key: string }).key : undefined;
    if (key && (mode === "all" || !record || record.expiresAt <= now)) { store.delete(key); removed += 1; }
  }
  await transactionDone(transaction); database.close(); if (removed) announceArchiveChange(); return removed;
}

export async function getArchiveStats(roomId: string, playerId: string) {
  const records = await getArchivedPings(roomId, playerId);
  return { count: records.length, bytes: new TextEncoder().encode(JSON.stringify(records)).length } satisfies ArchiveStats;
}

export function subscribeArchiveChanges(callback: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  try { const channel = new BroadcastChannel(ARCHIVE_CHANNEL); channel.onmessage = callback; return () => channel.close(); }
  catch { return () => undefined; }
}

export function mergeSharedAndArchived(sharedPings: PingRecord[], sharedResponses: PingResponse[], archived: ArchivedPingRecord[], now = Date.now()) {
  const sharedIds = new Set(sharedPings.map((ping) => ping.id));
  const localPings = archived.filter((record) => !sharedIds.has(record.ping.id)).map((record) => isPastDeadline(record.ping, now) ? { ...record.ping, status: "completed" as const, completedAt: record.ping.deadlineAt } : record.ping);
  const pings = [...sharedPings, ...localPings];
  const responses = [...sharedResponses, ...archived.filter((record) => !sharedIds.has(record.ping.id)).flatMap((record) => record.responses)];
  return { pings, responses };
}
