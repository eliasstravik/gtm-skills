// gtm-lib v13
import {
  cancellationHook,
  cancellationToken,
  checkpoint,
  type WorkflowMeta,
} from "./approve";
import { redact } from "./redact";
import {
  getActualRunCostUsd,
  getHeldRunReason,
  registerWorkflowRun,
  updateRun,
} from "./steps";

export type RowStepResult =
  | { key: string; status?: "success"; value: Record<string, unknown> }
  | { key: string; status: "empty"; value?: undefined };

export type RunRowsTable = {
  name: string;
  save: (row: Record<string, unknown>) => Promise<void>;
};

export type RunRowsCaps = {
  maxRows: number;
  maxSpendUsd: number;
  costPerRowUsd: number;
};

export async function runRows<TRow extends { key: string }>(input: {
  rows: TRow[];
  meta: WorkflowMeta;
  table: RunRowsTable;
  rowStep: (
    row: TRow,
    meta: WorkflowMeta,
    signal: AbortSignal,
  ) => Promise<RowStepResult>;
  caps: RunRowsCaps;
}) {
  await registerWorkflowRun(input.meta.runKey);
  const projected = input.rows.length * input.caps.costPerRowUsd;
  if (
    input.rows.length > input.caps.maxRows ||
    projected > input.caps.maxSpendUsd
  ) {
    await updateRun(input.meta.runKey, {
      status: "failed",
      error: "accepted workflow limits exceeded",
      stop_reason: "caps_exceeded",
      completed: 0,
      failed: 0,
      finished: true,
    });
    throw new Error("Accepted workflow limits exceeded");
  }

  const completed: string[] = [];
  const failed: { key: string; error: string }[] = [];
  let success = 0;
  let empty = 0;
  let status: "completed" | "stopped" | "timed_out" | "cancelling" = "completed";
  let stopReason: string | null = null;
  let remainingKeys: string[] = [];
  let failedStep: string | null = null;

  const controller = new AbortController();
  const cancel = cancellationHook.create({ token: cancellationToken(input.meta) });
  const cancelled = cancel.then(({ reason }) => {
    controller.abort(reason ?? "run cancelled");
    return { cancelled: true as const };
  });

  try {
    for (let index = 0; index < input.rows.length; index += 1) {
      const row = input.rows[index];
      try {
        const rowMeta = {
          ...input.meta,
          rowKey: row.key,
          step: input.rowStep.name || "rowStep",
        };
        const outcome = await Promise.race([
          input.rowStep(row, rowMeta, controller.signal).then((value) => ({
            cancelled: false as const,
            value,
          })),
          cancelled,
        ]);
        if (!("value" in outcome)) {
          status = "cancelling";
          stopReason = "cancelled";
          remainingKeys = input.rows.slice(index).map(({ key }) => key);
          break;
        }
        if (outcome.value.status === "empty") {
          empty += 1;
          completed.push(outcome.value.key);
        } else {
          await input.table.save({ key: outcome.value.key, ...outcome.value.value });
          success += 1;
          completed.push(outcome.value.key);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          status = "cancelling";
          stopReason = "cancelled";
          remainingKeys = input.rows.slice(index).map(({ key }) => key);
          break;
        }
        const held = heldReason(error) ?? (await getHeldRunReason(input.meta.runKey));
        if (held) {
          status = "stopped";
          stopReason = held;
          remainingKeys = input.rows.slice(index + 1).map(({ key }) => key);
          failed.push({ key: row.key, error: redact(error) });
          failedStep = input.rowStep.name || "rowStep";
          break;
        }
        failed.push({ key: row.key, error: redact(error) });
        failedStep = input.rowStep.name || "rowStep";
      }

      const spentUsd = await getActualRunCostUsd(input.meta.runKey);
      if (spentUsd > input.caps.maxSpendUsd) {
        status = "stopped";
        stopReason = "spend_cap";
        remainingKeys = input.rows.slice(index + 1).map(({ key }) => key);
        break;
      }

      const processed = completed.length + failed.length;
      if (processed === input.meta.checkpoint) {
        const decision = await checkpoint(input.meta, {
          completed: completed.length,
          failed: failed.length,
          spentUsd,
          projectedSpentUsd: processed * input.caps.costPerRowUsd,
          projectedRemainingUsd:
            (input.rows.length - processed) * input.caps.costPerRowUsd,
          table: input.table.name,
        });
        if (!decision.approved) {
          status = decision.outcome === "timed_out" ? "timed_out" : "stopped";
          stopReason =
            decision.outcome === "timed_out"
              ? "approval_timeout"
              : "operator_denied";
          remainingKeys = input.rows.slice(index + 1).map(({ key }) => key);
          break;
        }
      }
    }
  } finally {
    await cancel.dispose();
  }

  await updateRun(input.meta.runKey, {
    status,
    completed: completed.length,
    failed: failed.length,
    cost_usd: await getActualRunCostUsd(input.meta.runKey),
    stop_reason: stopReason,
    remaining_keys: remainingKeys,
    failed_step: failedStep,
    finished: status !== "cancelling",
  });
  return {
    status,
    completed,
    failed,
    counts: { success, empty, failed: failed.length },
    stopReason,
    remainingKeys,
  };
}

function heldReason(error: unknown): "provider_auth" | "provider_quota" | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { providerErrorKind?: unknown; name?: unknown; message?: unknown };
  if (
    value.providerErrorKind === "provider_auth" ||
    value.name === "ProviderAuthError" ||
    (typeof value.message === "string" && value.message.startsWith("[provider_auth]"))
  ) {
    return "provider_auth";
  }
  if (
    value.providerErrorKind === "provider_quota" ||
    value.name === "ProviderQuotaError" ||
    (typeof value.message === "string" && value.message.startsWith("[provider_quota]"))
  ) {
    return "provider_quota";
  }
  return undefined;
}
