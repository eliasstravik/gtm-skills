// Isolated production fixture. Credentials are deterministic fixtures, never VM integrations.
import { createServer } from "node:http";
import { sharedFolderService } from "../templates/lib/shared-folder-service";
import { closeDb } from "../templates/lib/db";
const server = createServer(async (incoming, outgoing) => {
  const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
  const req = new Request(`https://production.example${incoming.url}`, { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
  const response = await sharedFolderService(req);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: (server.address() as any).port })));
process.on("SIGTERM", () => { server.close(async () => { await closeDb(); process.exit(0); }); });
