import { useEffect, useMemo, useState } from "react";
import { METADATA_LIMIT_BYTES } from "./constants";
import { isRecipient, metadataBytes, waitingPings, type PingRecord } from "./domain";
import { usePingRoom } from "./hooks/usePingRoom";
import { ComposePing, type MessagePrefill } from "./components/ComposePing";
import { PingCard } from "./components/PingCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusPanel } from "./components/StatusPanel";

type Tab = "waiting" | "recent" | "create" | "settings";

export default function App() {
  const room = usePingRoom();
  const [tab, setTab] = useState<Tab>("waiting");
  const [prefill, setPrefill] = useState<MessagePrefill | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const waiting = useMemo(() => waitingPings(room.pings, room.responses, room.currentPlayer.id, now).sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity) || a.createdAt - b.createdAt), [room.pings, room.responses, room.currentPlayer.id, now]);
  const recent = useMemo(() => room.pings.filter((ping) => ping.sender.id === room.currentPlayer.id || isRecipient(ping, room.currentPlayer.id) || room.role === "GM").sort((a, b) => b.createdAt - a.createdAt), [room.pings, room.currentPlayer.id, room.role]);
  const openReply = (next: MessagePrefill) => { setPrefill(next); setTab("create"); };
  const changed = () => void room.refresh();
  const created = () => { setPrefill(null); setTab("recent"); changed(); };

  if (room.status === "connecting") return <StatusPanel title="Connecting to Owlbear Rodeo" message="Loading room participants and waiting Pings…" />;
  if (room.status === "error") return <StatusPanel title="Ping is unavailable" message={room.error ?? "Unable to connect to the room."} onRetry={() => void room.refresh()} />;

  const renderCards = (items: PingRecord[], empty: string) => items.length ? <div className="stack">{items.map((ping) => <PingCard key={ping.id} ping={ping} responses={room.responses} currentPlayer={room.currentPlayer} role={room.role} settings={room.settings} metadata={room.metadata} now={now} onReply={openReply} onChanged={changed} />)}</div> : <section className="empty-state"><img src="/icon.svg" alt="" /><h2>All clear</h2><p>{empty}</p></section>;

  return <main className="app-shell">
    <header className="app-header"><div className="brand-lockup"><img src="/icon.svg" alt="" /><div><span className="eyebrow">Owlbear Rodeo</span><h1>Ping</h1></div></div><div className="room-state"><span className={`presence ${room.sceneReady ? "ready" : ""}`} />{room.sceneReady ? "Scene open" : "No scene needed"}</div></header>
    {metadataBytes(room.metadata) > METADATA_LIMIT_BYTES * .9 && <div className="notice warning" role="status">Room metadata is nearly full. Ask the GM to review storage.</div>}
    <nav className="tab-bar" aria-label="Ping sections">
      <button className={tab === "waiting" ? "active" : ""} onClick={() => setTab("waiting")}><span>Waiting</span>{waiting.length > 0 && <b>{waiting.length}</b>}</button>
      <button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>Recent</button>
      <button className={tab === "create" ? "active" : ""} onClick={() => { setPrefill(null); setTab("create"); }}>Create</button>
      <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Settings</button>
    </nav>
    <div className="content">
      {tab === "waiting" && renderCards(waiting, "You have no unread or unanswered Pings.")}
      {tab === "recent" && renderCards(recent, "Nothing has been sent or received yet.")}
      {tab === "create" && <ComposePing key={prefill ? `${prefill.source.id}-${prefill.replyAll}` : "new"} role={room.role} currentPlayer={room.currentPlayer} players={prefill ? [...room.players, ...prefill.recipients] : room.players} settings={room.settings} metadata={room.metadata} prefill={prefill} onCreated={created} />}
      {tab === "settings" && <SettingsPanel role={room.role} settings={room.settings} pings={room.pings} metadata={room.metadata} onChanged={changed} />}
    </div>
  </main>;
}
