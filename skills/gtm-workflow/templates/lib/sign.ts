import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.GTM_RUN_SECRET;
  if (!s) throw new Error("GTM_RUN_SECRET is not set");
  return s;
}

const mac = (slug: string, exp: number) => createHmac("sha256", secret()).update(`${slug}|${exp}`).digest("base64url");
const same = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Diagram link token `<expiry ms>.<hmac>`, valid 7 days. */
export function signLink(slug: string, days = 7): string {
  const exp = Date.now() + days * 86_400_000;
  return `${exp}.${mac(slug, exp)}`;
}

export function verifyLink(slug: string, token: string | null): boolean {
  const [expText, sig] = token?.split(".") ?? [];
  const exp = Number(expText);
  return Boolean(exp && sig) && exp > Date.now() && same(sig, mac(slug, exp));
}

/**
 * The workspace owner, on top of the bearer: header x-gtm-owner-secret equal to GTM_OWNER_SECRET. The hosted agent
 * holds the bearer but never this secret, so it cannot switch off the controls that limit it. Unset means no request
 * is the owner, and owner-only settings change through SQL alone.
 */
export function ownerOk(req: Request): boolean {
  const secret = process.env.GTM_OWNER_SECRET;
  return Boolean(secret) && same(req.headers.get("x-gtm-owner-secret") ?? "", secret as string);
}

/** Bearer GTM_RUN_SECRET; the cron GET also accepts CRON_SECRET, which Vercel Cron sends. */
export function bearerOk(req: Request, allowCron = false): boolean {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = (s?: string) => Boolean(s) && same(given, s as string);
  return ok(process.env.GTM_RUN_SECRET) || (allowCron && ok(process.env.CRON_SECRET));
}
