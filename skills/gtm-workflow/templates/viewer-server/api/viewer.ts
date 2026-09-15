import { defineHandler } from "nitro";
import { viewerApi } from "../../lib/viewer-handler";
export default defineHandler((event) => viewerApi(event.req));
