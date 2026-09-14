import type { ModelCallStreamPart } from "@ai-sdk/workflow";
import { defineHandler } from "nitro";
import { getRun } from "workflow/api";
import { bearerOk } from "../../../../lib/sign";

const LIMIT = 2000;
const clip = (v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v) ?? ""; return s.length > LIMIT ? `${s.slice(0, LIMIT)}…` : s; };

/** Live events of a run whose agent stages stream: one JSON object per line (text, reasoning, tool calls and results, finishes). Ends when the run does. */
export default defineHandler((event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const id = event.context.params?.id ?? "";
  const startIndex = Number(event.url.searchParams.get("startIndex") ?? "0") || 0;
  const lines = getRun(id).getReadable<ModelCallStreamPart>({ startIndex }).pipeThrough(
    new TransformStream<ModelCallStreamPart, string>({
      transform(part, controller) {
        const p = part as { type: string; delta?: string; text?: string; toolName?: string; input?: unknown; output?: unknown; error?: unknown; finishReason?: string };
        const line =
          p.type === "text-delta" ? { type: "text", text: p.delta ?? p.text ?? "" }
          : p.type === "reasoning-delta" ? { type: "reasoning", text: p.delta ?? p.text ?? "" }
          : p.type === "tool-call" ? { type: "tool-call", tool: p.toolName, input: clip(p.input) }
          : p.type === "tool-result" ? { type: "tool-result", tool: p.toolName, output: clip(p.output) }
          : p.type === "tool-error" ? { type: "tool-error", tool: p.toolName, error: clip(p.error) }
          : p.type === "finish-step" ? { type: "model-call-done" }
          : p.type === "finish" ? { type: "done", finishReason: p.finishReason }
          : p.type === "error" ? { type: "error", error: clip(p.error) }
          : null;
        if (line) controller.enqueue(`${JSON.stringify(line)}\n`);
      },
    }),
  ).pipeThrough(new TextEncoderStream());
  return new Response(lines, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
