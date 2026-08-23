import type { Metadata } from "@owlbear-rodeo/sdk";
import { isComplete, parsePing, parseResponse, responsesFor, type PingRecord, type PingResponse } from "./domain";
import { pingKey } from "./domain";

export function completionUpdate(metadata: Metadata, now = Date.now()) {
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
    if (ping.status === "active" && isComplete(ping, responses, now)) {
      const relevant = responsesFor(responses, ping.id);
      const allAnswered = ping.recipients.every((recipient) => relevant.some((response) => response.playerId === recipient.id));
      const completedAt = allAnswered ? Math.max(ping.createdAt, ...relevant.map((response) => response.respondedAt)) : ping.expiresAt ?? now;
      update[pingKey(ping.id)] = { ...ping, status: "completed", completedAt };
    }
  }
  return update;
}
