export const localMode: boolean;
export function request(path: string, body?: unknown): Promise<any>;
export function initialize(): Promise<{ csrf: string | null }>;
