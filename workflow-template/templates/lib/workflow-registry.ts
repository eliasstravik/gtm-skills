/** Runtime lookup must also work when the authored registry has no keys. */
type RunnableWorkflow = {
  run: (input: never) => Promise<unknown>;
  defaultInput: Record<string, unknown>;
};

export function findWorkflow(
  workflows: Readonly<Record<string, RunnableWorkflow | undefined>>,
  slug: string,
): RunnableWorkflow | undefined {
  return Object.hasOwn(workflows, slug) ? workflows[slug] : undefined;
}
