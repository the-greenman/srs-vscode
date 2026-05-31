// Tree node value objects — no vscode import, safe for unit testing.
import type { EntityKind } from "../cli/types";

export interface GroupNodeData {
  kind: EntityKind;
  label: string;
  count: number;
}

export interface EntityNodeData {
  entityId: string;
  entityKind: EntityKind;
  label: string;
  getArgs: string[];
}

// Build the display label for a group: show count only when > 0
export function groupLabel(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}
