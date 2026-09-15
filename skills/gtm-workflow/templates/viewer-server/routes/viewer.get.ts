import { defineHandler } from "nitro";
import { viewerPage } from "../../lib/viewer-page";
export default defineHandler((event) => viewerPage(event.req));
