import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { HOUSING_APPROVAL_ROWS } from "./private-source-seeds.js";

const rows = readSourceRows("housing-approvals", HOUSING_APPROVAL_ROWS);
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "housing-approvals",
      category: "housing",
      sourceName: "지자체 주택건설사업계획 승인 현황",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: record.착공일 ? "high" : "medium",
    })
  )
  .filter(Boolean);

writeNormalizedSource("housing-approvals", items);
