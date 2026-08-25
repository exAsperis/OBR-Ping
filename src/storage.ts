import OBR from "@owlbear-rodeo/sdk";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { METADATA_LIMIT_BYTES, SETTINGS_KEY } from "./constants";
import { pingKey, projectedMetadata, responseKey, type PingRecord, type PingResponse, type RoomSettings } from "./domain";

export class CapacityError extends Error {
  constructor(public readonly projectedBytes: number) {
    super(`This write would use ${projectedBytes.toLocaleString()} of ${METADATA_LIMIT_BYTES.toLocaleString()} room metadata bytes.`);
  }
}

export async function safeSetMetadata(update: Record<string, unknown>, current?: Metadata) {
  const metadata = current ?? await OBR.room.getMetadata();
  const projected = projectedMetadata(metadata, update);
  if (!projected.fits) throw new CapacityError(projected.bytes);
  await OBR.room.setMetadata(update);
}

export const saveSettings = (settings: RoomSettings, current?: Metadata) => safeSetMetadata({ [SETTINGS_KEY]: settings }, current);
export const savePing = (ping: PingRecord, current?: Metadata) => safeSetMetadata({ [pingKey(ping.id)]: ping }, current);
export const saveResponse = (response: PingResponse, current?: Metadata) => safeSetMetadata({ [responseKey(response.pingId, response.playerId)]: response }, current);
export const removeResponse = (pingId: string, playerId: string, current?: Metadata) => safeSetMetadata({ [responseKey(pingId, playerId)]: undefined }, current);

export async function removePing(pingId: string, metadata?: Metadata) {
  const current = metadata ?? await OBR.room.getMetadata();
  const update: Record<string, unknown> = { [pingKey(pingId)]: undefined };
  for (const key of Object.keys(current)) if (key.startsWith(responseKey(pingId, ""))) update[key] = undefined;
  await OBR.room.setMetadata(update);
}

export async function removePings(pingIds: string[], metadata?: Metadata) {
  const current = metadata ?? await OBR.room.getMetadata();
  const ids = new Set(pingIds);
  const update: Record<string, unknown> = {};
  for (const id of ids) update[pingKey(id)] = undefined;
  for (const key of Object.keys(current)) {
    for (const id of ids) if (key.startsWith(`${responseKey(id, "")}`)) update[key] = undefined;
  }
  await OBR.room.setMetadata(update);
}
