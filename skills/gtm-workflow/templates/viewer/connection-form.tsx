import React, { useEffect, useState } from "react";
import { EntryForm, message } from "../connections-ui/entry-form.jsx";
import { initialize, request } from "../connections-ui/transport.mjs";

/**
 * The Keys page's own form, opened from a workflow's Connections tab for one missing key. It reads the Keys page's
 * inventory first, for the key's version, and saves through the same route, so a save here is a save there.
 */
export default function ConnectionForm({ variable, provider, close, saved }: {
  variable: string;
  provider?: string;
  close: () => void;
  saved: () => void;
}) {
  const [inventory, setInventory] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await initialize();
        const next = await request("/api/connections");
        if (live) setInventory(next);
      } catch (failure) {
        if (live) setError((failure as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert" className="notice error">
        {message(error)} <button onClick={close}>Close</button>
      </p>
    );
  if (!inventory) return null;
  // Saved since this tab last read: edit that key rather than add a second one.
  const row = inventory.connections.find((r: any) => r.fields.some((f: any) => f.variable === variable));
  const field = row?.fields.find((f: any) => f.variable === variable);
  const selection = field && field.state !== "disconnected"
    ? { action: "replace", row, field }
    : { action: "add", preset: variable, presetLabel: provider };
  return <EntryForm selection={selection} inventory={inventory} close={close} updated={() => saved()} />;
}
