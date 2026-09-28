/** Run length for the Runs tab. Under ten seconds keeps a tenth, so a quick run never reads as 0s. */
export function duration(ms: number) {
  if (ms < 10000) return `${(Math.floor(Math.max(0, ms) / 100) / 10).toFixed(1)}s`;
  const seconds = Math.floor(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
