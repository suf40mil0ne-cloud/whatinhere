import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";

const rows = readSourceRows("kiscon");
const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "kiscon",
      category: "public_construction",
      sourceName: "국토교통부 공공건설 공사위치정보",
      sourceUrl: "https://www.data.go.kr/data/15094259/fileData.do",
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("kiscon", items);
