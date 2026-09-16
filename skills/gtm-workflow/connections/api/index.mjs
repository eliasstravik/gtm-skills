import { hostedHandler } from "../src/hosted.mjs";
export default { async fetch(request) { return (await hostedHandler())(request); } };
