import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";

const rows = readSourceRows("road");
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "road",
      category: "road",
      sourceName: "한국도로공사 공사 및 도로 차단 계획",
      sourceUrl: "https://www.data.go.kr/data/15076650/openapi.do",
      agency: "한국도로공사",
      trafficControl: true,
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("road", items);
