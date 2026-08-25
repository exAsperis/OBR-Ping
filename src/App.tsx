import { useEffect, useMemo, useState } from "react";
import { METADATA_LIMIT_BYTES } from "./constants";
import { isRecipient, metadataBytes, waitingPings, type PingRecord } from "./domain";
import { usePingRoom } from "./hooks/usePingRoom";
import { ComposePing, type MessagePrefill } from "./components/ComposePing";
import { PingCard } from "./components/PingCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusPanel } from "./components/StatusPanel";

type View = "inbox" | "create" | "settings";

function GearGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.1.4.3.7.6 1 .3.3.7.4 1.1.4h.1v4h-.1c-.4 0-.8.1-1.1.4-.3.2-.5.6-.6 1Z" /></svg>;
}

export default function App() {
  const room = usePingRoom();
  const focusedPingId = new URLSearchParams(window.location.search).get("pingId");
  const [view, setView] = useState<View>("inbox");
  const [prefill, setPrefill] = useState<MessagePrefill | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const waiting = useMemo(() => waitingPings(room.pings, room.responses, room.currentPlayer.id, now).sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity) || a.createdAt - b.createdAt), [room.pings, room.responses, room.currentPlayer.id, now]);
  const waitingIds = useMemo(() => new Set(waiting.map((ping) => ping.id)), [waiting]);
  const recent = useMemo(() => room.pings.filter((ping) => !waitingIds.has(ping.id) && (ping.sender.id === room.currentPlayer.id || isRecipient(ping, room.currentPlayer.id) || room.responses.some((response) => response.pingId === ping.id && response.playerId === room.currentPlayer.id) || room.role === "GM")).sort((a, b) => b.createdAt - a.createdAt), [room.pings, room.responses, room.currentPlayer.id, room.role, waitingIds]);
  const openReply = (next: MessagePrefill) => { setPrefill(next); setView("create"); };
  const changed = () => void room.refresh();
  const created = () => { setPrefill(null); setView("inbox"); changed(); };

  if (room.status === "connecting") return <StatusPanel title="Connecting to Owlbear Rodeo" message="Loading room participants and waiting Pings…" />;
  if (room.status === "error") return <StatusPanel title="Ping is unavailable" message={room.error ?? "Unable to connect to the room."} onRetry={() => void room.refresh()} />;

  const renderCards = (items: PingRecord[], empty: string) => items.length ? <div className="stack">{items.map((ping) => <PingCard key={ping.id} ping={ping} responses={room.responses} currentPlayer={room.currentPlayer} role={room.role} settings={room.settings} metadata={room.metadata} now={now} onReply={openReply} onChanged={changed} />)}</div> : <section className="empty-state"><img src="/icon.svg" alt="" /><h2>All clear</h2><p>{empty}</p></section>;

  if (focusedPingId) {
    const focused = room.pings.find((ping) => ping.id === focusedPingId);
    return <main className="app-shell notification-shell"><header className="app-header"><div className="brand-lockup"><img src="/icon.svg" alt="" /><h1>{focused?.status === "completed" && (focused.type === "quiz" || focused.type === "vote") ? "Results" : "New Ping"}</h1></div></header><div className="content">{focused ? renderCards([focused], "This Ping is no longer available.") : <StatusPanel title="Ping unavailable" message="This Ping may have been deleted." />}</div></main>;
  }

  return <main className="app-shell">
    <header className="app-header"><button type="button" className="brand-lockup brand-button" aria-label="Open inbox" onClick={() => setView("inbox")}><img src="/icon.svg" alt="" /><h1>{view === "inbox" ? "Ping" : view === "create" ? "Create Ping" : "Settings"}</h1></button><div className="header-actions"><button type="button" className={`header-icon create-icon${view === "create" ? " active" : ""}`} aria-label="Create Ping" aria-pressed={view === "create"} onClick={() => { setPrefill(null); setView(view === "create" ? "inbox" : "create"); }}>+</button><button type="button" className={`header-icon settings-icon${view === "settings" ? " active" : ""}`} aria-label="Settings" aria-pressed={view === "settings"} onClick={() => setView(view === "settings" ? "inbox" : "settings")}><GearGlyph /></button><a className="help-link" href="https://obr-ping.ex-asperis.com/" target="_blank" rel="noreferrer" aria-label="Open Ping help">?</a></div></header>
    {metadataBytes(room.metadata) > METADATA_LIMIT_BYTES * .9 && <div className="notice warning" role="status">Room metadata is nearly full. Ask the GM to review storage.</div>}
    <div className="content">
      {view === "inbox" && <div className="stack inbox">{waiting.length ? renderCards(waiting, "") : <section className="all-clear" role="status"><span aria-hidden="true">✓</span><strong>All clear</strong><small>No unread or unanswered Pings.</small></section>}<details className="recent-section"><summary><span>Recent</span><b>{recent.length}</b></summary><div className="recent-content">{recent.length ? renderCards(recent, "") : <p className="muted">Nothing has been sent or received yet.</p>}</div></details></div>}
      {view === "create" && <ComposePing key={prefill ? `${prefill.source.id}-${prefill.replyAll}` : "new"} role={room.role} currentPlayer={room.currentPlayer} players={prefill ? [...room.players, ...prefill.recipients] : room.players} settings={room.settings} metadata={room.metadata} prefill={prefill} onCreated={created} />}
      {view === "settings" && <SettingsPanel role={room.role} settings={room.settings} pings={room.pings} metadata={room.metadata} onChanged={changed} />}
    </div>
  </main>;
}
