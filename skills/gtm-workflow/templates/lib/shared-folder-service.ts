import { apiAccess } from "./route-access";
import { boundedJson, deploymentScope, viewerHeaders } from "./viewer-access";
import { ViewerError } from "./viewer-grants";
import { db } from "./db";
import { delegatedFolderMutation, folderMetadata, rememberProductionFolders } from "./shared-folders";

/** No owner impersonation: this route grants ONLY folder metadata access to the existing automation identity. */
export async function sharedFolderService(req: Request) {
  try {
    if (!process.env.VERCEL || process.env.GTM_VIEWER_MODE === "share" || deploymentScope().environment !== "production" || !(await apiAccess(req, { agent: true })) || req.headers.has("origin") || req.headers.has("cookie") || req.headers.has("sec-fetch-site"))
      throw new ViewerError(401, "unauthorized", "Authenticated production folder service access required.");
    const search = new URL(req.url).search;
    const revisionOnly = req.method === "GET" && search === "?revision=1";
    if (search && !revisionOnly) throw new ViewerError(400, "invalid_action", "Only the exact GET revision=1 mode is permitted.");
    if (!["GET", "POST"].includes(req.method)) throw new ViewerError(405, "method_denied", "GET or POST required.");
    if (revisionOnly) return Response.json({ version: 1, revision: await folderMetadata.revision() }, { headers: viewerHeaders });
    if (req.method === "POST" && !req.headers.get("content-type")?.startsWith("application/json")) throw new ViewerError(415, "content_type", "JSON required.");
    const scope = deploymentScope();
    const folders = req.method === "GET" ? await folderMetadata.read() : await delegatedFolderMutation(db(), scope, await boundedJson(req));
    if (req.method === "POST") rememberProductionFolders(scope, folders);
    return Response.json({ version: 1, folders }, { headers: viewerHeaders });
  } catch (error) {
    const known = error instanceof ViewerError;
    return Response.json({ version: 1, error: { code: known ? error.code : "folders_unavailable", message: known ? error.message : "Shared folders are unavailable. Try again." } }, { status: known ? error.status : 503, headers: viewerHeaders });
  }
}
