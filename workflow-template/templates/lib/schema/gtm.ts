import { pgSchema } from "drizzle-orm/pg-core";

/** Runtime tables live in their own Postgres schema; workspace result tables stay in public. */
export const gtm = pgSchema("gtm");
