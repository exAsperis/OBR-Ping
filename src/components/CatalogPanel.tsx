import { useState } from "react";
import type { Metadata } from "@owlbear-rodeo/sdk";
import { blankCatalogItem, itemText, loadCatalogs, saveCatalogs, type Catalog, type CatalogItem } from "../catalog";
import { canCreate, SCHEMA_VERSION, type Participant, type PingType, type RoomSettings } from "../domain";
import { readSessionLock, startSession, stopSession } from "../session";
import type { CatalogPrefill } from "./ComposePing";
import { PingGlyph } from "./PingGlyph";

interface Props { role: "GM" | "PLAYER"; currentPlayer: Participant; players: Participant[]; settings: RoomSettings; metadata: Metadata; onOpen: (prefill: CatalogPrefill) => void; onChanged: () => void }
const labels: Record<PingType, string> = { message: "Message", vote: "Vote", quiz: "Quiz", nomination: "Nomination" };

export function CatalogPanel({ role, currentPlayer, players, settings, metadata, onOpen, onChanged }: Props) {
  const [catalogs, setCatalogs] = useState(loadCatalogs);
  const [selectedId, setSelectedId] = useState(catalogs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<PingType>("quiz");
  const [message, setMessage] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const selected = catalogs.find((catalog) => catalog.id === selectedId);
  const lock = readSessionLock(metadata);
  const canEdit = role === "GM" || settings.allowPlayerCatalogs;
  const canStart = role === "GM" || settings.allowPlayerSessions && Boolean(selected && canCreate(role, selected.type, settings));
  const persist = (next: Catalog[]) => { saveCatalogs(next); setCatalogs(next); };
  const create = () => {
    const cleaned = name.trim();
    if (!canEdit) { setMessage("The GM has disabled player catalog creation."); return; }
    if (!cleaned) { setMessage("Enter a catalog name."); return; }
    if (catalogs.some((catalog) => catalog.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) { setMessage("Catalog names must be unique."); return; }
    const now = Date.now(), catalog: Catalog = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), name: cleaned, type, createdAt: now, updatedAt: now, items: [] };
    try { persist([...catalogs, catalog]); setSelectedId(catalog.id); setName(""); setMessage("Catalog created."); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to create the catalog."); }
  };
  const removeCatalog = () => {
    if (!selected || !window.confirm(`Delete “${selected.name}” and all of its Pings?`)) return;
    try { const next = catalogs.filter((catalog) => catalog.id !== selected.id); persist(next); setSelectedId(next[0]?.id ?? ""); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to delete the catalog."); }
  };
  const updateItems = (items: CatalogItem[]) => {
    if (!selected) return;
    try { persist(catalogs.map((catalog) => catalog.id === selected.id ? { ...catalog, items, updatedAt: Date.now() } : catalog)); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to update the catalog."); }
  };
  const move = (id: string, target: number) => {
    if (!selected || target < 0 || target >= selected.items.length) return;
    const from = selected.items.findIndex((item) => item.id === id); if (from < 0 || from === target) return;
    const items = [...selected.items], [item] = items.splice(from, 1); items.splice(target, 0, item); updateItems(items);
  };
  const start = async () => {
    if (!selected) return;
    setMessage(null);
    try { await startSession(selected, currentPlayer, players.filter((player) => player.id !== currentPlayer.id), settings, metadata); setMessage("Session started."); onChanged(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to start the session."); }
  };
  const stop = async () => { try { await stopSession(metadata, currentPlayer.id, role === "GM"); setMessage("Session stopped."); onChanged(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to stop the session."); } };
  return <div className="stack catalog-panel">
    <section className="panel stack compact"><span className="eyebrow">Local catalogs</span><div className="catalog-create"><input aria-label="New catalog name" maxLength={80} placeholder="New catalog name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} /><select aria-label="New catalog type" value={type} disabled={!canEdit} onChange={(event) => setType(event.target.value as PingType)}>{(Object.keys(labels) as PingType[]).map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select><button className="secondary-button" disabled={!canEdit || !name.trim()} onClick={create}>Create</button></div>{catalogs.length > 0 && <label>Catalog<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name} · {labels[catalog.type]}</option>)}</select></label>}</section>
    {lock && <section className="panel stack compact"><span className="eyebrow">Active session</span><strong>{labels[lock.type]} {lock.index + 1}/{lock.total}</strong><span className="muted">Hosted by {lock.host.name} · {lock.phase === "results" ? "Showing results" : "Waiting for responses"}</span>{(role === "GM" || lock.host.id === currentPlayer.id) && <button className="danger-button" onClick={() => void stop()}>Stop session</button>}</section>}
    {selected ? <section className="panel stack compact"><div className="section-heading"><div><span className="eyebrow">{labels[selected.type]} catalog</span><h2>{selected.name}</h2></div><button className="text-button danger" onClick={removeCatalog}>Delete catalog</button></div>{selected.items.length ? <ol className="catalog-items">{selected.items.map((item, index) => <li key={item.id} draggable={canEdit} onDragStart={() => setDragged(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) move(dragged, index); setDragged(null); }}><button className="drag-handle" disabled={!canEdit} aria-label={`Reorder item ${index + 1}`} onKeyDown={(event) => { if (event.key === "ArrowUp") move(item.id, index - 1); if (event.key === "ArrowDown") move(item.id, index + 1); }}>⠿</button><span className="catalog-item-glyph"><PingGlyph type={item.type} /></span><span className="catalog-item-text">{itemText(item)}</span><span className="catalog-item-actions">{canCreate(role, item.type, settings) && <button className="text-button" onClick={() => onOpen({ kind: "catalog", mode: "send", item })}>Send</button>}{canEdit && <button className="text-button" onClick={() => onOpen({ kind: "catalog", mode: "edit", catalogId: selected.id, item })}>Edit</button>}<button className="text-button danger" onClick={() => updateItems(selected.items.filter((candidate) => candidate.id !== item.id))}>Delete</button></span></li>)}</ol> : <p className="muted">This catalog is empty.</p>}<div className="button-row">{canEdit && <button className="secondary-button" onClick={() => onOpen({ kind: "catalog", mode: "edit", catalogId: selected.id, item: blankCatalogItem(selected.type) })}>Add Ping</button>}<button className="primary-button" disabled={!selected.items.length || !players.some((player) => player.id !== currentPlayer.id) || !canStart || Boolean(lock)} onClick={() => void start()}>Start session</button></div></section> : <section className="empty-state"><h2>No catalogs</h2><p>Create a local catalog to collect reusable Pings.</p></section>}
    {message && <div className="notice" role="status">{message}</div>}
  </div>;
}
