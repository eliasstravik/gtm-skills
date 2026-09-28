/**
 * The one place that names AI Gateway models. Every AI step (generateObject) and every agent stage on the Gateway
 * takes its model from gtmModel(); nothing else spells a model id.
 *
 * The default follows the subscription the author runs agent stages on locally (GTM_AGENT_BACKEND), so the hosted
 * copy stays with the same family: claude -> the newest Claude Haiku, codex -> GPT-6 Luna, anything else -> GPT-6 Luna.
 * Go-live copies GTM_AGENT_BACKEND to the project's Production variables; on Vercel it only picks this default, never
 * a CLI. GTM_MODEL (or `model` on a stage) always wins.
 *
 * Checked 2026-09-28 against the Gateway's model list and the providers' own docs: both are the cheapest current model
 * of their family (Haiku 4.5 $1/$5, GPT-6 Luna $0.10/$0.50 per million tokens). Update the ids here and nowhere else.
 */
export const DEFAULT_MODELS = {
  claude: "anthropic/claude-haiku-4.5",
  codex: "openai/gpt-6-luna",
} as const;

export const FALLBACK_MODEL = DEFAULT_MODELS.codex;

/** The default model for a local backend; unknown or unset backends get GPT-6 Luna. */
export function defaultModel(backend: string | undefined): string {
  const key = backend?.trim().toLowerCase();
  return key === "claude" || key === "codex" ? DEFAULT_MODELS[key] : FALLBACK_MODEL;
}

/** The Gateway model for an AI step or agent stage: GTM_MODEL when set, else the backend's default. An empty value counts as unset. */
export function gtmModel(env: Record<string, string | undefined> = process.env): string {
  return env.GTM_MODEL?.trim() || defaultModel(env.GTM_AGENT_BACKEND);
}
