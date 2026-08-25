import { EXTENSION_ID, METADATA_LIMIT_BYTES, PING_PREFIX, RESPONSE_PREFIX, SETTINGS_KEY } from "./constants";

export const SCHEMA_VERSION = 1 as const;
export const DEFAULT_DEADLINE_MS = 5 * 60_000;
export const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60_000;
export type PingType = "quiz" | "vote" | "nomination" | "message";
export type PingStatus = "active" | "completed" | "cancelled";
export type ChoiceMode = "single" | "multiple";
export type VoteMode = "single" | "ranked";

export interface Participant {
  id: string;
  name: string;
  color?: string;
}

export interface Option {
  id: string;
  label: string;
}

export interface RoomSettings {
  schemaVersion: 1;
  allowPlayers: boolean;
  allowedTypes: Record<PingType, boolean>;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  schemaVersion: SCHEMA_VERSION,
  allowPlayers: false,
  allowedTypes: { quiz: false, vote: false, nomination: false, message: false },
};

interface BasePing {
  schemaVersion: 1;
  id: string;
  type: PingType;
  sender: Participant;
  recipients: Participant[];
  includeFutureRecipients?: boolean;
  createdAt: number;
  expiresAt: number;
  status: PingStatus;
  completedAt?: number;
  cancelledAt?: number;
}

export interface QuizPing extends BasePing {
  type: "quiz";
  deadlineAt: number;
  content: {
    question: string;
    mode: ChoiceMode;
    options: Option[];
    correctOptionIds: string[];
  };
}

export interface VotePing extends BasePing {
  type: "vote";
  deadlineAt: number;
  content: { question: string; mode: VoteMode; options: Option[] };
}

export interface NominationPing extends BasePing {
  type: "nomination";
  deadlineAt: number;
  content: { prompt: string; curated?: string[] };
}

export interface MessagePing extends BasePing {
  type: "message";
  content: {
    message: string;
    allowReply: boolean;
    allowReplyAll: boolean;
    replyTo?: { pingId: string; excerpt: string };
  };
}

export type PingRecord = QuizPing | VotePing | NominationPing | MessagePing;

interface BaseResponse {
  schemaVersion: 1;
  pingId: string;
  playerId: string;
  playerName: string;
  respondedAt: number;
}

export interface QuizResponse extends BaseResponse { type: "quiz"; optionIds: string[] }
export interface VoteResponse extends BaseResponse { type: "vote"; optionIds: string[] }
export interface NominationResponse extends BaseResponse { type: "nomination"; value: string }
export interface MessageResponse extends BaseResponse { type: "message"; read: true }
export type PingResponse = QuizResponse | VoteResponse | NominationResponse | MessageResponse;

export interface QuizStanding {
  player: Participant;
  answered: boolean;
  correct: boolean;
  elapsedMs?: number;
}

export interface IrvRound {
  counts: Record<string, number>;
  eliminated?: string;
  winner?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isParticipant = (value: unknown): value is Participant => isObject(value) && isString(value.id) && value.id.length > 0 && isString(value.name) && (value.color === undefined || isString(value.color));
const isOption = (value: unknown): value is Option => isObject(value) && isString(value.id) && isString(value.label) && value.label.length > 0 && value.label.length <= 100;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const validOptions = (value: unknown) => Array.isArray(value) && value.length >= 2 && value.length <= 8 && value.every(isOption) && new Set(value.map((item) => item.id)).size === value.length;

export function parseSettings(value: unknown): RoomSettings {
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION || typeof value.allowPlayers !== "boolean" || !isObject(value.allowedTypes)) return DEFAULT_SETTINGS;
  const allowedTypes = value.allowedTypes;
  if (["quiz", "vote", "nomination", "message"].some((type) => typeof allowedTypes[type] !== "boolean")) return DEFAULT_SETTINGS;
  return value as unknown as RoomSettings;
}

export function parsePing(value: unknown): PingRecord | null {
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION || !isString(value.id) || !["quiz", "vote", "nomination", "message"].includes(String(value.type)) || !isParticipant(value.sender) || !Array.isArray(value.recipients) || !value.recipients.every(isParticipant) || (value.recipients.length === 0 && value.includeFutureRecipients !== true) || (value.includeFutureRecipients !== undefined && typeof value.includeFutureRecipients !== "boolean") || !isFiniteNumber(value.createdAt) || !["active", "completed", "cancelled"].includes(String(value.status)) || !isObject(value.content)) return null;
  const legacy = value.deadlineAt === undefined;
  let expiresAt: number;
  let deadlineAt: number | undefined;
  if (value.type === "message") {
    if (value.deadlineAt !== undefined) return null;
    expiresAt = value.expiresAt === undefined ? value.createdAt + DEFAULT_EXPIRY_MS : value.expiresAt as number;
  } else if (legacy) {
    deadlineAt = value.expiresAt === undefined ? value.createdAt + DEFAULT_DEADLINE_MS : value.expiresAt as number;
    expiresAt = deadlineAt + DEFAULT_EXPIRY_MS;
  } else {
    deadlineAt = value.deadlineAt as number;
    expiresAt = value.expiresAt as number;
  }
  if (!isFiniteNumber(expiresAt) || expiresAt <= value.createdAt || (deadlineAt !== undefined && (!isFiniteNumber(deadlineAt) || deadlineAt <= value.createdAt || expiresAt <= deadlineAt))) return null;
  const content = value.content;
  switch (value.type) {
    case "quiz": {
      if (!isString(content.question) || content.question.length < 1 || content.question.length > 300 || !["single", "multiple"].includes(String(content.mode)) || !validOptions(content.options) || !isStringArray(content.correctOptionIds) || content.correctOptionIds.length < 1) return null;
      const ids = new Set((content.options as Option[]).map((option) => option.id));
      if (content.correctOptionIds.some((id) => !ids.has(id)) || (content.mode === "single" && content.correctOptionIds.length !== 1)) return null;
      break;
    }
    case "vote":
      if (!isString(content.question) || content.question.length < 1 || content.question.length > 300 || !["single", "ranked"].includes(String(content.mode)) || !validOptions(content.options)) return null;
      break;
    case "nomination":
      if (!isString(content.prompt) || content.prompt.length < 1 || content.prompt.length > 300 || (content.curated !== undefined && (!isStringArray(content.curated) || content.curated.some((item) => item.length > 100)))) return null;
      break;
    case "message":
      if (!isString(content.message) || content.message.length < 1 || content.message.length > 1000 || typeof content.allowReply !== "boolean" || typeof content.allowReplyAll !== "boolean") return null;
      break;
  }
  return { ...value, expiresAt, ...(deadlineAt === undefined ? {} : { deadlineAt }) } as unknown as PingRecord;
}

export function parseResponse(value: unknown): PingResponse | null {
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION || !isString(value.pingId) || !isString(value.playerId) || !isString(value.playerName) || !isFiniteNumber(value.respondedAt) || !["quiz", "vote", "nomination", "message"].includes(String(value.type))) return null;
  if ((value.type === "quiz" || value.type === "vote") && !isStringArray(value.optionIds)) return null;
  if (value.type === "nomination" && (!isString(value.value) || value.value.length < 1 || value.value.length > 160 || /[\r\n]/.test(value.value))) return null;
  if (value.type === "message" && value.read !== true) return null;
  return value as unknown as PingResponse;
}

export function readRoomState(metadata: Record<string, unknown>) {
  const pings: PingRecord[] = [];
  const responses: PingResponse[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith(PING_PREFIX)) {
      const ping = parsePing(value);
      if (ping && key === pingKey(ping.id)) pings.push(ping);
    } else if (key.startsWith(RESPONSE_PREFIX)) {
      const response = parseResponse(value);
      if (response && key === responseKey(response.pingId, response.playerId)) responses.push(response);
    }
  }
  return { settings: parseSettings(metadata[SETTINGS_KEY]), pings, responses };
}

export const pingKey = (pingId: string) => `${PING_PREFIX}${pingId}`;
export const responseKey = (pingId: string, playerId: string) => `${RESPONSE_PREFIX}${pingId}/${encodeURIComponent(playerId)}`;
export const responsesFor = (responses: PingResponse[], pingId: string) => responses.filter((response) => response.pingId === pingId);
export const responseFor = (responses: PingResponse[], pingId: string, playerId: string) => responses.find((response) => response.pingId === pingId && response.playerId === playerId);
export const isRecipient = (ping: PingRecord, playerId: string, now = Date.now()) => ping.recipients.some((recipient) => recipient.id === playerId) || Boolean(ping.includeFutureRecipients && ping.sender.id !== playerId && ping.status === "active" && now < (ping.type === "message" ? ping.expiresAt : ping.deadlineAt));
export const canCreate = (role: "GM" | "PLAYER", type: PingType, settings: RoomSettings) => role === "GM" || (settings.allowPlayers && settings.allowedTypes[type]);
export const canManage = (ping: PingRecord, playerId: string, role: "GM" | "PLAYER") => role === "GM" || ping.sender.id === playerId;
export const isPastDeadline = (ping: PingRecord, now = Date.now()) => ping.type !== "message" && ping.status === "active" && now >= ping.deadlineAt;
export const isDeletionDue = (ping: PingRecord, now = Date.now()) => now >= ping.expiresAt;

export function isComplete(ping: PingRecord, responses: PingResponse[], now = Date.now()) {
  if (ping.status !== "active") return true;
  if (isPastDeadline(ping, now)) return true;
  if (ping.includeFutureRecipients) return false;
  const answered = new Set(responsesFor(responses, ping.id).map((response) => response.playerId));
  return ping.recipients.every((recipient) => answered.has(recipient.id));
}

export function waitingPings(pings: PingRecord[], responses: PingResponse[], playerId: string, now = Date.now()) {
  return pings.filter((ping) => ping.status === "active" && !isDeletionDue(ping, now) && !isPastDeadline(ping, now) && isRecipient(ping, playerId, now) && !responseFor(responses, ping.id, playerId));
}

const sameSet = (left: string[], right: string[]) => left.length === right.length && left.every((value) => right.includes(value));
export function quizStandings(ping: QuizPing, responses: PingResponse[]): QuizStanding[] {
  const players = [...ping.recipients];
  if (ping.includeFutureRecipients) for (const response of responsesFor(responses, ping.id)) if (!players.some((player) => player.id === response.playerId)) players.push({ id: response.playerId, name: response.playerName });
  return players.map((player) => {
    const response = responsesFor(responses, ping.id).find((item): item is QuizResponse => item.playerId === player.id && item.type === "quiz");
    return { player, answered: Boolean(response), correct: Boolean(response && sameSet([...response.optionIds].sort(), [...ping.content.correctOptionIds].sort())), elapsedMs: response ? Math.max(0, response.respondedAt - ping.createdAt) : undefined };
  }).sort((a, b) => Number(b.correct) - Number(a.correct) || Number(b.answered) - Number(a.answered) || (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity) || a.player.name.localeCompare(b.player.name));
}

export function voteTotals(ping: VotePing, responses: PingResponse[]) {
  const totals = Object.fromEntries(ping.content.options.map((option) => [option.id, 0])) as Record<string, number>;
  for (const response of responsesFor(responses, ping.id)) if (response.type === "vote" && response.optionIds[0] in totals) totals[response.optionIds[0]] += 1;
  return totals;
}

export function instantRunoff(ping: VotePing, responses: PingResponse[]): IrvRound[] {
  const optionOrder = ping.content.options.map((option) => option.id);
  let active = [...optionOrder];
  const ballots = responsesFor(responses, ping.id).filter((response): response is VoteResponse => response.type === "vote").map((response) => response.optionIds.filter((id) => optionOrder.includes(id)));
  const rounds: IrvRound[] = [];
  while (active.length) {
    const counts = Object.fromEntries(active.map((id) => [id, 0])) as Record<string, number>;
    for (const ballot of ballots) {
      const choice = ballot.find((id) => active.includes(id));
      if (choice) counts[choice] += 1;
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const winner = active.find((id) => counts[id] > total / 2) ?? (active.length === 1 ? active[0] : undefined);
    if (winner) { rounds.push({ counts, winner }); break; }
    const minimum = Math.min(...Object.values(counts));
    const eliminated = [...active].reverse().find((id) => counts[id] === minimum)!;
    rounds.push({ counts, eliminated });
    active = active.filter((id) => id !== eliminated);
  }
  return rounds;
}

export function metadataBytes(metadata: Record<string, unknown>) {
  return new TextEncoder().encode(JSON.stringify(metadata)).length;
}

export function pingMetadataBytes(metadata: Record<string, unknown>) {
  const own = Object.fromEntries(Object.entries(metadata).filter(([key]) => key === SETTINGS_KEY || key.startsWith(`${EXTENSION_ID}/`)));
  return metadataBytes(own);
}

export function projectedMetadata(metadata: Record<string, unknown>, update: Record<string, unknown>) {
  const next = { ...metadata };
  for (const [key, value] of Object.entries(update)) value === undefined ? delete next[key] : next[key] = value;
  const bytes = metadataBytes(next);
  return { metadata: next, bytes, fits: bytes <= METADATA_LIMIT_BYTES };
}

export const excerpt = (message: string) => message.length <= 120 ? message : `${message.slice(0, 117)}…`;

export function replyRecipients(ping: MessagePing, currentId: string, replyAll: boolean): Participant[] {
  const participants = [ping.sender, ...(replyAll ? ping.recipients : [])];
  return participants.filter((participant, index) => participant.id !== currentId && participants.findIndex((candidate) => candidate.id === participant.id) === index);
}

export function optionLabel(ping: QuizPing | VotePing, optionId: string) {
  return ping.content.options.find((option) => option.id === optionId)?.label ?? "Unknown option";
}

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
