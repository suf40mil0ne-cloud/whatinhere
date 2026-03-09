import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { COMMITTEE_RESULT_ROWS } from "./private-source-seeds.js";

const rows = readSourceRows("committee-results", COMMITTEE_RESULT_ROWS);
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "committee-results",
      category: "urban_plan",
      sourceName: "건축위원회·도시건축공동위원회 심의 결과",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: "low",
    })
  )
  .filter(Boolean);

writeNormalizedSource("committee-results", items);
