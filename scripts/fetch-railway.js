import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";

const rows = readSourceRows("railway");
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "railway",
      category: "railway",
      sourceName: "국가철도공단 철도공단사업",
      sourceUrl: "https://www.data.go.kr/data/15088605/fileData.do",
      agency: "국가철도공단",
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("railway", items);
