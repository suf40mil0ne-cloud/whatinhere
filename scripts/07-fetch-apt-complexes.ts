import {
  DistrictState,
  info,
  loadState,
  normalizeWithinSgg,
  numeric,
  round,
  toMeters,
  warn,
  writeSqlFile,
  quote,
  sqlValue,
} from "./district-score-lib";

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_ORIGIN = "https://whatsinhere.pages.dev";

interface AptComplex {
  id: string;        // place_id from Kakao
  name: string;
  address: string;
  lat: number;
  lng: number;
  districtCode: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  avgPricePerM2: number | null;
  // Legacy cache columns kept for backward compatibility. Read paths should
  // resolve fresh scores from district_scores via district_code first.
  sTransport: number;
  sWalk: number;
  sValue: number;
  sChildcare: number;
  sSafety: number;
}

interface KakaoPlace {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string;  // lng
  y: string;  // lat
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchAptNear(lat: number, lng: number): Promise<KakaoPlace[]> {
  if (!KAKAO_REST_API_KEY) return [];
  const places: KakaoPlace[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent("아파트")}&x=${lng}&y=${lat}&radius=1000&page=${page}&size=15`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
          KA: `sdk/2.0.0 os/web lang/ko device/desktop origin/${KAKAO_ORIGIN}`,
        },
      });
      if (!res.ok) break;
      const data = await res.json() as { documents?: KakaoPlace[]; meta?: { is_end?: boolean } };
      const docs = data.documents ?? [];
      places.push(...docs.filter((d) => d.place_name.includes("아파트") || d.place_name.includes("단지") || d.place_name.includes("래미안") || d.place_name.includes("자이") || d.place_name.includes("푸르지오") || d.place_name.includes("힐스테이트") || d.place_name.includes("e편한세상") || d.place_name.includes("더샵") || d.place_name.includes("트리지움") || d.place_name.includes("롯데캐슬") || d.place_name.includes("SK")));
      if (data.meta?.is_end) break;
    } catch (error) {
      warn(`07-fetch-apt-complexes: Kakao search failed near (${lat},${lng}): ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    await sleep(80);
  }
  return places;
}

function findNearestDistrict(lat: number, lng: number, districts: DistrictState[]): DistrictState | null {
  let nearest: DistrictState | null = null;
  let minDist = Number.POSITIVE_INFINITY;
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const dist = toMeters(lat, lng, d.center_lat, d.center_lng);
    if (dist < minDist) { minDist = dist; nearest = d; }
  }
  return nearest;
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");

  if (!KAKAO_REST_API_KEY) {
    warn("07-fetch-apt-complexes: KAKAO_REST_API_KEY missing — writing empty SQL");
    await writeSqlFile("07-apt-complexes.sql", "BEGIN TRANSACTION;\nCOMMIT;\n");
    return;
  }

  // Collect apartments per sigungu centroid (to avoid redundant searches)
  // Deduplicate by Kakao place_id
  const seenIds = new Set<string>();
  const allApts: AptComplex[] = [];

  // Sample one district per sigungu to reduce Kakao API calls
  const sigunguReps = new Map<string, DistrictState>();
  for (const d of districts) {
    if (!sigunguReps.has(d.sigungu)) sigunguReps.set(d.sigungu, d);
  }

  // Also add all district centroids to get better coverage
  const searchCentroids = [...districts.filter((d) => d.center_lat != null && d.center_lng != null)];

  info(`07-fetch-apt-complexes: searching ${searchCentroids.length} district centroids via Kakao...`);

  let searched = 0;
  for (const d of searchCentroids) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const places = await searchAptNear(d.center_lat, d.center_lng);
    for (const place of places) {
      if (seenIds.has(place.id)) continue;
      seenIds.add(place.id);
      const lat = numeric(place.y);
      const lng = numeric(place.x);
      if (lat == null || lng == null) continue;
      const nearest = findNearestDistrict(lat, lng, districts);
      allApts.push({
        id: place.id,
        name: place.place_name.replace(/아파트$/, "").trim() || place.place_name,
        address: place.road_address_name || place.address_name,
        lat,
        lng,
        districtCode: nearest?.code ?? null,
        builtYear: null,
        totalUnits: null,
        avgPricePerM2: null,
        sTransport: nearest?.s_transport ?? 0,
        sWalk: nearest?.s_walk ?? 0,
        sValue: nearest?.s_value ?? 0,
        sChildcare: nearest?.s_childcare ?? 0,
        sSafety: nearest?.s_safety ?? 0,
      });
    }
    searched++;
    if (searched % 100 === 0) info(`07-fetch-apt-complexes: ${searched}/${searchCentroids.length} searched, ${allApts.length} unique apts so far`);
    await sleep(50);
  }

  info(`07-fetch-apt-complexes: collected ${allApts.length} unique apartments`);

  // Normalize s_value within sigungu
  interface AptForNorm { apt: AptComplex; sigungu: string; price: number | null; }
  const normRows: AptForNorm[] = allApts.map((apt) => {
    const d = apt.districtCode ? districts.find((d) => d.code === apt.districtCode) : undefined;
    return { apt, sigungu: d?.sigungu ?? "", price: apt.avgPricePerM2 };
  });
  const priceNorm = normalizeWithinSgg(normRows, (r) => r.sigungu, (r) => r.price, true);
  for (const normRow of normRows) {
    const { apt } = normRow;
    if (apt.avgPricePerM2 != null) {
      const d = apt.districtCode ? districts.find((d) => d.code === apt.districtCode) : undefined;
      const convenience = d ? (d.s_transport + d.s_walk) / 2 : 0;
      apt.sValue = round((priceNorm.get(normRow) ?? 0) * 0.6 + convenience * 0.4, 2);
    }
  }

  // Build SQL. The copied s_* values are retained only as a fallback cache for
  // rows whose district_code no longer resolves; API reads should join district_scores.
  const lines = ["BEGIN TRANSACTION;"];
  for (const apt of allApts) {
    lines.push(
      `INSERT OR REPLACE INTO apt_complexes (id, name, address, lat, lng, district_code, built_year, total_units, avg_price_per_m2, s_transport, s_walk, s_value, s_childcare, s_safety) VALUES (` +
      [
        quote(apt.id),
        quote(apt.name),
        quote(apt.address),
        sqlValue(apt.lat),
        sqlValue(apt.lng),
        quote(apt.districtCode),
        sqlValue(apt.builtYear),
        sqlValue(apt.totalUnits),
        sqlValue(apt.avgPricePerM2),
        sqlValue(apt.sTransport),
        sqlValue(apt.sWalk),
        sqlValue(apt.sValue),
        sqlValue(apt.sChildcare),
        sqlValue(apt.sSafety),
      ].join(", ") + ");"
    );
  }
  lines.push("COMMIT;");

  await writeSqlFile("07-apt-complexes.sql", `${lines.join("\n")}\n`);
  info(`07-fetch-apt-complexes: wrote ${allApts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
