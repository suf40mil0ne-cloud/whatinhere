import {
  buildInsertIgnoreSql,
  CAPITAL_SIDO_CODES,
  createEmptyDistrict,
  fetchJson,
  geometryCenter,
  info,
  lastRegionToken,
  paramsToUrl,
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

const VWORLD_API_KEY = process.env.VWORLD_API_KEY ?? "C196275E-2166-35AE-A234-DD55A7459140";

async function main() {
  const url = paramsToUrl("https://api.vworld.kr/req/data", {
    service: "data",
    request: "GetFeature",
    data: "LT_C_ADEMD_INFO",
    key: VWORLD_API_KEY,
    domain: "localhost",
    format: "json",
    size: 5000,
    attrFilter: "sig_cd:like:11 OR sig_cd:like:41 OR sig_cd:like:28",
  });

  const payload = await fetchJson(url) as { response?: { result?: { featureCollection?: { features?: VworldFeature[] } } } };
  const features = payload?.response?.result?.featureCollection?.features ?? [];
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
