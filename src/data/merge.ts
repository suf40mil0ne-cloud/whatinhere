import type { ProjectRecord } from "../types/content";
import { pickBestRecord } from "./score";

function normalizeKey(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function recordKey(record: ProjectRecord): string {
  const composite = [normalizeKey(record.address), record.permitDate || "", normalizeKey(record.mainPurpose), normalizeKey(record.title)]
    .filter(Boolean)
    .join("|");

  if (composite) return composite;
  if (record.sourceRecordId) return `${record.source}:${record.sourceRecordId}`;
  return `${record.source}:${record.slug}`;
}

export function mergeProjectRecords(records: ProjectRecord[]): ProjectRecord[] {
  const grouped = new Map<string, ProjectRecord[]>();

  records.forEach((record) => {
    const key = recordKey(record);
    const existing = grouped.get(key) || [];
    existing.push(record);
    grouped.set(key, existing);
  });

  return [...grouped.values()].map((group) => {
    const primary = pickBestRecord(group);
    const mergedSources = group.flatMap((item) => item.supportingSources);

    return {
      ...primary,
      permitDate: primary.permitDate || group.find((item) => item.permitDate)?.permitDate || null,
      startDate: primary.startDate || group.find((item) => item.startDate)?.startDate || null,
      approvalDate: primary.approvalDate || group.find((item) => item.approvalDate)?.approvalDate || null,
      lat: primary.lat ?? group.find((item) => item.lat != null)?.lat ?? null,
      lng: primary.lng ?? group.find((item) => item.lng != null)?.lng ?? null,
      address: primary.address || group.find((item) => item.address)?.address || null,
      supportingSources: dedupeSources(mergedSources),
    };
  });
}

function dedupeSources(sources: ProjectRecord["supportingSources"]): ProjectRecord["supportingSources"] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.label}|${source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
