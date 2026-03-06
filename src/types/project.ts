export interface Project {
  id: string;
  source: string;
  sourceRecordId: string | null;
  slug: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  region1: string | null;
  region2: string | null;
  region3: string | null;
  permitDate: string | null;
  startDate: string | null;
  approvalDate: string | null;
  status: "permit" | "start" | "construction" | "approval" | "unknown";
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
  confidenceLabel: "high" | "medium" | "low";
  raw: Record<string, unknown>;
}

export interface ProjectListResponse {
  mode: "projects" | "summary";
  total: number;
  projects: Project[];
  summary?: {
    by_status: Record<string, number>;
  };
}
