/**
 * Return one example result without external changes.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Acme | ICP: none
 * Providers: none
 */
export async function example() {
  "use workflow";
  return { completed: [{ example: true }], failed: [] };
}
