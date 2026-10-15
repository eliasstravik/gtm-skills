import { defineHandler } from "nitro";
import { connectionsManagement } from "../../../lib/connections-management";
export default defineHandler((event) => connectionsManagement(event.req, [], "session"));
