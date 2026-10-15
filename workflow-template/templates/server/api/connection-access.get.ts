import { defineHandler } from "nitro";
import { connectionProbe } from "../../lib/connections-access";
export default defineHandler(() => connectionProbe());
