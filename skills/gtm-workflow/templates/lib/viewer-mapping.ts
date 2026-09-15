import type { Display } from "./viewer-contract";
export function mapSteps(entry: Display, steps: any[]) {
  const mappings: NonNullable<Display["mappings"]> =
    entry.mappings ??
    entry.graph?.nodes
      .filter((n) => n.data.stepId)
      .map((n) => ({ nodeId: n.id, stepName: n.data.stepId! })) ??
    [];
  const result: Record<string, string[]> = {};
  for (const step of steps) {
    const candidates = mappings.filter((m) => {
      if (m.stepName !== step.name) return false;
      if (!("argument" in m) || !m.argument) return true;
      if (step.input.state !== "available") return false;
      let value = step.input.value;
      for (const part of m.argument.path) {
        if (value === null || typeof value !== "object") return false;
        value = value[part];
      }
      return value === m.argument.equals;
    });
    if (candidates.length === 1)
      (result[candidates[0].nodeId] ??= []).push(step.id);
  }
  return result;
}
