import { beforeEach, describe, expect, it } from "vitest";
import { getNotificationPreference, getSeenPings, getSoundEnabled, setNotificationPreference, setSeenPings, setSoundEnabled } from "./preferences";

describe("local preferences", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to a separate popover and persists an override", () => {
    expect(getNotificationPreference()).toBe("popover");
    setNotificationPreference("auto-open");
    expect(getNotificationPreference()).toBe("auto-open");
  });
  it("persists a bounded seen-Ping set", () => {
    setSeenPings(["a", "b"]);
    expect([...getSeenPings()]).toEqual(["a", "b"]);
  });
  it("isolates delivery history between Owlbear players", () => {
    setSeenPings(["ping-a"], "player-a");
    setSeenPings(["ping-b"], "player-b");
    expect([...getSeenPings("player-a")]).toEqual(["ping-a"]);
    expect([...getSeenPings("player-b")]).toEqual(["ping-b"]);
  });
  it("enables delivery sounds by default and persists an override", () => {
    expect(getSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(getSoundEnabled()).toBe(false);
  });
});
