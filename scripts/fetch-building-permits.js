import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { BUILDING_PERMIT_ROWS } from "./private-source-seeds.js";

const rows = readSourceRows("building-permits", BUILDING_PERMIT_ROWS);
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "building-permits",
      category: "public_construction",
      sourceName: "지자체 세움터 기반 건축허가·착공 자료",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: record.착공일 ? "high" : "medium",
    })
  )
  .filter(Boolean);

writeNormalizedSource("building-permits", items);
