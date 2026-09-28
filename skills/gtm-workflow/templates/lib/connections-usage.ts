import { connectionState, declaredConnections, type ConnectionWorkflow } from "./connections-contract";
import { connectionConfiguration } from "./connections-access";
import { connectionMetadata, connectionsVercel, environmentSettingsUrl } from "./connections-management";
import { savedKeyNames } from "./connections-local";
import { platformIdentity } from "./connections-platform";
import { connectionsOrigin } from "./viewer-link";

/** Declared keys this server does not have yet, without asking Vercel: the count next to a workflow's Connections tab. */
export function unsetConnections(entry: ConnectionWorkflow) {
  const identity = platformIdentity();
  return declaredConnections([entry]).filter((use) => !["set", "provided"].includes(connectionState(use.variable, process.env, new Set(), identity))).length;
}

/**
 * A workflow's Connections tab: each key it declares and whether it is usable here, by name only. Locally a key saved
 * in `.env.local` since `npm run dev` started is "saved"; hosted, one the project has that this deployment does not.
 */
export async function workflowConnections(entry: ConnectionWorkflow) {
  const declared = declaredConnections([entry]), identity = platformIdentity();
  const unset = declared.some((use) => connectionState(use.variable, process.env, new Set(), identity) === "missing");
  let saved = new Set<string>(), canSet = !process.env.VERCEL;
  if (process.env.VERCEL) {
    try {
      const config = connectionConfiguration();
      canSet = true;
      if (unset) saved = new Set((await connectionMetadata(connectionsVercel(config), config.projectId)).map((row) => row.variable));
    } catch { /* Keys page off, or Vercel unreachable: unset keys read as missing. */ }
  } else if (unset) saved = new Set(savedKeyNames());
  return {
    declared: entry.connections !== undefined,
    connections: declared.map((use) => ({ variable: use.variable, ...(use.provider ? { provider: use.provider } : {}),
      state: connectionState(use.variable, process.env, saved, identity) })),
    canSet,
    // Hosted without the Keys page, keys are added in the project's settings on Vercel.
    ...(canSet ? { connectionsUrl: connectionsOrigin() } : { vercelUrl: environmentSettingsUrl() }),
  };
}
