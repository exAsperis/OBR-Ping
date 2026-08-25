import { CATALOGS_KEY } from "./constants";
import { DEFAULT_SETTINGS, SCHEMA_VERSION, parsePing, type MessagePing, type NominationPing, type PingType, type QuizPing, type VotePing } from "./domain";

interface CatalogItemBase { schemaVersion: 1; id: string; deadlineMinutes: number; expiryMinutes: number }
export type CatalogItem = CatalogItemBase & (
  | { type: "message"; content: MessagePing["content"] }
  | { type: "quiz"; content: QuizPing["content"] }
  | { type: "vote"; content: VotePing["content"] }
  | { type: "nomination"; content: NominationPing["content"] }
);

export interface Catalog {
  schemaVersion: 1;
  id: string;
  name: string;
  type: PingType;
  createdAt: number;
  updatedAt: number;
  items: CatalogItem[];
}

const validMinutes = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;

export function parseCatalogItem(value: unknown): CatalogItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CatalogItem>;
  if (item.schemaVersion !== SCHEMA_VERSION || typeof item.id !== "string" || !item.id || !validMinutes(item.deadlineMinutes) || !validMinutes(item.expiryMinutes) || Number(item.expiryMinutes) <= Number(item.deadlineMinutes) || !["message", "quiz", "vote", "nomination"].includes(String(item.type))) return null;
  const createdAt = 1;
  const ping = parsePing({ schemaVersion: SCHEMA_VERSION, id: item.id, type: item.type, sender: { id: "catalog", name: "Catalog" }, recipients: [{ id: "recipient", name: "Recipient" }], createdAt, deadlineAt: createdAt + Number(item.deadlineMinutes) * 60_000, expiresAt: createdAt + Number(item.expiryMinutes) * 60_000, status: "active", content: item.content });
  return ping ? item as CatalogItem : null;
}

export function parseCatalog(value: unknown): Catalog | null {
  if (!value || typeof value !== "object") return null;
  const catalog = value as Partial<Catalog>;
  if (catalog.schemaVersion !== SCHEMA_VERSION || typeof catalog.id !== "string" || !catalog.id || typeof catalog.name !== "string" || !catalog.name.trim() || catalog.name.length > 80 || !["message", "quiz", "vote", "nomination"].includes(String(catalog.type)) || typeof catalog.createdAt !== "number" || typeof catalog.updatedAt !== "number" || !Array.isArray(catalog.items)) return null;
  const items = catalog.items.map(parseCatalogItem);
  if (items.some((item) => !item || item.type !== catalog.type)) return null;
  return { ...catalog, name: catalog.name.trim(), items: items as CatalogItem[] } as Catalog;
}

export function loadCatalogs(): Catalog[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CATALOGS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    const catalogs = value.map(parseCatalog).filter((item): item is Catalog => Boolean(item));
    return catalogs.filter((catalog, index) => catalogs.findIndex((candidate) => candidate.name.toLocaleLowerCase() === catalog.name.toLocaleLowerCase()) === index);
  } catch { return []; }
}

export function saveCatalogs(catalogs: Catalog[]) {
  const parsed = catalogs.map(parseCatalog);
  if (parsed.some((catalog) => !catalog)) throw new Error("Catalog data is invalid.");
  const names = new Set<string>();
  for (const catalog of parsed as Catalog[]) {
    const key = catalog.name.toLocaleLowerCase();
    if (names.has(key)) throw new Error("Catalog names must be unique.");
    names.add(key);
  }
  try { localStorage.setItem(CATALOGS_KEY, JSON.stringify(parsed)); }
  catch { throw new Error("Unable to save the catalog on this device. Local storage may be full."); }
}

export function itemText(item: CatalogItem) {
  return item.type === "message" ? item.content.message : item.type === "nomination" ? item.content.prompt : item.content.question;
}

export function blankCatalogItem(type: PingType): CatalogItem {
  const base = { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), deadlineMinutes: DEFAULT_SETTINGS.defaultDeadlineMinutes, expiryMinutes: DEFAULT_SETTINGS.defaultExpiryMinutes };
  if (type === "message") return { ...base, type, content: { message: "", allowReply: true, allowReplyAll: false } };
  if (type === "nomination") return { ...base, type, content: { prompt: "" } };
  const options = [{ id: crypto.randomUUID(), label: "" }, { id: crypto.randomUUID(), label: "" }];
  if (type === "quiz") return { ...base, type, content: { question: "", mode: "single", options, correctOptionIds: [options[0].id] } };
  return { ...base, type, content: { question: "", mode: "single", options } };
}
