import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Shared cache of raw provider responses, keyed on provider + question, never on workflow. */
export const cache = sqliteTable(
  "cache",
  {
    name: text("name").notNull(),
    hash: text("hash").notNull(),
    value: text("value").notNull(),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.name, t.hash] })],
);
