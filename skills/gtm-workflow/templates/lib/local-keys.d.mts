export function providerVariable(name: unknown): name is string;
export const LOADED_KEYS: "GTM_LOCAL_KEYS";
export const SHELL_KEYS: "GTM_LOCAL_SHELL_KEYS";
export function shellKeyNames(env: Record<string, string | undefined>): string[];
export function reloadableKeys(dir: string, shellNames: string[]): Record<string, string>;
export function fileKeys(dir: string): Record<string, string>;
export function keysFingerprint(keys: Record<string, string>): string;
