import type { ComponentType } from "react";
export const EntryForm: ComponentType<{
  selection: Record<string, unknown>;
  inventory: any;
  close: () => void;
  updated: (result: any, id: string | null) => void | Promise<void>;
  beginApply?: (id: string) => void;
  failedApply?: (id: string, failure: Error) => void;
}>;
export const message: (code: string) => string;
