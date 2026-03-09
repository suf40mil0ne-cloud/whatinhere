import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";

const rows = readSourceRows("housing");
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "housing",
      category: "housing",
      sourceName: "국토교통부 택지정보 단계별사업정보",
      sourceUrl: "https://www.data.go.kr/data/15149148/fileData.do",
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("housing", items);
