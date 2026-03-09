import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { PRIVATE_URBAN_PLAN_ROWS } from "./private-source-seeds.js";

const rows = readSourceRows("private-urban-plan", PRIVATE_URBAN_PLAN_ROWS);
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "private-urban-plan",
      category: "urban_plan",
      sourceName: "민간 개발 관련 지구단위계획·실시계획 인가 자료",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "mixed",
      confidence: "medium",
    })
  )
  .filter(Boolean);

writeNormalizedSource("private-urban-plan", items);
