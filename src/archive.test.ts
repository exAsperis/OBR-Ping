import { describe, expect, it } from "vitest";
import { isArchiveRelevant, mergeSharedAndArchived, parseArchivedPing, type ArchivedPingRecord } from "./archive";
import { SCHEMA_VERSION, type MessagePing, type PingResponse } from "./domain";

const sender = { id: "gm", name: "GM" }, recipient = { id: "p", name: "Player" };
const ping: MessagePing = { schemaVersion: SCHEMA_VERSION, id: "m", type: "message", sender, recipients: [recipient], createdAt: 100, deadlineAt: 600, expiresAt: 10_000, status: "active", content: { message: "Listen", allowReply: false, allowReplyAll: false } };
const response: PingResponse = { schemaVersion: 1, pingId: ping.id, playerId: recipient.id, playerName: recipient.name, respondedAt: 300, type: "message", read: true };
const archived = (snapshot = ping, responses = [response]): ArchivedPingRecord => ({ schemaVersion: 1, key: `room\u0000p\u0000${snapshot.id}`, roomId: "room", playerId: "p", ping: snapshot, responses, archivedAt: 400, expiresAt: snapshot.expiresAt });

describe("local Ping archive", () => {
  it("archives senders, recipients, future recipients, and respondents but not unrelated GMs", () => {
    expect(isArchiveRelevant(ping, [], sender.id, 200)).toBe(true);
    expect(isArchiveRelevant(ping, [], recipient.id, 200)).toBe(true);
    expect(isArchiveRelevant({ ...ping, recipients: [], includeFutureRecipients: true }, [], "future", 200)).toBe(true);
    expect(isArchiveRelevant(ping, [{ ...response, playerId: "respondent" }], "respondent", 200)).toBe(true);
    expect(isArchiveRelevant(ping, [], "unrelated-gm", 200)).toBe(false);
  });

  it("validates record ownership and rejects corrupt responses", () => {
    expect(parseArchivedPing(archived())).not.toBeNull();
    expect(parseArchivedPing({ ...archived(), key: "wrong" })).toBeNull();
    expect(parseArchivedPing(archived(ping, [{ ...response, pingId: "other" }]))).toBeNull();
  });

  it("lets shared snapshots win and restores archived-only responses after retirement", () => {
    const stale = archived({ ...ping, content: { ...ping.content, message: "Old" } });
    const shared = mergeSharedAndArchived([ping], [], [stale], 200);
    expect(shared.pings).toEqual([ping]); expect(shared.responses).toEqual([]);
    const local = mergeSharedAndArchived([], [], [stale], 700);
    expect(local.pings[0]).toMatchObject({ status: "completed", completedAt: ping.deadlineAt, content: { message: "Old" } });
    expect(local.responses).toEqual([response]);
  });
});
