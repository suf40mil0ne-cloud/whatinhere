export type ProjectCategory = "public_construction" | "railway" | "housing" | "urban_plan" | "road" | "environment";

export type GeometryType = "point" | "polygon";

export type ProjectStatus =
  | "planned"
  | "approved"
  | "in_progress"
  | "traffic_control"
  | "completed"
  | "unknown";

export interface ProjectItem {
  id: string;
  category: ProjectCategory;
  name: string;
  geometryType: GeometryType;
  description?: string;
  latitude: number;
  longitude: number;
  polygon?: Array<{ lat: number; lng: number }>;
  address?: string;
  status: ProjectStatus;
  sourceName: string;
  sourceUrl?: string;
  agency?: string;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  projectOrigin?: "public" | "private" | "mixed" | "unknown";
  confidence?: "high" | "medium" | "low";
}
