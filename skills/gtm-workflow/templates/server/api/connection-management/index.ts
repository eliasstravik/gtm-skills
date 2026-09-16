import { defineHandler } from "nitro";
import registry from "#viewer-registry";
import { connectionsManagement } from "../../../lib/connections-management";
export default defineHandler((event) => connectionsManagement(event.req, registry));
