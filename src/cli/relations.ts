import type { RelationListPayload } from "./types";

/**
 * `relation list` names each endpoint `sourceInstanceId` / `targetInstanceId` since
 * srs-rust#1697 (the schema's names); older builds said `sourceId` / `targetId`.
 * Read through this so the extension works on either, then drop the fallback once
 * the pinned CLI passes srs-rust#1701.
 */
export function normalizeRelationList(payload: RelationListPayload): RelationListPayload {
  return {
    ...payload,
    relations: payload.relations.map((r) => {
      const legacy = r as { sourceId?: string; targetId?: string };
      return {
        ...r,
        sourceInstanceId: r.sourceInstanceId ?? legacy.sourceId ?? "",
        targetInstanceId: r.targetInstanceId ?? legacy.targetId ?? "",
      };
    }),
  };
}
