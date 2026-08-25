import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS, type MessagePing, type NominationPing, type PingResponse, type VotePing } from "../domain";
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

  it("labels an answered completed interaction as Results", () => {
    const gm = { id: "gm", name: "GM" }, player = { id: "p", name: "Player" };
    const ping: VotePing = { schemaVersion: 1, id: "v", type: "vote", sender: gm, recipients: [player], createdAt: 1, deadlineAt: 100, expiresAt: 1_000, status: "completed", completedAt: 3, content: { question: "Where?", mode: "single", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } };
    const responses: PingResponse[] = [{ schemaVersion: 1, pingId: "v", playerId: "p", playerName: "Player", respondedAt: 2, type: "vote", optionIds: ["a"] }];
    render(<PingCard ping={ping} responses={responses} currentPlayer={player} role="PLAYER" settings={DEFAULT_SETTINGS} metadata={{}} now={4} onReply={() => undefined} onRunoff={() => undefined} onChanged={() => undefined} />);
    expect(screen.getByText("Results")).toBeTruthy();
    expect(screen.queryByText("Response received")).toBeNull();
  });

  it("shows attributed nominations and deduplicates Vote options", () => {
    const gm = { id: "gm", name: "GM" }, ada = { id: "ada", name: "Ada" }, ben = { id: "ben", name: "Ben" };
    const ping: NominationPing = { schemaVersion: 1, id: "n", type: "nomination", sender: gm, recipients: [ada, ben], createdAt: 1, deadlineAt: 100, expiresAt: 1_000, status: "completed", completedAt: 101, content: { prompt: "Choose a guide" } };
    const responses: PingResponse[] = [
      { schemaVersion: 1, pingId: "n", playerId: "ada", playerName: "Ada", respondedAt: 2, type: "nomination", value: "  Rowan  " },
      { schemaVersion: 1, pingId: "n", playerId: "ben", playerName: "Ben", respondedAt: 3, type: "nomination", value: "rowan" },
      { schemaVersion: 1, pingId: "n", playerId: "cy", playerName: "Cy", respondedAt: 4, type: "nomination", value: "Morgan" },
    ];
    let prefill: Parameters<React.ComponentProps<typeof PingCard>["onRunoff"]>[0] | undefined;
    render(<PingCard ping={ping} responses={responses} currentPlayer={gm} role="GM" settings={DEFAULT_SETTINGS} metadata={{}} now={102} onReply={() => undefined} onRunoff={(value) => { prefill = value; }} onChanged={() => undefined} />);
    expect(screen.getByText("Nominated by Ada")).toBeTruthy();
    expect(screen.getByText("Nominated by Ben")).toBeTruthy();
    expect(screen.getByText("Nominated by Cy")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save list" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create Vote" }));
    expect(prefill?.options.map((option) => option.label)).toEqual(["Rowan", "Morgan"]);
  });
});
