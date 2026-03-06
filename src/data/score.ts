import type { ConfidenceLabel, ProjectRecord } from "../types/content";

export function scoreConfidence(input: {
  source: string;
  hasAddress: boolean;
  hasCoordinates: boolean;
  scheduleFieldCount: number;
}): { score: number; label: ConfidenceLabel } {
  let score = 0.2;

  if (input.source.includes("molit") || input.source.includes("buildinghub")) {
    score += 0.35;
  } else if (input.source.includes("local-gov")) {
    score += 0.25;
  }

  if (input.hasAddress) score += 0.15;
  if (input.hasCoordinates) score += 0.2;
  score += Math.min(input.scheduleFieldCount, 3) * 0.08;

  const normalized = Math.min(0.99, Number(score.toFixed(2)));
  if (normalized >= 0.8) return { score: normalized, label: "high" };
  if (normalized >= 0.6) return { score: normalized, label: "medium" };
  return { score: normalized, label: "low" };
}

export function pickBestRecord(records: ProjectRecord[]): ProjectRecord {
  return [...records].sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  })[0];
}
