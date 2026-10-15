import { defineHandler } from "nitro";
// Deliberately no imports from lib/, the workflow runtime or database.
import { page } from "../../viewer/shell";
export default defineHandler(
  () =>
    new Response(page, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      },
    }),
);
