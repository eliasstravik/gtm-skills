import { defineHandler } from "nitro";
// A relative location, so a browser behind a trusted proxy stays on the address it used.
export default defineHandler((event) => {
  const query = new URLSearchParams({ workflow: event.context.params?.slug ?? "", view: "logic" });
  return new Response(null, { status: 302, headers: { location: `/viewer?${query}` } });
});
