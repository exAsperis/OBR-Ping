import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, pingKey, responseKey, type MessagePing, type PingResponse, type QuizPing } from "./domain";
import { lifecycleUpdate } from "./lifecycle";

const sender = { id: "gm", name: "GM" }, recipient = { id: "p", name: "Player" };
const message: MessagePing = { schemaVersion: SCHEMA_VERSION, id: "m", type: "message", sender, recipients: [recipient], createdAt: 100, expiresAt: 1_000, status: "active", content: { message: "Listen", allowReply: false, allowReplyAll: false } };

describe("lifecycleUpdate", () => {
  it("completes when every recipient responds", () => {
    const response: PingResponse = { schemaVersion: 1, pingId: message.id, playerId: recipient.id, playerName: recipient.name, respondedAt: 300, type: "message", read: true };
    const update = lifecycleUpdate({ [pingKey(message.id)]: message, [responseKey(message.id, recipient.id)]: response }, 500);
    expect(update[pingKey(message.id)]).toMatchObject({ status: "completed", completedAt: 300 });
  });

  it("uses the event deadline when an unanswered interaction ends", () => {
    const quiz: QuizPing = { schemaVersion: 1, id: "q", type: "quiz", sender, recipients: [recipient], createdAt: 100, deadlineAt: 400, expiresAt: 1_000, status: "active", content: { question: "Ready?", mode: "single", options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }], correctOptionIds: ["y"] } };
    const update = lifecycleUpdate({ [pingKey(quiz.id)]: quiz }, 500);
    expect(update[pingKey(quiz.id)]).toMatchObject({ status: "completed", completedAt: 400 });
  });

  it("deletes an expired Ping and all of its responses", () => {
    const response: PingResponse = { schemaVersion: 1, pingId: message.id, playerId: recipient.id, playerName: recipient.name, respondedAt: 300, type: "message", read: true };
    const responseMetadataKey = responseKey(message.id, recipient.id);
    const update = lifecycleUpdate({ [pingKey(message.id)]: message, [responseMetadataKey]: response }, 1_000);
    expect(update).toMatchObject({ [pingKey(message.id)]: undefined, [responseMetadataKey]: undefined });
  });
});
