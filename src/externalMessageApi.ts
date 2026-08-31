import { SCHEMA_VERSION, canCreate, type MessagePing, type Participant, type RoomSettings } from "./domain";

export interface ExternalMessageRequestV1 {
  version: 1;
  requestId: string;
  message: string;
  recipients: {
    playerIds?: string[];
    everyone?: boolean;
    includeFutureRecipients?: boolean;
  };
  options?: {
    deadlineMinutes?: number;
    expiryMinutes?: number;
    allowReply?: boolean;
    allowReplyAll?: boolean;
  };
}

export type ExternalMessageRejectionCode = "INVALID_REQUEST" | "PERMISSION_DENIED" | "INVALID_RECIPIENTS" | "CAPACITY_EXCEEDED" | "WRITE_FAILED";

export type ExternalMessageResultV1 =
  | { version: 1; requestId: string; status: "accepted"; pingId: string }
  | { version: 1; requestId: string; status: "rejected"; code: ExternalMessageRejectionCode; message: string };

export class ExternalMessageError extends Error {
  constructor(public readonly code: Extract<ExternalMessageRejectionCode, "INVALID_REQUEST" | "PERMISSION_DENIED" | "INVALID_RECIPIENTS">, message: string) {
    super(message);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validMinutes = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function requestIdFrom(value: unknown) {
  if (!isObject(value) || typeof value.requestId !== "string") return "";
  return value.requestId.trim().slice(0, 100);
}

export function parseExternalMessageRequest(value: unknown): ExternalMessageRequestV1 {
  if (!isObject(value) || value.version !== 1 || typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.trim().length > 100 || typeof value.message !== "string" || !isObject(value.recipients) || (value.options !== undefined && !isObject(value.options))) {
    throw new ExternalMessageError("INVALID_REQUEST", "The external Message request is malformed.");
  }
  const message = value.message.trim();
  if (!message || message.length > 300) throw new ExternalMessageError("INVALID_REQUEST", "Message text must contain 1 to 300 characters after trimming.");
  const recipients = value.recipients;
  if (recipients.playerIds !== undefined && (!Array.isArray(recipients.playerIds) || recipients.playerIds.some((id) => typeof id !== "string" || !id))) throw new ExternalMessageError("INVALID_RECIPIENTS", "Recipient player IDs must be non-empty strings.");
  if (recipients.everyone !== undefined && typeof recipients.everyone !== "boolean" || recipients.includeFutureRecipients !== undefined && typeof recipients.includeFutureRecipients !== "boolean") throw new ExternalMessageError("INVALID_RECIPIENTS", "Recipient flags must be booleans.");
  const playerIds = recipients.playerIds as string[] | undefined;
  if (playerIds && new Set(playerIds).size !== playerIds.length) throw new ExternalMessageError("INVALID_RECIPIENTS", "Recipient player IDs must not contain duplicates.");
  const options = value.options;
  if (options) {
    if (options.deadlineMinutes !== undefined && !validMinutes(options.deadlineMinutes) || options.expiryMinutes !== undefined && !validMinutes(options.expiryMinutes)) throw new ExternalMessageError("INVALID_REQUEST", "Timing overrides must be positive whole minutes.");
    if (options.allowReply !== undefined && typeof options.allowReply !== "boolean" || options.allowReplyAll !== undefined && typeof options.allowReplyAll !== "boolean") throw new ExternalMessageError("INVALID_REQUEST", "Reply options must be booleans.");
  }
  return {
    version: 1,
    requestId: value.requestId.trim(),
    message,
    recipients: {
      ...(playerIds === undefined ? {} : { playerIds }),
      ...(recipients.everyone === undefined ? {} : { everyone: recipients.everyone as boolean }),
      ...(recipients.includeFutureRecipients === undefined ? {} : { includeFutureRecipients: recipients.includeFutureRecipients as boolean }),
    },
    ...(options === undefined ? {} : { options: options as ExternalMessageRequestV1["options"] }),
  };
}

export interface ExternalMessageContext {
  role: "GM" | "PLAYER";
  sender: Participant;
  players: Participant[];
  settings: RoomSettings;
}

export function buildExternalMessage(value: unknown, context: ExternalMessageContext, now = Date.now()): MessagePing {
  const request = parseExternalMessageRequest(value);
  if (!canCreate(context.role, "message", context.settings)) throw new ExternalMessageError("PERMISSION_DENIED", "This player does not have permission to create Message Pings.");

  const available = context.players.filter((player, index, players) => player.id !== context.sender.id && players.findIndex((candidate) => candidate.id === player.id) === index);
  const byId = new Map(available.map((player) => [player.id, player]));
  const requestedIds = request.recipients.playerIds ?? [];
  if (requestedIds.includes(context.sender.id) || requestedIds.some((id) => !byId.has(id))) throw new ExternalMessageError("INVALID_RECIPIENTS", "One or more recipient player IDs are unknown or identify the sender.");
  const selectedIds = request.recipients.everyone ? new Set(available.map((player) => player.id)) : new Set(requestedIds);
  const recipients = available.filter((player) => selectedIds.has(player.id));
  const includeFutureRecipients = request.recipients.includeFutureRecipients === true;
  if (!recipients.length && !includeFutureRecipients) throw new ExternalMessageError("INVALID_RECIPIENTS", "Choose at least one current recipient or include future recipients.");

  const deadlineMinutes = request.options?.deadlineMinutes ?? context.settings.defaultDeadlineMinutes;
  const expiryMinutes = request.options?.expiryMinutes ?? context.settings.defaultExpiryMinutes;
  if (!validMinutes(deadlineMinutes) || !validMinutes(expiryMinutes) || expiryMinutes <= deadlineMinutes) throw new ExternalMessageError("INVALID_REQUEST", "Automatic deletion must be later than the Message deadline.");
  const deadlineAt = now + deadlineMinutes * 60_000;
  const expiresAt = now + expiryMinutes * 60_000;
  if (!Number.isSafeInteger(deadlineAt) || !Number.isSafeInteger(expiresAt)) throw new ExternalMessageError("INVALID_REQUEST", "The requested timing is too far in the future.");
  const allowReplyAll = request.options?.allowReplyAll ?? false;
  const allowReply = allowReplyAll || (request.options?.allowReply ?? false);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    type: "message",
    sender: context.sender,
    recipients,
    ...(includeFutureRecipients ? { includeFutureRecipients: true } : {}),
    createdAt: now,
    deadlineAt,
    expiresAt,
    status: "active",
    content: { message: request.message, allowReply, allowReplyAll },
  };
}
