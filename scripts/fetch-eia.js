import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { EIA_ROWS } from "./private-source-seeds.js";

const rows = readSourceRows("eia", EIA_ROWS);
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "eia",
      category: "environment",
      sourceName: "환경영향평가 사업구역 정보",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: "high",
    })
  )
  .filter(Boolean);

writeNormalizedSource("eia", items);
