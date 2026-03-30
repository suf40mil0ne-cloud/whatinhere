import { useEffect, useState } from "react";
import { MOCK_PROJECTS } from "../lib/mock-projects";
import type { ProjectItem } from "../lib/project-types";

async function loadProjects(): Promise<ProjectItem[]> {
  const candidates = ["/data/projects.generated.json", "/data/projects.json"];

  for (const url of candidates) {
    const response = await fetch(url);
    if (!response.ok) continue;
    return (await response.json()) as ProjectItem[];
  }

  throw new Error("Failed to load generated or fallback project data.");
}

export function useProjects(isHomePage: boolean) {
  const [projects, setProjects] = useState<ProjectItem[]>(MOCK_PROJECTS);
  const [dataNotice, setDataNotice] = useState("공공데이터 기반 정적 파일을 불러오는 중입니다.");

  useEffect(() => {
    if (!isHomePage) return;

    let isMounted = true;

    loadProjects()
      .then((items) => {
        if (!isMounted) return;
        setProjects(items);
        setDataNotice("본 서비스는 공공데이터를 바탕으로 주요 공사·개발 정보를 시각화합니다.");
      })
      .catch((error) => {
        console.error("projects-json-load-failed", error);
        if (!isMounted) return;
        setProjects(MOCK_PROJECTS);
        setDataNotice("정적 데이터 파일을 불러오지 못해 내장 공공데이터 샘플로 표시합니다.");
      });

    return () => {
      isMounted = false;
    };
  }, [isHomePage]);

  return { projects, dataNotice };
}
