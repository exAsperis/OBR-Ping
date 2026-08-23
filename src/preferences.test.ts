import { beforeEach, describe, expect, it } from "vitest";
import { getNotificationPreference, getSeenPings, getSoundEnabled, setNotificationPreference, setSeenPings, setSoundEnabled } from "./preferences";

describe("local preferences", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to badge and toast and persists an override", () => {
    expect(getNotificationPreference()).toBe("badge-toast");
    setNotificationPreference("auto-open");
    expect(getNotificationPreference()).toBe("auto-open");
  });
  it("persists a bounded seen-Ping set", () => {
    setSeenPings(["a", "b"]);
    expect([...getSeenPings()]).toEqual(["a", "b"]);
  });
  it("enables delivery sounds by default and persists an override", () => {
    expect(getSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(getSoundEnabled()).toBe(false);
  });
});
