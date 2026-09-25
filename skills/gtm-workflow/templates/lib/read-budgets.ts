/**
 * How many bytes each read path may pull out of Postgres.
 *
 * Neon counts every byte Postgres sends to a client as data transfer, pooled or not, same region or not, and bills it
 * past the plan's allowance. In September 2026 one workspace of 4,000 people read its 221 MB database out fifty
 * times in two days: whole rows fetched where a few columns were used, and an unbounded `select *` through the query
 * route. These budgets are what stops that coming back. tests/read-budgets.test.ts (in the gtm-workflow skill, run
 * by `node tests/run.mjs <workflows folder> --only read-budgets`) enriches a fixture network, reads it through the
 * viewer and the query route, and fails when a path costs more than its budget.
 *
 * The numbers are bytes received on the client after TLS, as `readBytes()` in lib/db.ts counts them, over fixture
 * records of about 3 KB (a Blitz person with two roles). Real records run larger; the budgets say how many times a
 * record may be read, not how big one is. Each holds headroom of at least a third over the measured value. To see a
 * workflow's own reads, run it locally with GTM_DB_LOG_READS=1 and read the statement shapes it prints at exit.
 */
export const READ_BUDGETS = {
  /** Per person over a whole run: freshness check, attempt, identity resolution, evidence application, company collection. */
  enrichedPerson: 12_000,
  /** Per company over its phase. */
  enrichedCompany: 6_000,
  /** Per row of a viewer list page with the default columns; the People default carries the roles section, which is most of it. */
  listedRow: 4_000,
  /** Per viewer list call: a page of 25 with its count and relation counts. */
  dataApiList: 100_000,
  /** Per viewer call for one record: every column but responses_json. */
  dataApiRecord: 24_000,
  /** Per viewer pulse, which every open tab sends every few seconds: fingerprints only, never rows. */
  viewerPulse: 500,
  /** The query route (POST /api/query): rows and bytes one statement may return. Past either, `truncated` is true. */
  queryRouteRows: 1_000,
  queryRouteBytes: 2 * 1024 * 1024,
} as const;
