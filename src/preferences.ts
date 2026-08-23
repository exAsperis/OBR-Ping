import { PREFERENCE_KEY, SEEN_KEY } from "./constants";

export type NotificationPreference = "badge-toast" | "badge" | "auto-open";

export function getNotificationPreference(): NotificationPreference {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === "badge" || value === "auto-open" || value === "badge-toast" ? value : "badge-toast";
  } catch { return "badge-toast"; }
}

export function setNotificationPreference(value: NotificationPreference) {
  try { localStorage.setItem(PREFERENCE_KEY, value); } catch { /* Preference remains at its default. */ }
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
