import { defineHandler } from "nitro";
/**
 * Local only. The Workflow SDK's run inspector at `/_workflow` loads a few files (fonts, the decoder for step
 * inputs and outputs) from `/assets/` instead of `/_workflow/assets/`; send them on so step details load.
 */
export default defineHandler((event) => {
  const name = event.url.pathname.slice("/assets/".length);
  if (process.env.VERCEL || !/^[\w-]+(\.[\w-]+)+$/.test(name))
    return new Response("Not found.", { status: 404 });
  return new Response(null, { status: 307, headers: { location: `/_workflow/assets/${name}` } });
});
