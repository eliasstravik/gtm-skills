import { jsonb, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { gtm } from "./gtm";

/** Shared cache of raw provider responses, keyed on provider + question, never on workflow. */
export const cache = gtm.table(
  "cache",
  {
    name: text("name").notNull(),
    hash: text("hash").notNull(),
    value: jsonb("value").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.name, t.hash] })],
);
