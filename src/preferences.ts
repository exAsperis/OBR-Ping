import { PREFERENCE_KEY, SEEN_KEY, SOUND_KEY } from "./constants";

export type NotificationPreference = "popover" | "badge-toast" | "badge" | "auto-open";

export function getNotificationPreference(): NotificationPreference {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === "popover" || value === "badge" || value === "auto-open" || value === "badge-toast" ? value : "popover";
  } catch { return "popover"; }
}

export function setNotificationPreference(value: NotificationPreference) {
  try { localStorage.setItem(PREFERENCE_KEY, value); } catch { /* Preference remains at its default. */ }
}

export function getSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== "false"; }
  catch { return true; }
}

export function setSoundEnabled(value: boolean) {
  try { localStorage.setItem(SOUND_KEY, String(value)); } catch { /* Sound remains at its default. */ }
}

export function getSeenPings(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : []);
  } catch { return new Set(); }
}

export function setSeenPings(ids: Iterable<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200))); } catch { /* Badge still works without persistence. */ }
}
