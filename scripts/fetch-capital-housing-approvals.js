import { filterCapitalRows, normalizeCapitalPointProject } from "../lib/capital-normalizers.js";
import { readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { CAPITAL_HOUSING_APPROVAL_ROWS } from "./capital-source-seeds.js";

const rows = filterCapitalRows(readSourceRows("capital-housing-approvals", CAPITAL_HOUSING_APPROVAL_ROWS));

const items = rows
  .map((record, index) =>
    normalizeCapitalPointProject({
      sourceKey: "capital-housing-approvals",
      category: "housing",
      sourceName: "수도권 주택건설사업계획 승인 현황",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      addressKeys: ["대지위치"],
      nameKeys: ["사업명"],
      startDateKeys: ["착공일"],
      endDateKeys: ["준공예정일"],
      approvalDateKeys: ["승인일"],
      descriptionFields: [
        { label: "사업주체", keys: ["사업주체"] },
        { label: "세대수", keys: ["세대수"] },
        { label: "준공예정일", keys: ["준공예정일"] },
      ],
    })
  )
  .filter(Boolean);

writeNormalizedSource("capital-housing-approvals", items);
