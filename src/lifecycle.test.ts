import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, pingKey, responseKey, type MessagePing, type PingResponse } from "./domain";
import { completionUpdate } from "./lifecycle";

const sender = { id: "gm", name: "GM" }, recipient = { id: "p", name: "Player" };
const message: MessagePing = { schemaVersion: SCHEMA_VERSION, id: "m", type: "message", sender, recipients: [recipient], createdAt: 100, status: "active", content: { message: "Listen", allowReply: false, allowReplyAll: false } };

describe("completionUpdate", () => {
  it("completes when every recipient responds", () => {
    const response: PingResponse = { schemaVersion: 1, pingId: message.id, playerId: recipient.id, playerName: recipient.name, respondedAt: 300, type: "message", read: true };
    const update = completionUpdate({ [pingKey(message.id)]: message, [responseKey(message.id, recipient.id)]: response }, 500);
    expect(update[pingKey(message.id)]).toMatchObject({ status: "completed", completedAt: 300 });
  });

  it("uses the deadline when an unanswered Ping expires", () => {
    const expiring = { ...message, expiresAt: 400 };
    const update = completionUpdate({ [pingKey(message.id)]: expiring }, 500);
    expect(update[pingKey(message.id)]).toMatchObject({ status: "completed", completedAt: 400 });
  });
});
