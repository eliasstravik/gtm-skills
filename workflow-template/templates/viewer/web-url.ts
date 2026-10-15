/** Link complete web addresses only; leave emails, prose and other schemes as text. */
export function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (!text || /[\s\u0000-\u001f\u007f\\]/u.test(text)) return;
  const absolute = /^https?:\/\//i.test(text);
  if (!absolute && !/^[^/:?#@]+\.[^/:?#@]+(?:[/:?#]|$)/u.test(text)) return;
  try {
    const url = new URL(absolute ? text : `https://${text}`);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    if (!absolute) {
      const labels = url.hostname.split(".");
      if (
        labels.length < 2 ||
        labels.some(
          (label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
        ) ||
        !/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(labels.at(-1)!)
      )
        return;
    }
    return url.href;
  } catch {
    return;
  }
}
