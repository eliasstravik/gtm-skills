// gtm-lib v11
import { verifyMigrationLedger } from "../lib/migration-ledger";
import { getDatabaseConfig } from "../lib/db-url";

const root = process.cwd();
const database = getDatabaseConfig();
const verified = await verifyMigrationLedger({
  root,
  url: database.url,
  authToken: database.authToken,
});
process.stdout.write(
  `Verified ${verified} migration ledger entr${verified === 1 ? "y" : "ies"}.\n`,
);
