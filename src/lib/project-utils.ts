import type { Coordinates } from "./geolocation";
import { getDistanceKm } from "./geolocation";
import type { ProjectCategory, ProjectItem, ProjectStatus } from "./project-types";

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapViewport {
  center: Coordinates;
  bounds: MapBounds;
  level: number;
}

export const CATEGORY_OPTIONS: Array<{ value: ProjectCategory; label: string }> = [
  { value: "building", label: "건물" },
  { value: "railway", label: "철도" },
  { value: "housing", label: "택지개발" },
];

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  building: "건물",
  railway: "철도",
  housing: "택지개발",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "계획",
  approved: "승인",
  in_progress: "공사 중",
  near_completion: "준공 임박",
  completed: "완료",
  unknown: "미확인",
};

export function getCategoryLabel(category: ProjectCategory): string {
  return CATEGORY_LABELS[category];
}

export function getStatusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}

export function formatProjectPeriod(project: ProjectItem): string {
  if (project.startDate && project.endDate) {
    return `${project.startDate} ~ ${project.endDate}`;
  }

  return project.startDate ?? project.endDate ?? project.updatedAt ?? "미확인";
}

export function filterProjectsByCategories(projects: ProjectItem[], categories: ProjectCategory[]): ProjectItem[] {
  return projects.filter((project) => categories.includes(project.category));
}

export function filterProjectsByBounds(projects: ProjectItem[], bounds: MapBounds): ProjectItem[] {
  return projects.filter((project) => {
    return (
      project.latitude >= bounds.south &&
      project.latitude <= bounds.north &&
      project.longitude >= bounds.west &&
      project.longitude <= bounds.east
    );
  });
}

export function sortProjectsByDistance(projects: ProjectItem[], center: Coordinates): ProjectItem[] {
  return [...projects].sort((left, right) => {
    return (
      getDistanceKm(center, { lat: left.latitude, lng: left.longitude }) -
      getDistanceKm(center, { lat: right.latitude, lng: right.longitude })
    );
  });
}

export function areViewportsDifferent(left: MapViewport, right: MapViewport): boolean {
  const threshold = 0.01;

  return (
    Math.abs(left.center.lat - right.center.lat) > threshold ||
    Math.abs(left.center.lng - right.center.lng) > threshold ||
    Math.abs(left.bounds.south - right.bounds.south) > threshold ||
    Math.abs(left.bounds.west - right.bounds.west) > threshold ||
    Math.abs(left.bounds.north - right.bounds.north) > threshold ||
    Math.abs(left.bounds.east - right.bounds.east) > threshold
  );
}
