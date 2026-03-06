export type ProjectStatus = "permit" | "start" | "construction" | "approval" | "unknown";

export type ConfidenceLabel = "high" | "medium" | "low";

export type SourceLinkType = "공공데이터" | "지자체" | "공식문서" | "보도자료";

export interface SourceReference {
  label: string;
  url: string;
  type: SourceLinkType;
}

export type NearbyConstructionRecord = {
  id: string;
  slug: string;
  source: string;
  sourceRecordId: string | null;

  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;

  sido: string | null;
  sigungu: string | null;
  eupmyeondong: string | null;

  permitDate: string | null;
  startDate: string | null;
  approvalDate: string | null;
  status: ProjectStatus;
  statusText: string;
  statusReason: string | null;

  buildingUse: string | null;
  mainPurpose: string | null;
  category: string | null;

  summary: string | null;
  description: string | null;

  sourceUrl: string | null;
  sourceName: string;
  updatedAt: string | null;
  verifiedAt: string | null;

  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;

  raw: Record<string, unknown>;
  supportingSources: SourceReference[];
};

export type ProjectRecord = NearbyConstructionRecord;

export interface AreaInfo {
  slug: string;
  name: string;
  shortDescription: string;
  regionalContext: string;
  whyImportant: string;
  fallbackCenter: {
    lat: number;
    lng: number;
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface RadiusOption {
  value: "1km" | "3km" | "5km" | "bounds";
  label: string;
  distanceKm: number | null;
}
