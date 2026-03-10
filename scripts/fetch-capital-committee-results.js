import { filterCapitalRows, normalizeCapitalPointProject } from "../lib/capital-normalizers.js";
import { readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { CAPITAL_COMMITTEE_RESULT_ROWS } from "./capital-source-seeds.js";

const rows = filterCapitalRows(readSourceRows("capital-committee-results", CAPITAL_COMMITTEE_RESULT_ROWS));

const items = rows
  .map((record, index) =>
    normalizeCapitalPointProject({
      sourceKey: "capital-committee-results",
      category: "urban_plan",
      sourceName: "수도권 건축위원회·도시건축공동위원회 심의 결과",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: "low",
      statusHint: "planned",
      addressKeys: ["대지위치"],
      nameKeys: ["사업명"],
      reviewDateKeys: ["심의일"],
      descriptionFields: [
        { label: "심의결과", keys: ["심의결과"] },
        { label: "사업내용", keys: ["사업내용"] },
      ],
    })
  )
  .filter(Boolean);

writeNormalizedSource("capital-committee-results", items);
