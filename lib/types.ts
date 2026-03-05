export type ProjectStatus = "RECEIVED" | "APPROVED" | "STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  category?: string;
  address_display?: string | null;
  center?: { lat: number; lng: number } | null;
  confidence?: number;
  last_updated_at?: any;
}
