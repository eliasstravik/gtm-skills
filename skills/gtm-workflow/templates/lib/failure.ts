/** Bounded diagnostics. Never copy request bodies, headers, URLs, stderr, or provider output. */
export type FailureContext = {
  layer:
    | "step"
    | "local_queue_transport"
    | "mcp_transport"
    | "mcp_tool"
    | "cli_launch"
    | "cli_exit"
    | "cli_timeout"
    | "cli_result"
    | "provider_transport"
    | "provider_response";
  provider?: string;
  endpoint?: string;
  operation?: string;
  runId?: string;
  requestId?: string;
  httpStatus?: number;
  exitCode?: number;
};

const token = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:/-]{1,160}$/.test(value)
    ? value
    : undefined;
const layers = new Set([
  "step",
  "local_queue_transport",
  "mcp_transport",
  "mcp_tool",
  "cli_launch",
  "cli_exit",
  "cli_timeout",
  "cli_result",
  "provider_transport",
  "provider_response",
]);

export function failureDetails(error: unknown, context: FailureContext) {
  const details: Record<string, unknown> = {
    layer: layers.has(context.layer) ? context.layer : "step",
  };
  for (const key of [
    "provider",
    "endpoint",
    "operation",
    "runId",
    "requestId",
  ] as const) {
    const value = token(context[key]);
    if (value) details[key] = value;
  }
  for (const key of ["httpStatus", "exitCode"] as const)
    if (Number.isInteger(context[key])) details[key] = context[key];
  const causes: { name?: string; code?: string | number }[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (
    current &&
    typeof current === "object" &&
    !seen.has(current) &&
    causes.length < 5
  ) {
    seen.add(current);
    const e = current as { name?: unknown; code?: unknown; cause?: unknown };
    const name = token(e.name);
    const code =
      typeof e.code === "number" && Number.isFinite(e.code)
        ? e.code
        : token(e.code);
    causes.push({ ...(name && { name }), ...(code !== undefined && { code }) });
    current = e.cause;
  }
  return { ...details, causes };
}

/** The message survives Workflow's error serialization, which may drop custom properties. */
export function failure(error: unknown, context: FailureContext): Error {
  return new Error(JSON.stringify(failureDetails(error, context)));
}

export function reportFailure(error: unknown, context: FailureContext) {
  const details = failureDetails(error, context);
  console.error("[gtm-workflow]", details);
  return details;
}

export function serverName(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** Keep our already sanitized adapter diagnostic when persisting a row. */
export function rowFailure(error: unknown, runId?: string): string {
  const seen = new Set<unknown>();
  let current = error;
  while (
    current &&
    typeof current === "object" &&
    !seen.has(current) &&
    seen.size < 5
  ) {
    seen.add(current);
    const wrapped = current as { message?: unknown; cause?: unknown };
    try {
      const parsed = JSON.parse(
        typeof wrapped.message === "string" ? wrapped.message : "null",
      );
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.layer === "string"
      ) {
        // Rebuild through the allowlist; arbitrary JSON messages are untrusted too.
        const rebuilt = failureDetails(error, {
          ...parsed,
          runId: runId ?? parsed.runId,
        });
        const causes = Array.isArray(parsed.causes)
          ? parsed.causes.slice(0, 5).map((c: any) => ({
              name: token(c?.name),
              code:
                token(c?.code) ??
                (typeof c?.code === "number" && Number.isFinite(c.code)
                  ? c.code
                  : undefined),
            }))
          : [];
        return JSON.stringify({ ...rebuilt, causes });
      }
    } catch {
      /* Ordinary errors get metadata only, never arbitrary payload text. */
    }
    current = wrapped.cause;
  }
  return JSON.stringify(failureDetails(error, { layer: "step", runId }));
}
