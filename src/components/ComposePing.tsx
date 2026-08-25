import { useEffect, useMemo, useRef, useState } from "react";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { DEFAULT_DEADLINE_MS, DEFAULT_EXPIRY_MS, SCHEMA_VERSION, canCreate, excerpt, type MessagePing, type Option, type Participant, type PingRecord, type PingType, type RoomSettings } from "../domain";
import { CapacityError, savePing } from "../storage";
import { PingGlyph } from "./PingGlyph";
import { Toggle } from "./Toggle";

export interface MessagePrefill {
  kind: "message";
  source: MessagePing;
  replyAll: boolean;
  recipients: Participant[];
}

export interface VotePrefill {
  kind: "vote";
  sourceId: string;
  question: string;
  options: Option[];
  recipients: Participant[];
  includeFutureRecipients?: boolean;
}

export type ComposePrefill = MessagePrefill | VotePrefill;

interface Props {
  role: "GM" | "PLAYER";
  currentPlayer: Participant;
  players: Participant[];
  settings: RoomSettings;
  metadata: Metadata;
  prefill?: ComposePrefill | null;
  onCreated: () => void;
}

interface DraftOption { id: string; value: string }
type ExpirationMethod = "relative" | "specific";
interface TimeDraft { method: ExpirationMethod; days: string; hours: string; minutes: string; specific: string }
const makeOption = (): DraftOption => ({ id: crypto.randomUUID(), value: "" });
const typeOrder: PingType[] = ["message", "vote", "quiz", "nomination"];
const labels: Record<PingType, string> = { quiz: "Quiz", vote: "Vote", nomination: "Nomination", message: "Message" };
const FUTURE_RECIPIENT_ID = "__future_recipients__";

const localDateTime = (time: number) => {
  const date = new Date(time - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};

const durationDraft = (totalMinutes: number): TimeDraft => ({ method: "relative", days: String(Math.floor(totalMinutes / 1440) || ""), hours: String(Math.floor(totalMinutes % 1440 / 60) || ""), minutes: String(totalMinutes % 60 || ""), specific: "" });

function resolveTime(draft: TimeDraft, createdAt: number, label: string): { value?: number; error?: string } {
  if (draft.method === "specific") {
    const value = draft.specific ? new Date(draft.specific).getTime() : NaN;
    return Number.isFinite(value) && value > createdAt ? { value } : { error: `${label} must be in the future.` };
  }
  const parts = [draft.days, draft.hours, draft.minutes].map((value) => value === "" ? 0 : Number(value));
  if (parts.some((value) => !Number.isSafeInteger(value) || value < 0) || parts[1] > 23 || parts[2] > 59) return { error: `${label} must use whole non-negative numbers, with hours up to 23 and minutes up to 59.` };
  const duration = ((parts[0] * 24 + parts[1]) * 60 + parts[2]) * 60_000;
  if (!Number.isSafeInteger(duration)) return { error: `${label} is too far in the future.` };
  return duration > 0 ? { value: createdAt + duration } : { error: `${label} must be after the send time.` };
}

function TimeEditor({ label, draft, defaultMs, onChange }: { label: string; draft: TimeDraft; defaultMs: number; onChange: (draft: TimeDraft) => void }) {
  const setMethod = (method: ExpirationMethod) => onChange({ ...draft, method, ...(method === "specific" && !draft.specific ? { specific: localDateTime(Date.now() + defaultMs) } : {}) });
  return <fieldset className="expiration-editor"><legend>{label}</legend><div className="segmented small expiration-method" aria-label={`${label} method`}><button type="button" className={draft.method === "relative" ? "active" : ""} onClick={() => setMethod("relative")}>From time of sending</button><button type="button" className={draft.method === "specific" ? "active" : ""} onClick={() => setMethod("specific")}>Specific date/time</button></div>{draft.method === "relative" ? <div className="duration-inputs"><label>Days<input aria-label={`${label} days`} type="number" min="0" step="1" inputMode="numeric" value={draft.days} onChange={(event) => onChange({ ...draft, days: event.target.value })} /></label><label>Hours<input aria-label={`${label} hours`} type="number" min="0" max="23" step="1" inputMode="numeric" value={draft.hours} onChange={(event) => onChange({ ...draft, hours: event.target.value })} /></label><label>Minutes<input aria-label={`${label} minutes`} type="number" min="0" max="59" step="1" inputMode="numeric" value={draft.minutes} onChange={(event) => onChange({ ...draft, minutes: event.target.value })} /></label></div> : <label>{label} date and time<input aria-label={`${label} date and time`} type="datetime-local" required value={draft.specific} onChange={(event) => onChange({ ...draft, specific: event.target.value })} /></label>}</fieldset>;
}

export function ComposePing({ role, currentPlayer, players, settings, metadata, prefill, onCreated }: Props) {
  const messagePrefill = prefill?.kind === "message" ? prefill : null;
  const votePrefill = prefill?.kind === "vote" ? prefill : null;
  const initialOptions = useRef<DraftOption[]>(votePrefill ? votePrefill.options.map((option) => ({ id: crypto.randomUUID(), value: option.label })) : [makeOption(), makeOption()]);
  const optionInputs = useRef(new Map<string, HTMLInputElement>());
  const available = useMemo(() => players.filter((player, index) => player.id !== currentPlayer.id && players.findIndex((candidate) => candidate.id === player.id) === index), [players, currentPlayer.id]);
  const [type, setType] = useState<PingType>(votePrefill ? "vote" : "message");
  const [recipients, setRecipients] = useState(() => new Set([...(prefill?.recipients.map((player) => player.id) ?? []), ...(votePrefill?.includeFutureRecipients ? [FUTURE_RECIPIENT_ID] : [])]));
  const [prompt, setPrompt] = useState(votePrefill?.question ?? "");
  const [mode, setMode] = useState<"single" | "multiple" | "ranked">("single");
  const [options, setOptions] = useState(initialOptions.current);
  const [correct, setCorrect] = useState(() => new Set([initialOptions.current[0].id]));
  const [draggedOption, setDraggedOption] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<TimeDraft>(() => durationDraft(settings.defaultDeadlineMinutes));
  const [expiry, setExpiry] = useState<TimeDraft>(() => durationDraft(settings.defaultExpiryMinutes));
  const [allowReply, setAllowReply] = useState(true);
  const [allowReplyAll, setAllowReplyAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const playerRepliesEnabled = settings.allowPlayers && settings.allowedTypes.message;
  const hasRecipients = recipients.has(FUTURE_RECIPIENT_ID) || available.some((player) => recipients.has(player.id));
  const validOptions = options.filter((option) => option.value.trim());
  const optionsValid = type !== "quiz" && type !== "vote" || (validOptions.length >= 2 && validOptions.length <= 8 && validOptions.every((option) => option.value.trim().length <= 100) && (type !== "quiz" || validOptions.some((option) => correct.has(option.id))));
  const validationExpiry = resolveTime(expiry, now, "Automatic deletion").value;
  const validationDeadline = type === "message" ? undefined : resolveTime(deadline, now, "Deadline").value;
  const timingValid = validationExpiry !== undefined && (type === "message" || validationDeadline !== undefined && validationExpiry > validationDeadline);
  const canSend = !submitting && canCreate(role, type, settings) && hasRecipients && Boolean(prompt.trim()) && optionsValid && timingValid;

  const selectType = (next: PingType) => {
    setType(next); setError(null); setMode("single");
    setCorrect((previous) => new Set([previous.values().next().value ?? options[0].id]));
  };
  const toggleRecipient = (id: string) => setRecipients((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const updateOption = (id: string, value: string) => setOptions((previous) => previous.map((option) => option.id === id ? { ...option, value } : option));
  const removeOption = (id: string) => {
    const remaining = options.filter((option) => option.id !== id);
    setOptions(remaining);
    setCorrect((previous) => { const next = new Set(previous); next.delete(id); if (mode === "single" && !next.size && remaining[0]) next.add(remaining[0].id); return next; });
  };
  const toggleCorrect = (id: string) => setCorrect((previous) => mode === "single" ? new Set([id]) : (() => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; })());
  const moveOption = (id: string, targetIndex: number) => setOptions((previous) => {
    const from = previous.findIndex((option) => option.id === id);
    if (from < 0 || targetIndex < 0 || targetIndex >= previous.length || from === targetIndex) return previous;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  });
  const addOption = () => {
    const option = makeOption();
    setOptions((previous) => [...previous, option]);
    window.setTimeout(() => optionInputs.current.get(option.id)?.focus(), 0);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!canCreate(role, type, settings)) { setError(`You do not have permission to create a ${labels[type]}.`); return; }
    const selected = available.filter((player) => recipients.has(player.id));
    const includeFutureRecipients = recipients.has(FUTURE_RECIPIENT_ID);
    if (!selected.length && !includeFutureRecipients) { setError("Choose at least one recipient."); return; }
    const text = prompt.trim();
    if (!text) { setError(type === "message" ? "Enter a message." : "Enter a question or prompt."); return; }
    const createdAt = Date.now();
    const resolvedExpiry = resolveTime(expiry, createdAt, "Automatic deletion");
    if (resolvedExpiry.error || resolvedExpiry.value === undefined) { setError(resolvedExpiry.error ?? "Automatic deletion is required."); return; }
    const resolvedDeadline = type === "message" ? undefined : resolveTime(deadline, createdAt, "Deadline");
    if (resolvedDeadline?.error || (type !== "message" && resolvedDeadline?.value === undefined)) { setError(resolvedDeadline?.error ?? "A deadline is required."); return; }
    if (resolvedDeadline?.value !== undefined && resolvedExpiry.value <= resolvedDeadline.value) { setError("Automatic deletion must be later than the deadline."); return; }
    const base = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), sender: currentPlayer, recipients: selected, ...(includeFutureRecipients ? { includeFutureRecipients: true } : {}), createdAt, expiresAt: resolvedExpiry.value, status: "active" as const };
    let ping: PingRecord;
    if (type === "message") {
      ping = { ...base, type, content: { message: text, allowReply, allowReplyAll, ...(messagePrefill ? { replyTo: { pingId: messagePrefill.source.id, excerpt: excerpt(messagePrefill.source.content.message) } } : {}) } };
    } else if (type === "nomination") {
      ping = { ...base, deadlineAt: resolvedDeadline!.value!, type, content: { prompt: text } };
    } else {
      const built = options.map((option) => ({ id: option.id, label: option.value.trim() })).filter((option) => option.label);
      if (built.length < 2) { setError("Provide at least two non-empty options."); return; }
      if (built.length > 8) { setError("Use no more than eight options."); return; }
      if (built.some((option) => option.label.length > 100)) { setError("Keep every option to 100 characters or fewer."); return; }
      if (type === "quiz") {
        const correctOptionIds = built.filter((option) => correct.has(option.id)).map((option) => option.id);
        if (!correctOptionIds.length) { setError("Choose at least one correct answer."); return; }
        ping = { ...base, deadlineAt: resolvedDeadline!.value!, type, content: { question: text, mode: mode === "multiple" ? "multiple" : "single", options: built, correctOptionIds } };
      } else ping = { ...base, deadlineAt: resolvedDeadline!.value!, type, content: { question: text, mode: mode === "ranked" ? "ranked" : "single", options: built } };
    }
    setSubmitting(true);
    try { await savePing(ping, metadata); onCreated(); }
    catch (cause) { setError(cause instanceof CapacityError ? `${cause.message} Ask the GM to clear room data.` : cause instanceof Error ? cause.message : "Unable to send this Ping."); }
    finally { setSubmitting(false); }
  };

  return <form className="stack" onSubmit={submit}>
    {messagePrefill ? <div className="reply-compose-label"><PingGlyph type="message" />{messagePrefill.replyAll ? "Reply all" : "Reply"} to {messagePrefill.source.sender.name}</div> : <div className="segmented type-picker" aria-label="Ping type">{typeOrder.map((item) => <button key={item} type="button" className={`${type === item ? "active " : ""}type-${item}`} disabled={!canCreate(role, item, settings)} onClick={() => selectType(item)}><PingGlyph type={item} /><span>{labels[item]}</span></button>)}</div>}

    <section className="panel">
      <div className="section-heading recipient-heading"><span className="eyebrow">Recipients</span><button type="button" className="text-button" onClick={() => setRecipients(new Set([...available.map((player) => player.id), FUTURE_RECIPIENT_ID]))}>Everyone</button></div>
      <div className="choice-list compact-choices"><Toggle plain checked={recipients.has(FUTURE_RECIPIENT_ID)} onChange={() => toggleRecipient(FUTURE_RECIPIENT_ID)} label={<span className="player-label"><span className="player-dot future" aria-hidden="true" />Players who join later <span className="info-tooltip" tabIndex={0} aria-label="Anyone who joins while this Ping is active will receive it." data-tooltip="Anyone who joins while this Ping is active will receive it." onClick={(event) => event.preventDefault()}>i</span></span>} />{available.map((player) => <Toggle plain key={player.id} checked={recipients.has(player.id)} onChange={() => toggleRecipient(player.id)} label={<span className="player-label"><span className="player-dot" style={player.color ? { backgroundColor: player.color } : undefined} aria-hidden="true" />{player.name}</span>} />)}</div>
    </section>

    <section className="panel stack compact">
      <label>{type === "message" ? "Message" : type === "nomination" ? "Prompt" : "Question"}<textarea maxLength={300} rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
      <span className="counter">{prompt.length}/300</span>
      {(type === "quiz" || type === "vote") && <>
        <fieldset><legend>Answer method</legend><div className="segmented small">{(type === "quiz" ? [["single", "Single"], ["multiple", "Multiple"]] : [["single", "Single"], ["ranked", "Ranked"]]).map(([value, label]) => <button key={value} type="button" className={mode === value ? "active" : ""} onClick={() => { setMode(value as typeof mode); if (value === "single") setCorrect((previous) => new Set([previous.values().next().value ?? options[0].id])); }}>{label}</button>)}</div></fieldset>
        <fieldset><legend>Options</legend><div className="stack compact">{options.map((option, index) => <div className={`option-editor${draggedOption === option.id ? " dragging" : ""}`} key={option.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedOption) moveOption(draggedOption, index); setDraggedOption(null); }}><button type="button" className="drag-handle" draggable aria-label={`Reorder option ${index + 1}`} title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedOption(option.id); }} onDragEnd={() => setDraggedOption(null)} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); moveOption(option.id, index - 1); } else if (event.key === "ArrowDown") { event.preventDefault(); moveOption(option.id, index + 1); } }}>⠿</button><input ref={(element) => { if (element) optionInputs.current.set(option.id, element); else optionInputs.current.delete(option.id); }} aria-label={`Option ${index + 1}`} maxLength={100} value={option.value} onChange={(event) => updateOption(option.id, event.target.value)} placeholder={`Option ${index + 1}`} />{type === "quiz" && (mode === "multiple" ? <Toggle compact label={`Option ${index + 1} is correct`} checked={correct.has(option.id)} onChange={() => toggleCorrect(option.id)} /> : <input aria-label={`Option ${index + 1} is correct`} type="radio" name="correct" checked={correct.has(option.id)} onChange={() => toggleCorrect(option.id)} />)}{options.length > 2 && <button aria-label={`Remove option ${index + 1}`} type="button" className="icon-button" onClick={() => removeOption(option.id)}>×</button>}</div>)}</div>{options.length < 8 && <button type="button" className="text-button add-option" onClick={addOption}>+ Add option</button>}</fieldset>
      </>}
      {type === "message" && <div className="stack compact"><div className="choice-list compact-choices"><Toggle plain checked={allowReply} onChange={setAllowReply} label="Allow reply" /><Toggle plain checked={allowReplyAll} onChange={(checked) => { setAllowReplyAll(checked); if (checked) setAllowReply(true); }} label="Allow reply all" /></div>{!playerRepliesEnabled && <div className="notice warning" role="status">Players cannot reply right now because player-created Messages are disabled in room settings. These options will still apply if the GM enables them later.</div>}</div>}
      {type !== "message" && <TimeEditor label="Deadline" draft={deadline} defaultMs={DEFAULT_DEADLINE_MS} onChange={setDeadline} />}
      <TimeEditor label="Automatic deletion" draft={expiry} defaultMs={DEFAULT_EXPIRY_MS} onChange={setExpiry} />
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className={`primary-button send-button type-${type}`} disabled={!canSend}>{submitting ? "Sending…" : `Send ${labels[type]}`}</button>
    </section>
  </form>;
}
