import { useMemo, useRef, useState } from "react";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { SCHEMA_VERSION, canCreate, excerpt, type MessagePing, type Participant, type PingRecord, type PingType, type RoomSettings } from "../domain";
import { CapacityError, savePing } from "../storage";
import { PingGlyph } from "./PingGlyph";
import { Toggle } from "./Toggle";

export interface MessagePrefill {
  source: MessagePing;
  replyAll: boolean;
  recipients: Participant[];
}

interface Props {
  role: "GM" | "PLAYER";
  currentPlayer: Participant;
  players: Participant[];
  settings: RoomSettings;
  metadata: Metadata;
  prefill?: MessagePrefill | null;
  onCreated: () => void;
}

interface DraftOption { id: string; value: string }
const makeOption = (): DraftOption => ({ id: crypto.randomUUID(), value: "" });
const typeOrder: PingType[] = ["message", "vote", "quiz", "nomination"];
const labels: Record<PingType, string> = { quiz: "Quiz", vote: "Vote", nomination: "Nomination", message: "Message" };

const localDateTime = (time: number) => {
  const date = new Date(time - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};

export function ComposePing({ role, currentPlayer, players, settings, metadata, prefill, onCreated }: Props) {
  const initialOptions = useRef<DraftOption[]>([makeOption(), makeOption()]);
  const optionInputs = useRef(new Map<string, HTMLInputElement>());
  const available = useMemo(() => players.filter((player, index) => player.id !== currentPlayer.id && players.findIndex((candidate) => candidate.id === player.id) === index), [players, currentPlayer.id]);
  const [type, setType] = useState<PingType>("message");
  const [recipients, setRecipients] = useState(() => new Set(prefill?.recipients.map((player) => player.id) ?? []));
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"single" | "multiple" | "ranked">("single");
  const [options, setOptions] = useState(initialOptions.current);
  const [correct, setCorrect] = useState(() => new Set([initialOptions.current[0].id]));
  const [draggedOption, setDraggedOption] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [allowReply, setAllowReply] = useState(true);
  const [allowReplyAll, setAllowReplyAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRepliesEnabled = settings.allowPlayers && settings.allowedTypes.message;

  const selectType = (next: PingType) => {
    setType(next); setError(null); setMode("single");
    setCorrect((previous) => new Set([previous.values().next().value ?? options[0].id]));
    if (next === "quiz" && !expiresAt) setExpiresAt(localDateTime(Date.now() + 60_000));
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
    if (!selected.length) { setError("Choose at least one recipient."); return; }
    const text = prompt.trim();
    if (!text) { setError(type === "message" ? "Enter a message." : "Enter a question or prompt."); return; }
    const deadline = expiresAt ? new Date(expiresAt).getTime() : undefined;
    if (deadline !== undefined && (!Number.isFinite(deadline) || deadline <= Date.now())) { setError("The deadline must be in the future."); return; }
    if (type === "quiz" && deadline === undefined) { setError("A Quiz requires a deadline."); return; }
    const base = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), sender: currentPlayer, recipients: selected, createdAt: Date.now(), expiresAt: deadline, status: "active" as const };
    let ping: PingRecord;
    if (type === "message") {
      ping = { ...base, type, content: { message: text, allowReply, allowReplyAll, ...(prefill ? { replyTo: { pingId: prefill.source.id, excerpt: excerpt(prefill.source.content.message) } } : {}) } };
    } else if (type === "nomination") {
      ping = { ...base, type, content: { prompt: text } };
    } else {
      const built = options.map((option) => ({ id: option.id, label: option.value.trim() }));
      if (built.length < 2 || built.some((option) => !option.label)) { setError("Provide at least two non-empty options."); return; }
      if (type === "quiz") {
        const correctOptionIds = built.filter((option) => correct.has(option.id)).map((option) => option.id);
        if (!correctOptionIds.length) { setError("Choose at least one correct answer."); return; }
        ping = { ...base, type, content: { question: text, mode: mode === "multiple" ? "multiple" : "single", options: built, correctOptionIds } };
      } else ping = { ...base, type, content: { question: text, mode: mode === "ranked" ? "ranked" : "single", options: built } };
    }
    setSubmitting(true);
    try { await savePing(ping, metadata); onCreated(); }
    catch (cause) { setError(cause instanceof CapacityError ? `${cause.message} Ask the GM to clear room data.` : cause instanceof Error ? cause.message : "Unable to send this Ping."); }
    finally { setSubmitting(false); }
  };

  return <form className="stack" onSubmit={submit}>
    {prefill ? <div className="reply-compose-label"><PingGlyph type="message" />{prefill.replyAll ? "Reply all" : "Reply"} to {prefill.source.sender.name}</div> : <div className="segmented type-picker" aria-label="Ping type">{typeOrder.map((item) => <button key={item} type="button" className={`${type === item ? "active " : ""}type-${item}`} disabled={!canCreate(role, item, settings)} onClick={() => selectType(item)}><PingGlyph type={item} /><span>{labels[item]}</span></button>)}</div>}

    <section className="panel">
      <div className="section-heading"><div><span className="eyebrow">Recipients</span><h3>{recipients.size || "No"} selected</h3></div><button type="button" className="text-button" onClick={() => setRecipients(new Set(available.map((player) => player.id)))}>Everyone</button></div>
      {!available.length ? <p className="muted">No other players are connected.</p> : <div className="choice-list">{available.map((player) => <Toggle key={player.id} checked={recipients.has(player.id)} onChange={() => toggleRecipient(player.id)} label={<span className="player-label"><span className="player-dot" aria-hidden="true" />{player.name}</span>} />)}</div>}
    </section>

    <section className="panel stack compact">
      <label>{type === "message" ? "Message" : type === "nomination" ? "Prompt" : "Question"}<textarea maxLength={type === "message" ? 1000 : 300} rows={type === "message" ? 5 : 3} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
      <span className="counter">{prompt.length}/{type === "message" ? 1000 : 300}</span>
      {(type === "quiz" || type === "vote") && <>
        <fieldset><legend>Answer method</legend><div className="segmented small">{(type === "quiz" ? [["single", "Single"], ["multiple", "Multiple"]] : [["single", "Single"], ["ranked", "Ranked"]]).map(([value, label]) => <button key={value} type="button" className={mode === value ? "active" : ""} onClick={() => { setMode(value as typeof mode); if (value === "single") setCorrect((previous) => new Set([previous.values().next().value ?? options[0].id])); }}>{label}</button>)}</div></fieldset>
        <fieldset><legend>Options</legend><div className="stack compact">{options.map((option, index) => <div className={`option-editor${draggedOption === option.id ? " dragging" : ""}`} key={option.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedOption) moveOption(draggedOption, index); setDraggedOption(null); }}><button type="button" className="drag-handle" draggable aria-label={`Reorder option ${index + 1}`} title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedOption(option.id); }} onDragEnd={() => setDraggedOption(null)} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); moveOption(option.id, index - 1); } else if (event.key === "ArrowDown") { event.preventDefault(); moveOption(option.id, index + 1); } }}>⠿</button><input ref={(element) => { if (element) optionInputs.current.set(option.id, element); else optionInputs.current.delete(option.id); }} aria-label={`Option ${index + 1}`} maxLength={100} value={option.value} onChange={(event) => updateOption(option.id, event.target.value)} placeholder={`Option ${index + 1}`} />{type === "quiz" && (mode === "multiple" ? <Toggle compact label={`Option ${index + 1} is correct`} checked={correct.has(option.id)} onChange={() => toggleCorrect(option.id)} /> : <input aria-label={`Option ${index + 1} is correct`} type="radio" name="correct" checked={correct.has(option.id)} onChange={() => toggleCorrect(option.id)} />)}{options.length > 2 && <button aria-label={`Remove option ${index + 1}`} type="button" className="icon-button" onClick={() => removeOption(option.id)}>×</button>}</div>)}</div>{options.length < 8 && <button type="button" className="text-button add-option" onClick={addOption}>+ Add option</button>}</fieldset>
      </>}
      {type === "message" && <div className="stack compact"><div className="choice-list"><Toggle checked={allowReply} onChange={setAllowReply} label="Allow reply" description="Recipients may send a new Message back to the sender." /><Toggle checked={allowReplyAll} onChange={(checked) => { setAllowReplyAll(checked); if (checked) setAllowReply(true); }} label="Allow reply all" description="Recipients may send a new Message to the original participants." /></div>{!playerRepliesEnabled && <div className="notice warning" role="status">Players cannot reply right now because player-created Messages are disabled in room settings. These options will still apply if the GM enables them later.</div>}</div>}
      <label>{type === "quiz" ? "Deadline" : type === "message" ? "Expiration (optional)" : "Deadline (optional)"}<input type="datetime-local" required={type === "quiz"} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="primary-button" disabled={submitting || !canCreate(role, type, settings)}>{submitting ? "Sending…" : `Send ${labels[type]}`}</button>
    </section>
  </form>;
}
