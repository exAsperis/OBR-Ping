import type { Metadata } from "@owlbear-rodeo/sdk";
import { isComplete, isDeletionDue, parsePing, parseResponse, pingKey, responseKey, responsesFor, type PingRecord, type PingResponse } from "./domain";

export function lifecycleUpdate(metadata: Metadata, now = Date.now()) {
  const responses: PingResponse[] = [];
  const pings: PingRecord[] = [];
  for (const value of Object.values(metadata)) {
    const ping = parsePing(value);
    if (ping) pings.push(ping);
    else {
      const response = parseResponse(value);
      if (response) responses.push(response);
    }
  }
  const update: Record<string, unknown> = {};
  for (const ping of pings) {
    if (isDeletionDue(ping, now)) {
      update[pingKey(ping.id)] = undefined;
      for (const key of Object.keys(metadata)) if (key.startsWith(responseKey(ping.id, ""))) update[key] = undefined;
      continue;
    }
    if (ping.status === "active" && isComplete(ping, responses, now)) {
      const relevant = responsesFor(responses, ping.id);
      const allAnswered = !ping.includeFutureRecipients && ping.recipients.every((recipient) => relevant.some((response) => response.playerId === recipient.id));
      const completedAt = allAnswered ? Math.max(ping.createdAt, ...relevant.map((response) => response.respondedAt)) : ping.deadlineAt;
      update[pingKey(ping.id)] = { ...ping, status: "completed", completedAt };
    }
  }
  return update;
}
