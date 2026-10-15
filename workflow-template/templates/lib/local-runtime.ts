import { channel } from "node:diagnostics_channel";
import { reportFailure } from "./failure";

// Nitro reads this config before creating the local queue, including direct `nitro dev` launches.
export function configureLocalRuntime() {
  if (process.env.VERCEL) return;
  process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS ??= "900000";
  process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS ??= "900000";
  const state = globalThis as typeof globalThis & {
    __gtmQueueDiagnostics?: boolean;
  };
  if (!state.__gtmQueueDiagnostics) {
    state.__gtmQueueDiagnostics = true;
    channel("undici:request:error").subscribe((message) => {
      const { request, error } = message as {
        request?: {
          origin?: string;
          path?: string;
          headers?: string | string[];
        };
        error?: unknown;
      };
      if (
        !request ||
        request.path?.split("?")[0] !== "/.well-known/workflow/v1/flow"
      )
        return;
      let hostname: string;
      try {
        hostname = new URL(String(request.origin)).hostname;
      } catch {
        return;
      }
      if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return;
      const headers = Array.isArray(request.headers)
        ? request.headers
            .flatMap((name, i, all) =>
              i % 2 === 0 ? [`${name}: ${all[i + 1]}`] : [],
            )
            .join("\r\n") + "\r\n"
        : (request.headers ?? "");
      const requestId =
        /(?:^|\r\n)x-vqs-message-id:\s*(msg_[A-Z0-9]+)(?:\r\n|$)/i.exec(
          headers,
        )?.[1];
      reportFailure(error, { layer: "local_queue_transport", requestId });
    });
  }
}
configureLocalRuntime();
