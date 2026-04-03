import {
  buildUpdateSql,
  CAPITAL_SIDO_NAMES,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  info,
  loadState,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  parseJsonItems,
  saveState,
  toMeters,
  updateOverallScores,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
  countWithin,
  round,
  text,
} from "./district-score-lib";

interface ChildcareCenter {
  lat: number;
  lng: number;
  spare: number;
  vehicle: boolean;
  sigungu: string;
}

interface ElementarySchool {
  lat: number;
  lng: number;
  sido: string;
}

interface Academy {
  lat: number;
  lng: number;
  realm: string;
}

const CHILDCARE_API_KEY = process.env.CHILDCARE_API_KEY;
const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";
const NEIS_ACADEMY_API_KEY = process.env.NEIS_ACADEMY_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

async function fetchChildcareCenters(districts: DistrictState[]): Promise<ChildcareCenter[]> {
  if (!CHILDCARE_API_KEY) {
    warn("05-fetch-childcare: CHILDCARE_API_KEY missing, childcare-center metrics will be zeroed");
    return [];
  }

  const rows: ChildcareCenter[] = [];
  const bySido = new Map<string, Set<string>>();
  for (const district of districts) {
    if (!bySido.has(district.sido)) bySido.set(district.sido, new Set());
    bySido.get(district.sido)!.add(district.sigungu);
  }

  for (const [sidoNm, sigunguSet] of bySido.entries()) {
    for (const sigunguNm of sigunguSet) {
      for (let pageNo = 1; pageNo <= 30; pageNo += 1) {
        const url = paramsToUrl("http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request", {
          serviceKey: CHILDCARE_API_KEY,
          sidoNm,
          sigunguNm,
          pageNo,
          numOfRows: 1000,
        });
        const xml = await fetch(url).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        });
        const items = xmlItems(xml);
        if (!items.length) break;
        for (const item of items) {
          if ((xmlTag(item, "crrcl") ?? "") !== "정상") continue;
          const lat = numeric(xmlTag(item, "lat"));
          const lng = numeric(xmlTag(item, "lon"));
          if (lat == null || lng == null) {
            warn("05-fetch-childcare: skipped childcare center with missing coordinates");
            continue;
          }
          const capa = numeric(xmlTag(item, "crpCapa")) ?? 0;
          const current = numeric(xmlTag(item, "crpCrnt")) ?? 0;
          rows.push({ lat, lng, spare: Math.max(capa - current, 0), vehicle: (xmlTag(item, "vhcl") ?? "N") === "Y", sigungu: sigunguNm });
        }
        if (items.length < 1000) break;
      }
    }
  }
  return rows;
}

async function fetchElementarySchools(): Promise<ElementarySchool[]> {
  const schools: ElementarySchool[] = [];
  for (const sido of CAPITAL_SIDO_NAMES) {
    for (let pIndex = 1; pIndex <= 20; pIndex += 1) {
      const url = paramsToUrl("https://open.neis.go.kr/hub/schoolInfo", {
        KEY: NEIS_API_KEY,
        Type: "json",
        SCHUL_KND_SC_NM: "초등학교",
        LCTN_SC_NM: sido,
        pIndex,
        pSize: 1000,
      });
      const payload = await fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.LATIT_VALUE);
        const lng = numeric(item.LONGI_VALUE);
        if (lat == null || lng == null) {
          warn("05-fetch-childcare: skipped elementary school with missing coordinates");
          continue;
        }
        schools.push({ lat, lng, sido });
      }
      if (items.length < 1000) break;
    }
  }
  return schools;
}

async function fetchAcademies(): Promise<Academy[]> {
  if (!NEIS_ACADEMY_API_KEY) {
    warn("05-fetch-childcare: NEIS_ACADEMY_API_KEY missing, academy metrics will be zeroed");
    return [];
  }

  const academies: Academy[] = [];
  const atptCodes = ["B10", "J10", "E10"];

  for (const atptCode of atptCodes) {
    for (let pageIndex = 1; pageIndex <= 200; pageIndex += 1) {
      const url = paramsToUrl("https://open.neis.go.kr/hub/acaInsTiInfo", {
        KEY: NEIS_ACADEMY_API_KEY,
        Type: "json",
        ATPT_OFCDC_SC_CODE: atptCode,
        pIndex: pageIndex,
        pSize: 1000,
      });
      const payload = await fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.LA);
        const lng = numeric(item.LO);
        if (lat == null || lng == null) {
          warn("05-fetch-childcare: skipped academy with missing coordinates");
          continue;
        }
        const realm = text(item.REALM_SC_NM) ?? "기타";
        academies.push({ lat, lng, realm });
      }
      if (items.length < 1000) break;
    }
  }
  return academies;
}

function applyChildcareScores(
  districts: DistrictState[],
  centers: ChildcareCenter[],
  schools: ElementarySchool[],
  academies: Academy[]
) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const sigunguCenters = centers.filter((row) => row.sigungu === district.sigungu);

    const childcareCount = sigunguCenters.length ? countWithin(point, sigunguCenters, 1000) : 0;
    const capacityLeft1km = sigunguCenters.length ? countWithin(point, sigunguCenters, 1000, (row) => row.spare) : 0;
    const elementaryDistanceM = schools.length ? nearestDistance(point, schools.filter((row) => row.sido === district.sido)) : null;
    const vehicleCount = sigunguCenters.filter((row) => row.vehicle).length;
    const vehicleRatio = sigunguCenters.length ? round(vehicleCount / sigunguCenters.length, 4) : 0;

    // Academy metrics
    const nearbyAcademies = academies.filter((a) => {
      const d = Math.abs(a.lat - (district.center_lat ?? 0)) + Math.abs(a.lng - (district.center_lng ?? 0));
      return d < 0.02; // coarse pre-filter ~2km
    });
    const academyCount1km = academies.length ? countWithin(point, academies, 1000) : 0;
    const uniqueRealms = new Set(
      nearbyAcademies
        .filter((a) => toMeters(point.lat, point.lng, a.lat, a.lng) <= 1000)
        .map((a) => a.realm)
    );
    const academyDiversityScore = uniqueRealms.size;

    district.raw_childcare = {
      childcareCount,
      capacityLeft1km,
      elementaryDistanceM,
      academyCount1km,
      academyDiversityScore,
      vehicleRatio,
    };
  }

  const households = (row: DistrictState): number => Math.max(row.households ?? 0, 1);

  const centerPerHouseholdNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.childcareCount ?? 0) / households(row), 4) : null
  );
  const sparePerHouseholdNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.capacityLeft1km ?? 0) / households(row), 4) : null
  );
  const schoolDistanceNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.elementaryDistanceM ?? null, true
  );
  const academyCountNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.academyCount1km ?? 0) / households(row), 4) : null
  );
  const academyDiversityNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.academyDiversityScore ?? null
  );
  const parkAreaNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_walk != null ? round((row.raw_walk.parkArea1km ?? 0) / households(row), 4) : 0
  );
  const vehicleRatioNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.vehicleRatio ?? null, false
  );

  for (const district of districts) {
    if (!CHILDCARE_API_KEY) {
      // No childcare centers: weight towards school distance, academies, park
      district.s_childcare = round(
        (schoolDistanceNorm.get(district) ?? 0) * 0.35 +
          (academyCountNorm.get(district) ?? 0) * 0.25 +
          (academyDiversityNorm.get(district) ?? 0) * 0.20 +
          (parkAreaNorm.get(district) ?? 0) * 0.15 +
          (vehicleRatioNorm.get(district) ?? 0) * 0.05,
        2
      );
    } else {
      district.s_childcare = round(
        (centerPerHouseholdNorm.get(district) ?? 0) * 0.25 +
          (sparePerHouseholdNorm.get(district) ?? 0) * 0.20 +
          (schoolDistanceNorm.get(district) ?? 0) * 0.20 +
          (academyCountNorm.get(district) ?? 0) * 0.15 +
          (academyDiversityNorm.get(district) ?? 0) * 0.10 +
          (parkAreaNorm.get(district) ?? 0) * 0.05 +
          (vehicleRatioNorm.get(district) ?? 0) * 0.05,
        2
      );
    }
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const [centers, schools, academies] = await Promise.all([
    fetchChildcareCenters(districts),
    fetchElementarySchools(),
    fetchAcademies(),
  ]);
  applyChildcareScores(districts, centers, schools, academies);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("05-childcare.sql", buildUpdateSql(districts, ["s_childcare", "raw_childcare"]));
  info(`05-fetch-childcare: centers=${centers.length}, schools=${schools.length}, academies=${academies.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
