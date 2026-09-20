import { sql } from "drizzle-orm";
import { jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gtm } from "./gtm";

/** Share links. Only hashes and ciphertext are stored. */
export const gtmViewerGrants = gtm.table(
  "gtm_viewer_grants",
  {
    id: text("id").primaryKey(),
    token_hash: text("token_hash").notNull().unique(),
    workflow_id: text("workflow_id").notNull(),
    workspace: text("workspace").notNull(),
    environment: text("environment").notNull(),
    views: jsonb("views").notNull(),
    data_policy: text("data_policy"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    token_ciphertext: text("token_ciphertext"),
  },
  (t) => [
    uniqueIndex("gtm_viewer_one_active_link")
      .on(t.workspace, t.environment, t.workflow_id)
      .where(sql`${t.revoked_at} IS NULL AND ${t.token_ciphertext} IS NOT NULL`),
  ],
);
