import { AREAS, PROJECTS } from "../data/projects";
import type { ProjectData } from "../types/content";

export type SortKey = "updated_desc" | "completion_asc" | "area_desc";

export function filterProjects(options: {
  query?: string;
  status?: string;
  area?: string;
  sort?: SortKey;
}): ProjectData[] {
  const query = (options.query || "").trim().toLowerCase();
  const status = options.status && options.status !== "전체" ? options.status : "";
  const area = options.area && options.area !== "전체" ? options.area : "";

  const filtered = PROJECTS.filter((project) => {
    if (status && project.status !== status) return false;
    if (area && project.areaSlug !== area) return false;
    if (!query) return true;

    const haystack = [
      project.title,
      project.area,
      project.address,
      project.category,
      project.mainUse,
      project.summary,
      project.description,
      "여기 뭐 생겨요",
      "이 공사 뭐짓는거지",
      "언제 완공돼요",
      "여기 개발 예정",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const sorted = [...filtered];
  const sort = options.sort || "updated_desc";

  sorted.sort((a, b) => {
    if (sort === "area_desc") return a.area.localeCompare(b.area, "ko");
    if (sort === "completion_asc") return a.expectedCompletion.localeCompare(b.expectedCompletion, "ko");
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return sorted;
}

export function getRecentProjects(limit = 6): ProjectData[] {
  return [...PROJECTS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export function getAreaShortcuts() {
  return AREAS.map((area) => ({
    ...area,
    count: PROJECTS.filter((project) => project.areaSlug === area.slug).length,
  }));
}
