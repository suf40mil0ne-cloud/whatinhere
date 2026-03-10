import { filterCapitalRows, normalizeCapitalPointProject } from "../lib/capital-normalizers.js";
import { readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { CAPITAL_CONSTRUCTION_ROWS } from "./capital-source-seeds.js";

const rows = filterCapitalRows(readSourceRows("capital-construction", CAPITAL_CONSTRUCTION_ROWS));

const items = rows
  .map((record, index) =>
    normalizeCapitalPointProject({
      sourceKey: "capital-construction",
      category: "public_construction",
      sourceName: "행정안전부 생활안전지도 건설공사현황",
      sourceUrl: "https://www.safemap.go.kr/",
      record: {
        ...record,
        address: record.공사현장주소,
      },
      index,
      projectOrigin:
        record.공사구분 === "공공" ? "public" : record.공사구분 === "민간" ? "private" : "mixed",
      confidence: record.착공일 ? "high" : "medium",
      addressKeys: ["공사현장주소", "address"],
      nameKeys: ["공사명"],
      startDateKeys: ["착공일"],
      endDateKeys: ["준공일"],
      descriptionFields: [
        { label: "공사구분", keys: ["공사구분"] },
        { label: "발주자", keys: ["발주자"] },
      ],
    })
  )
  .filter(Boolean);

writeNormalizedSource("capital-construction", items);
