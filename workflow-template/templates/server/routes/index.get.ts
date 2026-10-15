import { defineHandler } from "nitro";
// A relative location, so a browser behind a trusted proxy stays on the address it used.
export default defineHandler(() =>
  new Response(null, { status: 302, headers: { location: "/viewer" } }),
);
