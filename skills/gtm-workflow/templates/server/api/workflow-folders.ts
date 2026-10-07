import { defineHandler } from "nitro";
import { sharedFolderService } from "../../lib/shared-folder-service";
export default defineHandler((event) => sharedFolderService(event.req));
