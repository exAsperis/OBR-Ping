import { useEffect, useState } from "react";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { METADATA_LIMIT_BYTES } from "../constants";
import { metadataBytes, pingMetadataBytes, type PingRecord, type PingType, type RoomSettings } from "../domain";
import { getNotificationPreference, getSoundEnabled, setNotificationPreference, setSoundEnabled, type NotificationPreference } from "../preferences";
import { removePings, saveSettings } from "../storage";
import { Toggle } from "./Toggle";

interface Props { role: "GM" | "PLAYER"; settings: RoomSettings; pings: PingRecord[]; metadata: Metadata; onChanged: () => void }
const labels: Record<PingType, string> = { message: "Messages", vote: "Votes", quiz: "Quizzes", nomination: "Nominations" };
const durationParts = (total: number) => ({ days: Math.floor(total / 1440), hours: Math.floor(total % 1440 / 60), minutes: total % 60 });

function DurationSetting({ label, total, onChange }: { label: string; total: number; onChange: (minutes: number) => void }) {
  const parts = durationParts(total);
  const update = (part: "days" | "hours" | "minutes", raw: string) => {
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) return;
    onChange((part === "days" ? value : parts.days) * 1440 + (part === "hours" ? value : parts.hours) * 60 + (part === "minutes" ? value : parts.minutes));
  };
  return <fieldset className="expiration-editor"><legend>{label}</legend><div className="duration-inputs"><label>Days<input aria-label={`${label} days`} type="number" min="0" step="1" value={parts.days || ""} onChange={(event) => update("days", event.target.value)} /></label><label>Hours<input aria-label={`${label} hours`} type="number" min="0" max="23" step="1" value={parts.hours || ""} onChange={(event) => update("hours", event.target.value)} /></label><label>Minutes<input aria-label={`${label} minutes`} type="number" min="0" max="59" step="1" value={parts.minutes || ""} onChange={(event) => update("minutes", event.target.value)} /></label></div></fieldset>;
}

export function SettingsPanel({ role, settings, pings, metadata, onChanged }: Props) {
  const [preference, setPreference] = useState<NotificationPreference>(getNotificationPreference);
  const [sound, setSound] = useState(getSoundEnabled);
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const total = metadataBytes(metadata), own = pingMetadataBytes(metadata), remaining = Math.max(0, METADATA_LIMIT_BYTES - total);
  const changePreference = (value: NotificationPreference) => { setPreference(value); setNotificationPreference(value); setMessage("Notification preference saved on this device."); };
  const saveRoomSettings = async () => {
    if (draft.defaultDeadlineMinutes <= 0) { setMessage("The default deadline must be greater than zero."); return; }
    if (draft.defaultExpiryMinutes <= draft.defaultDeadlineMinutes) { setMessage("Default automatic deletion must be later than the default deadline."); return; }
    setBusy(true); setMessage(null); try { await saveSettings(draft, metadata); setMessage("Room settings saved."); onChanged(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to save room settings."); } finally { setBusy(false); }
  };
  const clear = async (all: boolean) => {
    const targets = pings.filter((ping) => all || ping.status !== "active").map((ping) => ping.id);
    if (!targets.length) { setMessage("There is no matching Ping data to clear."); return; }
    if (!window.confirm(all ? "Delete every Ping and response in this room?" : "Delete every completed and cancelled Ping?")) return;
    setBusy(true); try { await removePings(targets, metadata); setMessage(`${targets.length} interaction${targets.length === 1 ? "" : "s"} removed.`); onChanged(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to clear room data."); } finally { setBusy(false); }
  };
  return <div className="stack">
    <section className="panel stack compact"><span className="eyebrow">This device</span><h2>Incoming Pings</h2><label>Notification behavior<select value={preference} onChange={(event) => changePreference(event.target.value as NotificationPreference)}><option value="popover">Separate popover (recommended)</option><option value="badge-toast">Badge + toast</option><option value="badge">Badge only</option><option value="auto-open">Automatically open Ping</option></select></label><Toggle checked={sound} onChange={(checked) => { setSound(checked); setSoundEnabled(checked); setMessage("Sound preference saved on this device."); }} label="Play delivery sound" description="Play a short ping when a new Ping arrives." /><p className="muted">The separate popover also shows completed quiz and vote results. These settings are stored only in this browser.</p></section>
    {role === "GM" ? <>
      <section className="panel stack compact"><span className="eyebrow">Room controls</span><h2>Player creation</h2><Toggle checked={draft.allowPlayers} onChange={(checked) => setDraft({ ...draft, allowPlayers: checked })} label="Allow players to create interactions" description="The GM can always create every Ping type." /><div className="choice-list">{(Object.keys(labels) as PingType[]).map((type) => <Toggle key={type} disabled={!draft.allowPlayers} checked={draft.allowedTypes[type]} onChange={(checked) => setDraft({ ...draft, allowedTypes: { ...draft.allowedTypes, [type]: checked } })} label={labels[type]} />)}</div><button className="primary-button" disabled={busy} onClick={() => void saveRoomSettings()}>Save room settings</button></section>
      <section className="panel stack compact"><span className="eyebrow">Room controls</span><h2>Timing defaults</h2><DurationSetting label="Event deadline" total={draft.defaultDeadlineMinutes} onChange={(defaultDeadlineMinutes) => setDraft({ ...draft, defaultDeadlineMinutes })} /><DurationSetting label="Automatic deletion" total={draft.defaultExpiryMinutes} onChange={(defaultExpiryMinutes) => setDraft({ ...draft, defaultExpiryMinutes })} /><p className="muted">These values prefill new Pings. Senders can adjust them before sending.</p><button className="primary-button" disabled={busy} onClick={() => void saveRoomSettings()}>Save room settings</button></section>
      <section className="panel stack compact"><span className="eyebrow">Room metadata</span><h2>Storage meter</h2><div className="meter" aria-label={`${total} of ${METADATA_LIMIT_BYTES} bytes used`}><span style={{ width: `${Math.min(100, total / METADATA_LIMIT_BYTES * 100)}%` }} /></div><dl className="facts"><div><dt>Total used</dt><dd>{total.toLocaleString()} B</dd></div><div><dt>Used by Ping</dt><dd>{own.toLocaleString()} B</dd></div><div><dt>Estimated remaining</dt><dd>{remaining.toLocaleString()} B</dd></div></dl><p className="muted">Owlbear shares this 16 KB budget with every extension in the room.</p><div className="button-row"><button className="secondary-button" disabled={busy} onClick={() => void clear(false)}>Clear finished</button><button className="danger-button" disabled={busy} onClick={() => void clear(true)}>Clear all</button></div></section>
    </> : <section className="panel"><span className="eyebrow">Room controls</span><h2>GM managed</h2><p className="muted">Only the GM can change creation permissions or clear shared room data.</p></section>}
    {message && <div className="notice" role="status">{message}</div>}
    <section className="panel"><span className="eyebrow">Privacy</span><h2>Room-visible data</h2><p className="muted">Pings and responses are stored in Owlbear room metadata. Vote choices are hidden by this interface, but technically capable room participants can inspect metadata.</p></section>
  </div>;
}
