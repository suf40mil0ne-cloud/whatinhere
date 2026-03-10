import { filterCapitalRows, normalizeCapitalPointProject } from "../lib/capital-normalizers.js";
import { readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { CAPITAL_BUILDING_PERMIT_ROWS } from "./capital-source-seeds.js";

const rows = filterCapitalRows(readSourceRows("capital-building-permits", CAPITAL_BUILDING_PERMIT_ROWS));

const items = rows
  .map((record, index) =>
    normalizeCapitalPointProject({
      sourceKey: "capital-building-permits",
      category: "public_construction",
      sourceName: "수도권 지자체 건축허가·착공·사용승인 현황",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      addressKeys: ["대지위치"],
      nameKeys: ["사업명"],
      startDateKeys: ["착공일"],
      approvalDateKeys: ["허가일"],
      descriptionFields: [
        { label: "주용도", keys: ["주용도"] },
        { label: "연면적", keys: ["연면적"] },
        { label: "층수", keys: ["층수"] },
      ],
    })
  )
  .filter(Boolean);

writeNormalizedSource("capital-building-permits", items);
