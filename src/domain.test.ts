import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SCHEMA_VERSION, canCreate, instantRunoff, isComplete, isRecipient, metadataBytes, parsePing, parseSettings, pingKey, projectedMetadata, quizStandings, readRoomState, replyRecipients, responseKey, waitingPings, type MessagePing, type PingResponse, type QuizPing, type VotePing } from "./domain";
import { METADATA_LIMIT_BYTES, SETTINGS_KEY } from "./constants";

const gm = { id: "gm", name: "Game Master" };
const ada = { id: "ada", name: "Ada" };
const ben = { id: "ben", name: "Ben" };
const options = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }];
const quiz: QuizPing = { schemaVersion: SCHEMA_VERSION, id: "quiz-1", type: "quiz", sender: gm, recipients: [ada, ben], createdAt: 1000, expiresAt: 61_000, status: "active", content: { question: "Choose", mode: "multiple", options, correctOptionIds: ["a", "c"] } };
const vote: VotePing = { schemaVersion: SCHEMA_VERSION, id: "vote-1", type: "vote", sender: gm, recipients: [ada, ben], createdAt: 1000, status: "active", content: { question: "Choose", mode: "ranked", options } };

describe("runtime validation", () => {
  it("accepts valid records and rejects malformed or oversized values", () => {
    expect(parsePing(quiz)).toEqual(quiz);
    expect(parsePing({ ...quiz, schemaVersion: 2 })).toBeNull();
    expect(parsePing({ ...quiz, content: { ...quiz.content, question: "x".repeat(301) } })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, schemaVersion: 2 })).toEqual(DEFAULT_SETTINGS);
  });

  it("only reads values stored beneath matching namespaced keys", () => {
    const response: PingResponse = { schemaVersion: 1, pingId: quiz.id, playerId: ada.id, playerName: ada.name, respondedAt: 2000, type: "quiz", optionIds: ["a", "c"] };
    const state = readRoomState({ [pingKey(quiz.id)]: quiz, [responseKey(quiz.id, ada.id)]: response, [`${responseKey(quiz.id, ben.id)}-spoof`]: { ...response, playerId: ben.id }, unrelated: 4 });
    expect(state.pings).toHaveLength(1);
    expect(state.responses).toEqual([response]);
  });
});

describe("permissions and waiting state", () => {
  it("defaults to GM-only creation", () => {
    expect(canCreate("GM", "quiz", DEFAULT_SETTINGS)).toBe(true);
    expect(canCreate("PLAYER", "message", DEFAULT_SETTINGS)).toBe(false);
    expect(canCreate("PLAYER", "message", { ...DEFAULT_SETTINGS, allowPlayers: true, allowedTypes: { ...DEFAULT_SETTINGS.allowedTypes, message: true } })).toBe(true);
  });

  it("removes answered and expired interactions from the waiting list", () => {
    const response: PingResponse = { schemaVersion: 1, pingId: quiz.id, playerId: ada.id, playerName: ada.name, respondedAt: 2000, type: "quiz", optionIds: ["a", "c"] };
    expect(waitingPings([quiz], [], ada.id, 2000)).toEqual([quiz]);
    expect(waitingPings([quiz], [response], ada.id, 2000)).toEqual([]);
    expect(waitingPings([quiz], [], ada.id, 70_000)).toEqual([]);
  });

  it("delivers active Pings to future joiners without completing early", () => {
    const futureQuiz: QuizPing = { ...quiz, recipients: [], includeFutureRecipients: true };
    expect(parsePing(futureQuiz)).toEqual(futureQuiz);
    expect(isRecipient(futureQuiz, "new-player", 2_000)).toBe(true);
    expect(waitingPings([futureQuiz], [], "new-player", 2_000)).toEqual([futureQuiz]);
    expect(isComplete(futureQuiz, [], 2_000)).toBe(false);
    expect(isRecipient(futureQuiz, "new-player", 70_000)).toBe(false);
  });
});

describe("results", () => {
  it("ranks exact-set correct Quiz responses before incorrect responses", () => {
    const responses: PingResponse[] = [
      { schemaVersion: 1, pingId: quiz.id, playerId: ben.id, playerName: ben.name, respondedAt: 2000, type: "quiz", optionIds: ["a"] },
      { schemaVersion: 1, pingId: quiz.id, playerId: ada.id, playerName: ada.name, respondedAt: 4000, type: "quiz", optionIds: ["c", "a"] },
    ];
    const standings = quizStandings(quiz, responses);
    expect(standings.map((item) => [item.player.id, item.correct])).toEqual([["ada", true], ["ben", false]]);
  });

  it("resolves instant runoff and eliminates the latest original option on a low tie", () => {
    const responses: PingResponse[] = [
      { schemaVersion: 1, pingId: vote.id, playerId: "1", playerName: "1", respondedAt: 1, type: "vote", optionIds: ["a", "b", "c"] },
      { schemaVersion: 1, pingId: vote.id, playerId: "2", playerName: "2", respondedAt: 1, type: "vote", optionIds: ["b", "a", "c"] },
      { schemaVersion: 1, pingId: vote.id, playerId: "3", playerName: "3", respondedAt: 1, type: "vote", optionIds: ["c", "b", "a"] },
    ];
    const rounds = instantRunoff(vote, responses);
    expect(rounds[0].eliminated).toBe("c");
    expect(rounds.at(-1)?.winner).toBe("b");
  });
});

describe("metadata accounting and replies", () => {
  it("projects updates and removals without mutating the original", () => {
    const metadata = { [SETTINGS_KEY]: DEFAULT_SETTINGS, keep: "value" };
    const projected = projectedMetadata(metadata, { keep: undefined, [pingKey(quiz.id)]: quiz });
    expect(projected.metadata.keep).toBeUndefined();
    expect(metadata.keep).toBe("value");
    expect(projected.bytes).toBe(metadataBytes(projected.metadata));
    expect(projected.bytes).toBeLessThan(METADATA_LIMIT_BYTES);
  });

  it("deduplicates Reply All and excludes the current player", () => {
    const message: MessagePing = { schemaVersion: 1, id: "m", type: "message", sender: gm, recipients: [ada, ben, ada], createdAt: 1, status: "active", content: { message: "Hi", allowReply: true, allowReplyAll: true } };
    expect(replyRecipients(message, ada.id, true).map((item) => item.id)).toEqual(["gm", "ben"]);
  });
});
