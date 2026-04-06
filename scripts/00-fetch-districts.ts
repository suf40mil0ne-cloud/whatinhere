import fs from "node:fs/promises";
import path from "node:path";
import {
  buildInsertIgnoreSql,
  CAPITAL_SIDO_CODES,
  createEmptyDistrict,
  geometryCenter,
  info,
  lastRegionToken,
  ROOT_DIR,
  saveState,
  warn,
  writeSqlFile,
} from "./district-score-lib";

interface VworldFeature {
  properties?: {
    adm_cd?: string;
    adm_nm?: string;
    sidonm?: string;
    sggnm?: string;
    sido?: string;
  };
  geometry?: unknown;
}

async function main() {
  // VWorld API unavailable — read bundled local GeoJSON files
  const districtFiles = ["seoul-emd.json", "gyeonggi-emd.json", "incheon-emd.json"];
  const features: VworldFeature[] = [];
  for (const filename of districtFiles) {
    const filePath = path.join(ROOT_DIR, "src", "data", "districts", filename);
    const raw = await fs.readFile(filePath, "utf8");
    const geojson = JSON.parse(raw) as { features?: VworldFeature[] };
    features.push(...(geojson.features ?? []));
  }
  info(`00-fetch-districts: loaded ${features.length} features from local GeoJSON`);
  const districts = [];

  for (const feature of features) {
    const props = feature.properties;
    const admCd = props?.adm_cd?.trim();
    const admNmRaw = props?.adm_nm?.trim();
    const sidoCode = props?.sido?.trim();
    const sido = props?.sidonm?.trim();
    const sgg = props?.sggnm?.trim();
    if (!admCd || !admNmRaw || !sido || !sgg || !sidoCode || !CAPITAL_SIDO_CODES.has(sidoCode)) continue;
    const center = geometryCenter(feature.geometry);
    if (!center) {
      warn(`00-fetch-districts: skipped ${admCd} because geometry center is missing`);
      continue;
    }
    districts.push(createEmptyDistrict({
      code: admCd,
      sido,
      sigungu: sgg,
      dong: lastRegionToken(admNmRaw),
      center_lat: center.lat,
      center_lng: center.lng,
    }));
  }

  await saveState(districts);
  await writeSqlFile("00-districts.sql", buildInsertIgnoreSql(districts));
  info(`00-fetch-districts: wrote ${districts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
