import { defineHandler } from "nitro";
import { forwardLocalConnections } from "../../../lib/connections-local";
export default defineHandler((event) => forwardLocalConnections(event.req, event.context.params?.path ?? ""));
