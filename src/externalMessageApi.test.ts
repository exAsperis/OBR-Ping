import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Participant, type RoomSettings } from "./domain";
import { buildExternalMessage, ExternalMessageError, parseExternalMessageRequest } from "./externalMessageApi";

const sender: Participant = { id: "gm", name: "Game Master", color: "#111111" };
const alice: Participant = { id: "alice", name: "Alice", color: "#222222" };
const bob: Participant = { id: "bob", name: "Bob", color: "#333333" };
const request = (overrides: Record<string, unknown> = {}) => ({ version: 1, requestId: "request-1", message: " Gather round ", recipients: { playerIds: [alice.id] }, ...overrides });
const context = (role: "GM" | "PLAYER" = "GM", settings: RoomSettings = DEFAULT_SETTINGS) => ({ role, sender, players: [alice, bob], settings });

describe("external Message API", () => {
  it("builds a Message using room timing defaults", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    const ping = buildExternalMessage(request(), context(), 1_000);
    expect(ping).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      sender,
      recipients: [alice],
      createdAt: 1_000,
      deadlineAt: 1_000 + DEFAULT_SETTINGS.defaultDeadlineMinutes * 60_000,
      expiresAt: 1_000 + DEFAULT_SETTINGS.defaultExpiryMinutes * 60_000,
      content: { message: "Gather round", allowReply: false, allowReplyAll: false },
    });
  });

  it("supports everyone, future recipients, and bounded overrides", () => {
    const ping = buildExternalMessage(request({
      recipients: { everyone: true, includeFutureRecipients: true },
      options: { deadlineMinutes: 2, expiryMinutes: 10, allowReply: false, allowReplyAll: true },
    }), context(), 10_000);
    expect(ping.recipients).toEqual([alice, bob]);
    expect(ping.includeFutureRecipients).toBe(true);
    expect(ping.deadlineAt).toBe(130_000);
    expect(ping.expiresAt).toBe(610_000);
    expect(ping.content).toMatchObject({ allowReply: true, allowReplyAll: true });
  });

  it("allows players only when room Message creation is enabled", () => {
    expect(() => buildExternalMessage(request(), context("PLAYER"))).toThrowError(expect.objectContaining({ code: "PERMISSION_DENIED" }));
    const settings = { ...DEFAULT_SETTINGS, allowPlayers: true, allowedTypes: { ...DEFAULT_SETTINGS.allowedTypes, message: true } };
    expect(buildExternalMessage(request(), context("PLAYER", settings)).sender).toEqual(sender);
  });

  it.each([
    [{ version: 2, requestId: "r", message: "Hello", recipients: { everyone: true } }, "INVALID_REQUEST"],
    [request({ message: "   " }), "INVALID_REQUEST"],
    [request({ message: "x".repeat(301) }), "INVALID_REQUEST"],
    [request({ options: { deadlineMinutes: 0 } }), "INVALID_REQUEST"],
    [request({ options: { deadlineMinutes: 10, expiryMinutes: 10 } }), "INVALID_REQUEST"],
    [request({ recipients: { playerIds: [alice.id, alice.id] } }), "INVALID_RECIPIENTS"],
    [request({ recipients: { playerIds: ["missing"] } }), "INVALID_RECIPIENTS"],
    [request({ recipients: { playerIds: [sender.id] } }), "INVALID_RECIPIENTS"],
    [request({ recipients: {} }), "INVALID_RECIPIENTS"],
  ])("rejects invalid input", (value, code) => {
    try { buildExternalMessage(value, context()); throw new Error("Expected rejection"); }
    catch (cause) { expect(cause).toBeInstanceOf(ExternalMessageError); expect((cause as ExternalMessageError).code).toBe(code); }
  });

  it("accepts future recipients without a current recipient", () => {
    const ping = buildExternalMessage(request({ recipients: { includeFutureRecipients: true } }), context());
    expect(ping.recipients).toEqual([]);
    expect(ping.includeFutureRecipients).toBe(true);
  });

  it("returns a normalized public request", () => {
    expect(parseExternalMessageRequest(request())).toMatchObject({ requestId: "request-1", message: "Gather round" });
  });
});
