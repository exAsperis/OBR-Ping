import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS, type MessagePing, type PingResponse, type VotePing } from "../domain";
import { PingCard } from "./PingCard";

afterEach(cleanup);

describe("PingCard", () => {
  it("shows completed Vote totals without voter-to-ballot mappings", () => {
    const gm = { id: "gm", name: "GM" }, ada = { id: "ada", name: "Ada" }, ben = { id: "ben", name: "Ben" };
    const ping: VotePing = { schemaVersion: 1, id: "v", type: "vote", sender: gm, recipients: [ada, ben], createdAt: 1, deadlineAt: 100, expiresAt: 1_000, status: "completed", completedAt: 3, content: { question: "Camp where?", mode: "single", options: [{ id: "cave", label: "Cave" }, { id: "road", label: "Road" }] } };
    const responses: PingResponse[] = [
      { schemaVersion: 1, pingId: "v", playerId: "ada", playerName: "Ada", respondedAt: 2, type: "vote", optionIds: ["cave"] },
      { schemaVersion: 1, pingId: "v", playerId: "ben", playerName: "Ben", respondedAt: 3, type: "vote", optionIds: ["road"] },
    ];
    const { container } = render(<PingCard ping={ping} responses={responses} currentPlayer={gm} role="GM" settings={DEFAULT_SETTINGS} metadata={{}} now={4} onReply={() => undefined} onRunoff={() => undefined} onChanged={() => undefined} />);
    expect(container.querySelector(".glyph-frame .ping-glyph")).toBeTruthy();
    expect(screen.getByText("Cave")).toBeTruthy();
    expect(screen.getByText("Road")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByText("Ben")).toBeNull();
    expect(screen.getAllByLabelText("Tied winner")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Runoff" })).toBeTruthy();
  });

  it("offers Reply and Reply All before an unread Message is marked read", () => {
    const gm = { id: "gm", name: "GM" }, player = { id: "p", name: "Player" };
    const ping: MessagePing = { schemaVersion: 1, id: "m", type: "message", sender: gm, recipients: [player], createdAt: 1, expiresAt: 1_000, status: "active", content: { message: "You hear footsteps.", allowReply: true, allowReplyAll: true } };
    const settings = { ...DEFAULT_SETTINGS, allowPlayers: true, allowedTypes: { ...DEFAULT_SETTINGS.allowedTypes, message: true } };
    render(<PingCard ping={ping} responses={[]} currentPlayer={player} role="PLAYER" settings={settings} metadata={{}} now={2} onReply={() => undefined} onRunoff={() => undefined} onChanged={() => undefined} />);
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply all" })).toBeTruthy();
    expect(screen.getByText("Read by 0/1")).toBeTruthy();
  });
});
