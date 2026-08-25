import { useState } from "react";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { SCHEMA_VERSION, canCreate, canManage, formatDuration, instantRunoff, isPastDeadline, isRecipient, optionLabel, quizStandings, responseFor, responsesFor, voteTotals, type NominationResponse, type Participant, type PingRecord, type PingResponse, type RoomSettings } from "../domain";
import { removePing, removeResponse, savePing, saveResponse } from "../storage";
import type { MessagePrefill, VotePrefill } from "./ComposePing";
import { PingGlyph } from "./PingGlyph";
import { Toggle } from "./Toggle";
import { calculateSessionScores, rankScores } from "../session";

interface Props {
  ping: PingRecord;
  responses: PingResponse[];
  currentPlayer: Participant;
  role: "GM" | "PLAYER";
  settings: RoomSettings;
  metadata: Metadata;
  now: number;
  onReply: (prefill: MessagePrefill) => void;
  onRunoff: (prefill: VotePrefill) => void;
  onResponseSubmitted?: () => void;
  onChanged: () => void;
  shared?: boolean;
  onDeleteLocal?: () => Promise<void>;
}

const typeLabel = { quiz: "Quiz", vote: "Vote", nomination: "Nomination", message: "Message" } as const;

export function PingCard({ ping, responses, currentPlayer, role, settings, metadata, now, onReply, onRunoff, onResponseSubmitted, onChanged, shared = true, onDeleteLocal }: Props) {
  const existing = responseFor(responses, ping.id, currentPlayer.id);
  const relevant = responsesFor(responses, ping.id);
  const manager = canManage(ping, currentPlayer.id, role);
  const sender = ping.sender.id === currentPlayer.id;
  const recipient = isRecipient(ping, currentPlayer.id);
  const deadlinePassed = isPastDeadline(ping, now);
  const active = ping.status === "active" && !deadlinePassed;
  const [selected, setSelected] = useState<string[]>(ping.type === "vote" && ping.content.mode === "ranked" ? ping.content.options.map((option) => option.id) : []);
  const [nomination, setNomination] = useState("");
  const nominations = relevant.filter((item): item is NominationResponse => item.type === "nomination").sort((a, b) => a.respondedAt - b.respondedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionResultsUntil] = useState(() => Date.now() + 5_000);

  const respond = async () => {
    setError(null);
    let response: PingResponse;
    if (ping.type === "quiz") {
      if (!selected.length || (ping.content.mode === "single" && selected.length !== 1)) { setError("Choose an answer."); return; }
      response = { schemaVersion: SCHEMA_VERSION, pingId: ping.id, playerId: currentPlayer.id, playerName: currentPlayer.name, respondedAt: Date.now(), type: "quiz", optionIds: selected };
    } else if (ping.type === "vote") {
      if (ping.content.mode === "single" && selected.length !== 1) { setError("Choose one option."); return; }
      if (ping.content.mode === "ranked" && (selected.length !== ping.content.options.length || new Set(selected).size !== selected.length)) { setError("Rank every option once."); return; }
      response = { schemaVersion: SCHEMA_VERSION, pingId: ping.id, playerId: currentPlayer.id, playerName: currentPlayer.name, respondedAt: Date.now(), type: "vote", optionIds: selected };
    } else if (ping.type === "nomination") {
      const value = nomination.trim();
      if (!value || /[\r\n]/.test(value)) { setError("Enter one single-line nomination."); return; }
      response = { schemaVersion: SCHEMA_VERSION, pingId: ping.id, playerId: currentPlayer.id, playerName: currentPlayer.name, respondedAt: Date.now(), type: "nomination", value };
    } else response = { schemaVersion: SCHEMA_VERSION, pingId: ping.id, playerId: currentPlayer.id, playerName: currentPlayer.name, respondedAt: Date.now(), type: "message", read: true };
    setBusy(true); try { await saveResponse(response, metadata); onChanged(); onResponseSubmitted?.(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save your response."); } finally { setBusy(false); }
  };

  const updateStatus = async (status: "completed" | "cancelled") => {
    setBusy(true); setError(null);
    try { await savePing({ ...ping, status, ...(status === "completed" ? { completedAt: Date.now() } : { cancelledAt: Date.now() }) }, metadata); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update this Ping."); } finally { setBusy(false); }
  };

  const deleteInteraction = async () => {
    if (!window.confirm("Delete this Ping and all of its responses? This cannot be undone.")) return;
    setBusy(true); try { if (shared) await removePing(ping.id, metadata); else await onDeleteLocal?.(); onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete this Ping."); } finally { setBusy(false); }
  };

  const rescindNomination = async () => {
    if (ping.type !== "nomination") return;
    setBusy(true); setError(null);
    try { await removeResponse(ping.id, currentPlayer.id, metadata); setNomination(""); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to rescind your nomination."); }
    finally { setBusy(false); }
  };

  const createVote = () => {
    if (ping.type !== "nomination") return;
    const unique = new Map<string, string>();
    for (const response of nominations) {
      const label = response.value.trim();
      const key = label.toLocaleLowerCase();
      if (label && !unique.has(key)) unique.set(key, label);
    }
    const options = [...unique.values()].map((label) => ({ id: crypto.randomUUID(), label }));
    if (options.length < 2) { setError("At least two distinct nominations are required to create a Vote."); return; }
    onRunoff({ kind: "vote", sourceId: ping.id, question: ping.content.prompt, options, recipients: ping.recipients, includeFutureRecipients: ping.includeFutureRecipients });
  };

  const startReply = async (replyAll: boolean) => {
    if (ping.type !== "message") return;
    const prefill: MessagePrefill = { kind: "message", source: ping, replyAll, recipients: (replyAll ? [ping.sender, ...ping.recipients] : [ping.sender]).filter((player, index, all) => player.id !== currentPlayer.id && all.findIndex((candidate) => candidate.id === player.id) === index) };
    if (existing) { onReply(prefill); return; }
    setBusy(true); setError(null);
    const readResponse: PingResponse = { schemaVersion: SCHEMA_VERSION, pingId: ping.id, playerId: currentPlayer.id, playerName: currentPlayer.name, respondedAt: Date.now(), type: "message", read: true };
    try { await saveResponse(readResponse, metadata); onChanged(); onReply(prefill); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open the reply composer."); }
    finally { setBusy(false); }
  };

  const toggleSelection = (id: string) => setSelected((previous) => ping.type === "quiz" && ping.content.mode === "multiple" ? previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id] : [id]);
  const moveRank = (index: number, direction: -1 | 1) => setSelected((previous) => { const next = [...previous]; const target = index + direction; if (target < 0 || target >= next.length) return previous; [next[index], next[target]] = [next[target], next[index]]; return next; });

  const renderResponse = () => {
    if (!recipient) return null;
    if (existing) return <div className="stack compact"><div className="notice success" role="status">{ping.type === "message" ? "Read" : ping.status === "completed" || deadlinePassed || ping.type === "nomination" || ping.type === "quiz" || ping.type === "vote" ? "Results" : "Response received"}</div>{ping.type === "nomination" && active && <button className="secondary-button" disabled={busy} onClick={() => void rescindNomination()}>Rescind nomination</button>}</div>;
    if (!active) return null;
    if (ping.type === "message") return <button className="primary-button" disabled={busy} onClick={() => void respond()}>Mark as read</button>;
    if (ping.type === "nomination") return <div className="stack compact"><label>Your nomination<input maxLength={160} value={nomination} onChange={(event) => setNomination(event.target.value.replace(/[\r\n]/g, ""))} /></label><span className="counter">{nomination.length}/160</span><button className="primary-button" disabled={busy} onClick={() => void respond()}>Submit nomination</button></div>;
    if (ping.type === "vote" && ping.content.mode === "ranked") return <div className="stack compact"><p className="muted">Rank every option from most to least preferred.</p><ol className="rank-list">{selected.map((id, index) => <li key={id}><span>{optionLabel(ping, id)}</span><span><button type="button" className="icon-button" disabled={index === 0} aria-label="Move up" onClick={() => moveRank(index, -1)}>↑</button><button type="button" className="icon-button" disabled={index === selected.length - 1} aria-label="Move down" onClick={() => moveRank(index, 1)}>↓</button></span></li>)}</ol><button className="primary-button" disabled={busy} onClick={() => void respond()}>Submit ranking</button></div>;
    const options = ping.content.options;
    const multiple = ping.type === "quiz" && ping.content.mode === "multiple";
    return <div className="stack compact"><div className="choice-list">{options.map((option) => multiple ? <Toggle key={option.id} checked={selected.includes(option.id)} onChange={() => toggleSelection(option.id)} label={option.label} /> : <label className="choice-row" key={option.id}><input type="radio" name={`answer-${ping.id}`} checked={selected.includes(option.id)} onChange={() => toggleSelection(option.id)} /><span>{option.label}</span></label>)}</div><button className="primary-button" disabled={busy} onClick={() => void respond()}>{ping.type === "quiz" ? "Answer" : "Vote"}</button></div>;
  };

  const renderResults = () => {
    if (ping.status === "cancelled") return <div className="notice">This Ping was cancelled.</div>;
    if (ping.type === "message") {
      const reads = relevant.filter((response) => response.type === "message").length;
      return <p className="muted">Read by {reads}/{Math.max(ping.recipients.length, reads)}</p>;
    }
    if (ping.type === "nomination") {
      return <div className="stack compact">{nominations.length ? <ol className="results-list nomination-list">{nominations.map((response) => <li key={response.playerId}><span>{response.value}</span><small>Nominated by {response.playerName}</small></li>)}</ol> : <p className="muted">No nominations received.</p>}{sender && (ping.status === "completed" || deadlinePassed) && <button className="primary-button" disabled={busy || !canCreate(role, "vote", settings)} onClick={createVote}>Create Vote</button>}</div>;
    }
    if (ping.status !== "completed" && !deadlinePassed) return <p className="muted">{ping.includeFutureRecipients ? `${relevant.length} responses` : `${relevant.length} of ${ping.recipients.length} responded`}</p>;
    if (ping.type === "quiz") {
      const standings = quizStandings(ping, responses);
      const leaders = standings[0]?.correct ? standings.filter((standing) => standing.correct && standing.elapsedMs === standings[0].elapsedMs) : [];
      const tied = leaders.length > 1;
      const cumulative = ping.session?.scores ? rankScores(calculateSessionScores(ping.session.scores, ping, responses)) : [];
      return <div className="stack compact"><ol className="results-list">{standings.map((standing, index) => { const leader = leaders.includes(standing); return <li className={leader ? "winning-result" : ""} key={standing.player.id}><span>{leader && <i className={`winner-check${tied ? " tie" : ""}`} aria-label={tied ? "Tied winner" : "Winner"}>✓</i>}<strong>{index + 1}. {standing.player.name}</strong><small>{standing.answered ? standing.correct ? "Correct" : "Incorrect" : "No answer"}</small></span><span>{standing.elapsedMs !== undefined ? formatDuration(standing.elapsedMs) : "—"}</span></li>; })}</ol>{cumulative.length > 0 && <div className="session-leaderboard"><strong>Cumulative leaderboard</strong><ol className="results-list">{cumulative.map((standing) => <li key={standing.playerId}><span>{standing.rank}. {standing.playerName}</span><strong>{standing.score}</strong></li>)}</ol></div>}</div>;
    }
    if (ping.type === "vote") {
      if (ping.content.mode === "single") {
        const totals = voteTotals(ping, responses);
        const sorted = [...ping.content.options].sort((a, b) => totals[b.id] - totals[a.id]);
        const leaders = totals[sorted[0]?.id] > 0 ? sorted.filter((option) => totals[option.id] === totals[sorted[0].id]) : [];
        const tied = leaders.length > 1;
        return <div className="stack compact"><ol className="results-list">{sorted.map((option) => { const leader = leaders.includes(option); return <li className={leader ? "winning-result" : ""} key={option.id}><span>{leader && <i className={`winner-check${tied ? " tie" : ""}`} aria-label={tied ? "Tied winner" : "Winner"}>✓</i>}{option.label}</span><strong>{totals[option.id]}</strong></li>; })}</ol>{tied && manager && canCreate(role, "vote", settings) && <button className="primary-button runoff-button" onClick={() => onRunoff({ kind: "vote", sourceId: ping.id, question: ping.content.question, options: leaders, recipients: ping.recipients, includeFutureRecipients: ping.includeFutureRecipients })}>Runoff</button>}</div>;
      }
      const rounds = instantRunoff(ping, responses);
      const winner = relevant.some((response) => response.type === "vote" && response.optionIds.length) ? rounds.at(-1)?.winner : undefined;
      return <div className="stack compact">{winner && <div className="ranked-winner"><i className="winner-check" aria-label="Winner">✓</i><strong>{optionLabel(ping, winner)}</strong></div>}{rounds.map((round, index) => <div className="round" key={index}><strong>Round {index + 1}</strong>{ping.content.options.filter((option) => option.id in round.counts).map((option) => <div key={option.id}><span>{option.label}</span><span>{round.counts[option.id]}</span></div>)}<small>{round.winner ? `${optionLabel(ping, round.winner)} wins` : round.eliminated ? `${optionLabel(ping, round.eliminated)} eliminated` : ""}</small></div>)}</div>;
    }
    return null;
  };

  const replyAllowed = ping.type === "message" && active && recipient && ping.content.allowReply && canCreate(role, "message", settings);
  return <article className={`ping-card ${ping.type}`}>
    <header><div className="ping-heading"><span className="glyph-frame"><PingGlyph type={ping.type} /></span><div><span className="type-chip">{typeLabel[ping.type]}</span><h3>{ping.type === "message" ? ping.content.message : ping.type === "nomination" ? ping.content.prompt : ping.content.question}</h3></div></div><span className={`status ${ping.status}`}>{deadlinePassed && ping.status === "active" ? "ended" : ping.status}</span></header>
    <p className="byline">From {ping.sender.name} · {new Date(ping.createdAt).toLocaleString()}</p>
    {ping.session && <p className="session-position">Session Ping {ping.session.index + 1} of {ping.session.total}{ping.status === "completed" ? ` · Next Ping in ${Math.max(0, Math.ceil((sessionResultsUntil - now) / 1_000))}s` : ""}</p>}
    {ping.type === "message" && ping.content.replyTo && <p className="reply-reference">In reply to: “{ping.content.replyTo.excerpt}”</p>}
    {ping.status === "active" && <div className="timer" aria-live="polite">{deadlinePassed ? "Deadline reached" : `${formatDuration(ping.deadlineAt - now)} remaining`}</div>}
    {renderResponse()}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="results">{renderResults()}</div>
    {replyAllowed && ping.type === "message" && <div className="button-row"><button className="secondary-button" disabled={busy} onClick={() => void startReply(false)}>Reply</button>{ping.content.allowReplyAll && <button className="secondary-button" disabled={busy} onClick={() => void startReply(true)}>Reply all</button>}</div>}
    <footer className="card-actions"><span className="deletion-time">Deletes {new Date(ping.expiresAt).toLocaleString()}</span>{(manager || !shared) && <span className="card-action-buttons">{manager && shared && active && (ping.type === "vote" || ping.type === "nomination") && <button className="text-button" disabled={busy} onClick={() => void updateStatus("completed")}>End now</button>}{manager && shared && active && <button className="text-button danger" disabled={busy} onClick={() => void updateStatus("cancelled")}>Cancel</button>}{!active && <button className="text-button danger" disabled={busy} onClick={() => void deleteInteraction()}>Delete</button>}</span>}</footer>
  </article>;
}
