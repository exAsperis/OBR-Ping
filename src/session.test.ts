import { describe, expect, it } from "vitest";
import { buildSessionPing, calculateSessionScores, rankScores, rankingMessage } from "./session";
import { blankCatalogItem } from "./catalog";
import type { PingResponse, SessionScore } from "./domain";

describe("automated session scoring", () => {
  it("builds a fixed-roster Ping and accumulates correct answers", () => {
    const item = blankCatalogItem("quiz");
    if (item.type !== "quiz") throw new Error("Expected quiz");
    item.content.question = "Ready?"; item.content.options[0].label = "Yes"; item.content.options[1].label = "No";
    const host = { id: "gm", name: "GM" }, player = { id: "p", name: "Player" };
    const scores: SessionScore[] = [{ playerId: "p", playerName: "Player", score: 0, correctTimeMs: 0 }];
    const ping = buildSessionPing(item, host, [player], "s", 0, 2, scores, 1_000);
    const responses: PingResponse[] = [{ schemaVersion: 1, pingId: ping.id, playerId: "p", playerName: "Player", respondedAt: 2_500, type: "quiz", optionIds: [item.content.correctOptionIds[0]] }];
    expect(ping.recipients).toEqual([player]);
    expect(calculateSessionScores(scores, ping, responses)[0]).toMatchObject({ score: 1, correctTimeMs: 1_500 });
  });

  it("uses competition ranks and bounds the ranking message", () => {
    const scores: SessionScore[] = [{ playerId: "a", playerName: "Ada", score: 2, correctTimeMs: 100 }, { playerId: "b", playerName: "Ben", score: 2, correctTimeMs: 100 }, { playerId: "c", playerName: "Cy", score: 1, correctTimeMs: 50 }];
    expect(rankScores(scores).map((item) => item.rank)).toEqual([1, 1, 3]);
    expect(rankingMessage(scores)).toContain("3rd: Cy");
    expect(rankingMessage(scores).length).toBeLessThanOrEqual(300);
  });
});
