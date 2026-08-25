import { beforeEach, describe, expect, it } from "vitest";
import { blankCatalogItem, loadCatalogs, parseCatalog, saveCatalogs, type Catalog } from "./catalog";

beforeEach(() => localStorage.clear());

describe("catalog storage", () => {
  it("round-trips a valid single-type catalog locally", () => {
    const item = blankCatalogItem("message");
    if (item.type !== "message") throw new Error("Expected message");
    item.content.message = "Remember the clue";
    const catalog: Catalog = { schemaVersion: 1, id: "c", name: "Clues", type: "message", createdAt: 1, updatedAt: 1, items: [item] };
    saveCatalogs([catalog]);
    expect(loadCatalogs()).toEqual([catalog]);
  });

  it("rejects mixed item types and duplicate names", () => {
    const quiz = blankCatalogItem("quiz");
    if (quiz.type === "quiz") { quiz.content.question = "Question"; quiz.content.options[0].label = "A"; quiz.content.options[1].label = "B"; }
    expect(parseCatalog({ schemaVersion: 1, id: "c", name: "Mixed", type: "message", createdAt: 1, updatedAt: 1, items: [quiz] })).toBeNull();
    const empty = { schemaVersion: 1, id: "a", name: "Same", type: "message", createdAt: 1, updatedAt: 1, items: [] } as Catalog;
    expect(() => saveCatalogs([empty, { ...empty, id: "b", name: "same" }])).toThrow(/unique/i);
  });
});
