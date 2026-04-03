import {
  DEFAULT_SERVICE_KEY,
  DistrictState,
  info,
  lastRegionToken,
  loadState,
  median,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  round,
  toMeters,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
  quote,
  sqlValue,
} from "./district-score-lib";

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

interface AptComplex {
  kaptCode: string;
  name: string;
  address: string;
  totalUnits: number | null;
  builtYear: number | null;
  lat: number | null;
  lng: number | null;
  districtCode: string | null;
  avgPricePerM2: number | null;
  sTransport: number;
  sWalk: number;
  sValue: number;
  sChildcare: number;
  sSafety: number;
}

async function fetchAptList(sidoNm: string, sggNm: string): Promise<AptComplex[]> {
  const apts: AptComplex[] = [];
  for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
    const url = paramsToUrl("https://apis.data.go.kr/1613000/AptListService3/getTotalAptList", {
      serviceKey: SERVICE_KEY,
      pageNo,
      numOfRows: 1000,
      sidoNm,
      sggNm,
    });
    const xml = await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    const items = xmlItems(xml);
    if (!items.length) break;
    for (const item of items) {
      const kaptCode = xmlTag(item, "kaptCode")?.trim();
      const name = xmlTag(item, "kaptName")?.trim();
      const address = (xmlTag(item, "doroJuso") ?? xmlTag(item, "kaptAddr"))?.trim();
      if (!kaptCode || !name || !address) continue;
      const totalUnitsRaw = numeric(xmlTag(item, "totalHouseHold"));
      const builtYearRaw = xmlTag(item, "kaptdApr")?.trim();
      const builtYear = builtYearRaw ? numeric(builtYearRaw.slice(0, 4)) : null;
      apts.push({
        kaptCode,
        name,
        address,
        totalUnits: totalUnitsRaw,
        builtYear,
        lat: null,
        lng: null,
        districtCode: null,
        avgPricePerM2: null,
        sTransport: 0,
        sWalk: 0,
        sValue: 0,
        sChildcare: 0,
        sSafety: 0,
      });
    }
    if (items.length < 1000) break;
  }
  return apts;
}

async function geocodeAddress(address: string, fallbackQuery?: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_REST_API_KEY) {
    warn("07-fetch-apt-complexes: KAKAO_REST_API_KEY missing, skipping geocoding");
    return null;
  }
  const tryQuery = async (query: string): Promise<{ lat: number; lng: number } | null> => {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
    if (!response.ok) return null;
    const data = await response.json() as { documents?: Array<{ x: string; y: string }> };
    const doc = data.documents?.[0];
    if (!doc) return null;
    const lat = numeric(doc.y);
    const lng = numeric(doc.x);
    if (lat == null || lng == null) return null;
    return { lat, lng };
  };

  const result = await tryQuery(address);
  if (result) return result;
  if (fallbackQuery) return tryQuery(fallbackQuery);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNearestDistrict(lat: number, lng: number, districts: DistrictState[]): DistrictState | null {
  let nearest: DistrictState | null = null;
  let minDist = Number.POSITIVE_INFINITY;
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const dist = toMeters(lat, lng, district.center_lat, district.center_lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = district;
    }
  }
  return nearest;
}

async function fetchAptTrades(lawdCd: string, months: string[]): Promise<Array<{ aptNm: string; dong: string; unitPrice: number }>> {
  const rows: Array<{ aptNm: string; dong: string; unitPrice: number }> = [];
  for (const month of months) {
    const url = paramsToUrl("https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", {
      serviceKey: SERVICE_KEY,
      LAWD_CD: lawdCd,
      DEAL_YMD: month,
    });
    try {
      const xml = await fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
      for (const item of xmlItems(xml)) {
        const area = numeric(xmlTag(item, "excluUseAr"));
        const amount = numeric(xmlTag(item, "dealAmount"));
        const aptNm = (xmlTag(item, "aptNm") ?? "").trim();
        const dong = lastRegionToken(xmlTag(item, "umdNm") ?? xmlTag(item, "법정동") ?? "");
        if (!aptNm || area == null || amount == null || area <= 0) continue;
        rows.push({ aptNm, dong, unitPrice: amount / area });
      }
    } catch (error) {
      warn(`07-fetch-apt-complexes: trade fetch ${lawdCd}/${month} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return rows;
}

function recentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");

  // Build sido→sigungu map from district state
  const sidoSigunguMap = new Map<string, Set<string>>();
  for (const d of districts) {
    if (!sidoSigunguMap.has(d.sido)) sidoSigunguMap.set(d.sido, new Set());
    sidoSigunguMap.get(d.sido)!.add(d.sigungu);
  }

  const sidoNames = ["서울특별시", "경기도", "인천광역시"];
  const allApts: AptComplex[] = [];

  // Fetch apt lists
  for (const sidoNm of sidoNames) {
    const sigunguSet = sidoSigunguMap.get(sidoNm) ?? new Set<string>();
    for (const sggNm of sigunguSet) {
      try {
        const apts = await fetchAptList(sidoNm, sggNm);
        allApts.push(...apts);
        info(`07-fetch-apt-complexes: ${sidoNm}/${sggNm} => ${apts.length} apts`);
      } catch (error) {
        warn(`07-fetch-apt-complexes: fetchAptList ${sidoNm}/${sggNm} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  info(`07-fetch-apt-complexes: total ${allApts.length} apt complexes, geocoding...`);

  // Geocode
  for (const apt of allApts) {
    await sleep(100);
    const coord = await geocodeAddress(apt.address, `${apt.name} ${apt.address}`);
    if (!coord) {
      warn(`07-fetch-apt-complexes: geocoding failed for ${apt.kaptCode} "${apt.name}"`);
      // lat/lng stay null — don't skip
      continue;
    }
    apt.lat = coord.lat;
    apt.lng = coord.lng;
  }

  // Map to district
  for (const apt of allApts) {
    if (apt.lat == null || apt.lng == null) continue;
    const nearest = findNearestDistrict(apt.lat, apt.lng, districts);
    if (!nearest) continue;
    apt.districtCode = nearest.code;
    // Inherit scores
    apt.sTransport = nearest.s_transport;
    apt.sWalk = nearest.s_walk;
    apt.sChildcare = nearest.s_childcare;
    apt.sSafety = nearest.s_safety;
  }

  // Fetch trade data and compute per-apt s_value
  const months = recentMonths(12);
  // Group apts by 5-digit lawd_cd for batch trade fetch
  const lawdTradeCache = new Map<string, Array<{ aptNm: string; dong: string; unitPrice: number }>>();
  const lawdCds = [...new Set(allApts.filter((a) => a.districtCode).map((a) => a.districtCode!.slice(0, 5)))];
  for (const lawdCd of lawdCds) {
    try {
      lawdTradeCache.set(lawdCd, await fetchAptTrades(lawdCd, months));
    } catch (error) {
      warn(`07-fetch-apt-complexes: trade fetch for ${lawdCd} failed: ${error instanceof Error ? error.message : String(error)}`);
      lawdTradeCache.set(lawdCd, []);
    }
  }

  // Assign avgPricePerM2 per apt
  for (const apt of allApts) {
    if (!apt.districtCode) continue;
    const lawdCd = apt.districtCode.slice(0, 5);
    const trades = lawdTradeCache.get(lawdCd) ?? [];
    const matched = trades.filter((row) => row.aptNm === apt.name || row.aptNm.includes(apt.name) || apt.name.includes(row.aptNm));
    if (matched.length >= 3) {
      apt.avgPricePerM2 = median(matched.map((row) => row.unitPrice));
    }
    // If fewer than 3 trades, avgPricePerM2 stays null (fallback to district s_value)
  }

  // Compute s_value for apts that have a price; fall back to district s_value otherwise
  const aptsWithPrice = allApts.filter((a) => a.avgPricePerM2 != null && a.districtCode);
  // Build a fake normalization group using the district sigungu
  interface AptForNorm {
    apt: AptComplex;
    sigungu: string;
    price: number | null;
  }
  const normRows: AptForNorm[] = allApts.map((apt) => {
    const district = apt.districtCode ? districts.find((d) => d.code === apt.districtCode) : undefined;
    return { apt, sigungu: district?.sigungu ?? "", price: apt.avgPricePerM2 };
  });

  const priceNorm = normalizeWithinSgg(normRows, (row) => row.sigungu, (row) => row.price, true);

  for (const normRow of normRows) {
    const { apt } = normRow;
    if (apt.avgPricePerM2 != null) {
      const district = apt.districtCode ? districts.find((d) => d.code === apt.districtCode) : undefined;
      const convenience = district ? (district.s_transport + district.s_walk) / 2 : 0;
      apt.sValue = round((priceNorm.get(normRow) ?? 0) * 0.6 + convenience * 0.4, 2);
    } else {
      // Fallback: use district s_value
      const district = apt.districtCode ? districts.find((d) => d.code === apt.districtCode) : undefined;
      apt.sValue = district?.s_value ?? 0;
    }
  }

  // Build SQL
  const lines = ["BEGIN TRANSACTION;"];
  for (const apt of allApts) {
    lines.push(
      `INSERT OR REPLACE INTO apt_complexes (id, name, address, lat, lng, district_code, built_year, total_units, avg_price_per_m2, s_transport, s_walk, s_value, s_childcare, s_safety) VALUES (` +
        [
          quote(apt.kaptCode),
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
        ].join(", ") +
        ");"
    );
  }
  lines.push("COMMIT;");
  const sql = `${lines.join("\n")}\n`;

  await writeSqlFile("07-apt-complexes.sql", sql);
  info(`07-fetch-apt-complexes: wrote ${allApts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
