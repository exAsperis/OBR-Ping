import { describe, expect, it } from "vitest";
import { METADATA_LIMIT_BYTES, SESSION_LOCK_KEY } from "./constants";
import { SCHEMA_VERSION, pingKey, projectedMetadata, responseKey, type MessagePing, type PingResponse } from "./domain";
import { CapacityError, fitMetadataUpdate } from "./storage";

const sender = { id: "gm", name: "GM" }, recipient = { id: "p", name: "Player" };
const makePing = (id: string, status: "active" | "completed", completedAt?: number): MessagePing => ({ schemaVersion: SCHEMA_VERSION, id, type: "message", sender, recipients: [recipient], createdAt: 100, deadlineAt: 1000, expiresAt: 100_000, status, ...(completedAt === undefined ? {} : { completedAt }), content: { message: "x".repeat(300), allowReply: false, allowReplyAll: false } });

describe("metadata capacity eviction", () => {
  it("evicts finished Pings oldest-first with their responses and preserves active data and locks", () => {
    const old = makePing("old", "completed", 200), newer = makePing("new", "completed", 300), active = makePing("active", "active");
    const oldResponse: PingResponse = { schemaVersion: 1, pingId: old.id, playerId: recipient.id, playerName: recipient.name, respondedAt: 150, type: "message", read: true };
    const filler = "z".repeat(METADATA_LIMIT_BYTES - 2_500);
    const metadata = { [pingKey(old.id)]: old, [responseKey(old.id, recipient.id)]: oldResponse, [pingKey(newer.id)]: newer, [pingKey(active.id)]: active, [SESSION_LOCK_KEY]: { id: "lock" }, filler };
    const requested = { added: "a".repeat(1_000) };
    expect(projectedMetadata(metadata, requested).fits).toBe(false);
    const update = fitMetadataUpdate(metadata, requested);
    expect(update[pingKey(old.id)]).toBeUndefined();
    expect(update[responseKey(old.id, recipient.id)]).toBeUndefined();
    expect(update).not.toHaveProperty(pingKey(active.id));
    expect(update).not.toHaveProperty(SESSION_LOCK_KEY);
    expect(projectedMetadata(metadata, update).fits).toBe(true);
  });

  it("reports capacity failure when active/shared data alone cannot fit", () => {
    const active = makePing("active", "active");
    const metadata = { [pingKey(active.id)]: active, filler: "z".repeat(METADATA_LIMIT_BYTES) };
    expect(() => fitMetadataUpdate(metadata, { added: "x" })).toThrow(CapacityError);
  });
});
