import type { Row } from "./rows";

/**
 * Inbound webhooks that start one run per event, at POST /api/intake/<slug>. A workflow exports `intake` and the
 * registry lists it; the route verifies the signature over the raw body, drops duplicates by event id for 30 days,
 * maps the event to a row, and starts the workflow with that single row. This file is workflow-safe (a workflow file
 * exports its intake); the verification lives in lib/intake-api.ts, which only the route imports.
 */
export type Intake<E = unknown> = {
  /** Variable holding the sender's signing secret, CAL_WEBHOOK_SECRET for example. */
  secretEnv: string;
  /** How the sender signs the raw body. Cal.com: header x-cal-signature-256, sha256, hex. */
  signature: { header: string; algorithm?: "sha256" | "sha1"; encoding?: "hex" | "base64"; prefix?: string };
  /** A stable id per event, so a redelivery starts nothing. */
  eventId: (event: E) => string;
  /** The row to research, or null to ignore this event. */
  toRow: (event: E) => Row | null;
};

export function defineIntake<E>(intake: Intake<E>): Intake<E> {
  return intake;
}
