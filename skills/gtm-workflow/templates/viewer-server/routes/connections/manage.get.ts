import { defineHandler } from "nitro";
import { localConnectionsPage } from "../../../lib/connections-local";
export default defineHandler((event) => localConnectionsPage(event.req));
