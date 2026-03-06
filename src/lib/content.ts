import { AREAS, PROJECTS } from "../data/projects";
import { getDistanceKm, type Coordinates } from "./geolocation";
import type { NearbyConstructionRecord } from "../types/content";

const DEFAULT_NEARBY_KM = 5;

export function getRecentProjects(limit = 6): NearbyConstructionRecord[] {
  return [...PROJECTS]
    .sort((a, b) => (b.verifiedAt || b.updatedAt || "").localeCompare(a.verifiedAt || a.updatedAt || ""))
    .slice(0, limit);
}

export function getAreaShortcuts() {
  return AREAS.map((area) => ({
    ...area,
    count: PROJECTS.filter((project) => {
      if (area.slug === "seoul") return project.sido === "서울";
      if (area.slug === "incheon") return project.sido === "인천";
      if (area.slug === "gyeonggi") return project.sido === "경기";
      return false;
    }).length,
  }));
}

export function getProjectsNearCenter(
  projects: NearbyConstructionRecord[],
  center: Coordinates,
  radiusKm = DEFAULT_NEARBY_KM
): NearbyConstructionRecord[] {
  return projects.filter((project) => {
    if (project.lat == null || project.lng == null) return false;
    return getDistanceKm(center, { lat: project.lat, lng: project.lng }) <= radiusKm;
  });
}

export function getProjectsInBounds(
  projects: NearbyConstructionRecord[],
  bounds: { swLat: number; swLng: number; neLat: number; neLng: number } | null
): NearbyConstructionRecord[] {
  if (!bounds) return projects.filter((project) => project.lat != null && project.lng != null);
  return projects.filter((project) => {
    if (project.lat == null || project.lng == null) return false;
    return (
      project.lat >= bounds.swLat &&
      project.lat <= bounds.neLat &&
      project.lng >= bounds.swLng &&
      project.lng <= bounds.neLng
    );
  });
}
