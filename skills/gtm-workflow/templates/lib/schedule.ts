// gtm-lib v17
/** Fixed UTC admission windows for subdaily cron routes; legacy routes remain daily. */
export function scheduleWindow(now: number, cadence: string | null): string {
  if (cadence === null) return new Date(now).toISOString().slice(0, 10);
  const minutes = Number(cadence);
  if (!/^\d+$/.test(cadence) || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440 || 1440 % minutes !== 0) {
    throw new Error("cadence-minutes must be a positive divisor of 1440");
  }
  return new Date(Math.floor(now / (minutes * 60000)) * minutes * 60000).toISOString().slice(0, 16) + "Z";
}
