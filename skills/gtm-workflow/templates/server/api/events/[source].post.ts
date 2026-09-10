// gtm-lib v20
import { defineEventHandler } from "nitro/h3";
import { eventSources } from "../../../events";
import { receiveEvent } from "../../../lib/events";

export default defineEventHandler((event) => {
  const source = event.context.params?.source ?? "";
  const definition = Object.hasOwn(eventSources, source) ? eventSources[source] : undefined;
  if (!definition) return new Response("unknown event source", { status: 404 });
  return receiveEvent(event.req, source, definition);
});
