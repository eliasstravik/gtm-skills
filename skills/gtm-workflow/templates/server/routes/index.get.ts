import { defineHandler } from "nitro";
export default defineHandler((event) =>
  Response.redirect(new URL("/viewer", event.req.url), 302),
);
