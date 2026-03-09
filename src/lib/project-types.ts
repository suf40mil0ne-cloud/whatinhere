export type ProjectCategory = "building" | "railway" | "housing";

export type ProjectStatus =
  | "planned"
  | "approved"
  | "in_progress"
  | "near_completion"
  | "completed"
  | "unknown";

export interface ProjectItem {
  id: string;
  category: ProjectCategory;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  address?: string;
  status: ProjectStatus;
  sourceName: string;
  sourceUrl?: string;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
}
