import { defineHandler } from "nitro";
import { bearerOk } from "../../../lib/sign";
import { viewerLink } from "../../../lib/viewer-link";
import { viewerHeaders } from "../../../lib/viewer-access";
export default defineHandler((event) =>
  bearerOk(event.req)
    ? Response.json(viewerLink(event.req), { headers: viewerHeaders })
    : new Response("Unauthorized", { status: 401, headers: viewerHeaders }),
);
