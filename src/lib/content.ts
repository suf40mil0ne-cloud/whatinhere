import { AREAS, PROJECTS } from "../data/projects";
import { getDistanceKm, type Coordinates } from "./geolocation";
import { getDisplayStatus } from "./project-status";
import type { ProjectRecord } from "../types/content";

export type SortKey = "updated_desc" | "confidence_desc" | "status_asc";

export function filterProjects(options: {
  query?: string;
  status?: string;
  area?: string;
  sort?: SortKey;
}): ProjectRecord[] {
  const query = (options.query || "").trim().toLowerCase();
  const status = options.status && options.status !== "all" ? options.status : "";
  const area = options.area && options.area !== "all" ? options.area : "";

  const filtered = PROJECTS.filter((project) => {
    if (status && project.status !== status) return false;
    if (area && project.areaSlug !== area) return false;

    if (!query) return true;

    const haystack = [
      project.title,
      project.address,
      project.region1,
      project.region2,
      project.region3,
      project.buildingUse,
      project.mainPurpose,
      project.summary,
      project.sourceName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  return sortProjects(filtered, options.sort || "updated_desc");
}

export function sortProjects(projects: ProjectRecord[], sort: SortKey): ProjectRecord[] {
  return [...projects].sort((a, b) => {
    if (sort === "confidence_desc") return b.confidenceScore - a.confidenceScore;
    if (sort === "status_asc") return getDisplayStatus(a).label.localeCompare(getDisplayStatus(b).label, "ko");
    return (b.verifiedAt || b.updatedAt || "").localeCompare(a.verifiedAt || a.updatedAt || "");
  });
}

export function getRecentProjects(limit = 6): ProjectRecord[] {
  return sortProjects(PROJECTS, "updated_desc").slice(0, limit);
}

export function getAreaShortcuts() {
  return AREAS.map((area) => ({
    ...area,
    count: PROJECTS.filter((project) => project.areaSlug === area.slug).length,
  }));
}

export function getProjectsNearCenter(projects: ProjectRecord[], center: Coordinates, radiusKm: number): ProjectRecord[] {
  return projects.filter((project) => {
    if (project.lat == null || project.lng == null) return false;
    return getDistanceKm(center, { lat: project.lat, lng: project.lng }) <= radiusKm;
  });
}

export function getProjectsInBounds(
  projects: ProjectRecord[],
  bounds: { swLat: number; swLng: number; neLat: number; neLng: number } | null
): ProjectRecord[] {
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
