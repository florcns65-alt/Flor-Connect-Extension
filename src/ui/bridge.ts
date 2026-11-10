import type { z } from "zod";
import { FlorError } from "../shared/errors";
import { EnvelopeSchema, type ClientMessage } from "../shared/messages";

export async function request<T>(schema: z.ZodType<T>, message: ClientMessage): Promise<T> {
  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch {
    throw new FlorError("network", "FLOR Connect couldn't reach its background worker. Try again.");
  }
  const envelope = EnvelopeSchema.safeParse(response);
  if (!envelope.success || !envelope.data.ok) {
    if (envelope.success && !envelope.data.ok) {
      throw new FlorError(envelope.data.error.code, envelope.data.error.message);
    }
    throw new FlorError("server", "FLOR Connect got an unexpected response. Try again.");
  }
  const body = schema.safeParse(envelope.data.data);
  if (!body.success) {
    throw new FlorError("server", "FLOR Connect got an unexpected response. Try again.");
  }
  return body.data;
}
