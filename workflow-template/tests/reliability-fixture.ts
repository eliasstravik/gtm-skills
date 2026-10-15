export { FatalError } from "@workflow/errors";
/** Hooks resume into this list; a token listed in `goneHooks` answers like a run that can no longer hear it. */
export const resumed: { token: string; payload: unknown }[] = [];
export const goneHooks = new Set<string>();
export const defineHook = () => ({
  resume: async (token: string, payload: unknown) => { if (goneHooks.has(token)) throw new Error("hook not found"); resumed.push({ token, payload }); },
});
export const getWorkflowMetadata = () => ({
  workflowRunId: "wrun_fixture",
  workflowName: "workflow//fixtures/workflow.ts//test",
});
export const setAttributes = () => {};
export const sleep = () => new Promise<never>(() => {});
