import { defineHandler } from "nitro";
import { openLocalConnections } from "../../lib/connections-local";
export default defineHandler((event) => openLocalConnections(event.req));
