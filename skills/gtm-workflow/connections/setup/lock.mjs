import { createClient } from "@libsql/client";
import { open, lstat } from "node:fs/promises";
import { join } from "node:path";
import { requireThat, ConnectionError } from "../src/errors.mjs";
import { windowsState } from "../local/windows-state.mjs";

/** SQLite holds the local OS lock. Process exit releases it, including a crash. */
export async function setupLock(state) {
  const path = join(state.directory, "provisioning-lock.db");
  try { const file = await open(path, "wx", 0o600); await file.close(); windowsState(path, "protect"); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = await lstat(path);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && (process.platform === "win32" || !(stat.mode & 0o077)) &&
    (!process.getuid || stat.uid === process.getuid()), "unsafe_state_file", 403);
  windowsState(path);
  const db = createClient({ url: `file:${path}`, timeout: 0 });
  let tx;
  try { tx = await db.transaction("write"); }
  catch (error) {
    db.close();
    if (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED") throw new ConnectionError("setup_already_running", 409);
    throw new ConnectionError("setup_lock_unavailable", 503);
  }
  let closed = false;
  return async () => {
    if (closed) return; closed = true;
    try { await tx.rollback(); } finally { tx.close(); db.close(); }
  };
}
