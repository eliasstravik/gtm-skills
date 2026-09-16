import { defineHandler } from "nitro";
import registry from "#viewer-registry";
import { connectionsApi } from "../../lib/connections-api";
export default defineHandler((event) => connectionsApi(event.req, registry));
