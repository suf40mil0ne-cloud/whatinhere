import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";

const rows = readSourceRows("urban-plan");
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "urban-plan",
      category: "urban_plan",
      sourceName: "국토교통부 (도시계획) 실시계획인가정보(월간)",
      sourceUrl: "https://www.data.go.kr/data/15047837/fileData.do",
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("urban-plan", items);
