import type { SourceRecord } from "../types";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function mapRowToSourceRecord(header: string[], row: string[], index: number): SourceRecord {
  const map: Record<string, string> = {};
  header.forEach((h, i) => {
    map[h] = row[i] ?? "";
  });

  return {
    sourceId: "local-csv-upload",
    sourceRecordId: map.id || `local-${index}`,
    title: map.title || map["사업명"] || "지자체 보강 데이터",
    addressRoad: map.address_road || map["도로명주소"],
    addressJibun: map.address_jibun || map["지번주소"],
    permitType: map.permit_type || map["허가구분"],
    mainUse: map.main_use || map["주용도"],
    permitDate: map.permit_date || map["허가일"],
    startDate: map.start_date || map["착공일"],
    approvalDate: map.approval_date || map["사용승인일"],
    rawStatus: map.raw_status || map["상태"],
    buildingArea: Number(map.building_area || map["건축면적"] || "") || null,
    grossFloorArea: Number(map.gross_floor_area || map["연면적"] || "") || null,
    floorsAbove: Number(map.floors_above || map["지상층수"] || "") || null,
    floorsBelow: Number(map.floors_below || map["지하층수"] || "") || null,
    households: Number(map.households || map["세대수"] || "") || null,
    contractor: map.contractor || map["시공자"],
    designer: map.designer || map["설계자"],
    supervisor: map.supervisor || map["감리자"],
    localGovernment: map.local_government || map["지자체"],
    lat: Number(map.lat || map["위도"] || "") || null,
    lng: Number(map.lng || map["경도"] || "") || null,
    raw: map,
  };
}

export function parseLocalCsv(text: string): SourceRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => mapRowToSourceRecord(header, parseCsvLine(line), index));
}

export function parseLocalXlsx(_bytes: ArrayBuffer): SourceRecord[] {
  // Workers 환경에서 외부 의존성 없이 동작하는 MVP 단계에서는 XLSX를
  // 서버 업로드 시 CSV 변환 후 처리하도록 안내한다.
  throw new Error("XLSX direct parsing is not enabled in MVP. Please convert to CSV and upload.");
}
