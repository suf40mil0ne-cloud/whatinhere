const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const ACTIVE_STATUS_KEYWORDS = [
  "construction",
  "in progress",
  "공사중",
  "공사 진행",
  "진행중",
  "착공",
  "시공",
  "시행",
  "추진",
  "진행",
];

const INACTIVE_STATUS_KEYWORDS = [
  "done",
  "complete",
  "completed",
  "closed",
  "준공",
  "완료",
  "종료",
  "해제",
  "취소",
  "중지",
  "보류",
];

const CURATED_CONSTRUCTION_PROJECTS = [
  {
    name: "킨텍스 제3전시장 건립공사",
    type: "building",
    statusText: "착공(2025-10-23), 2028년 준공 목표",
    use: "전시장",
    address: "경기 고양시 일산서구 대화동 킨텍스 일원(제1전시장 주차장 및 제2전시장 서측 부지)",
    lat: 37.6686,
    lng: 126.744,
    startDate: "2025-10-23",
    endDateEst: "2028-12-31",
    source: "curated-public:kintex3",
    sourceLinks: [
      {
        title: "공공데이터포털 - 경기도_KINTEX 시설 현황",
        url: "https://www.data.go.kr/data/15075693/fileData.do",
      },
      {
        title: "산업통상자원부 보도자료 - 킨텍스 제3전시장 착공식(2025-10-23)",
        url: "https://www.motie.go.kr/kor/article/ATCL3f49a5a8c/73488/view?mno=&pageIndex=1&rowPageCnt=10&searchCondition=1&searchKeyword=%ED%82%A8%ED%85%8D%EC%8A%A4",
      },
      {
        title: "킨텍스 공식 안내 - 제3전시장",
        url: "https://www.kintex.com/web/ko/html/company/exhibitionHall3.do",
      },
    ],
  },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeAddressText(v) {
  return asText(v).replace(/\s+/g, " ").trim();
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return "";
}

function readSetting(name, fallback = "") {
  const env = process.env[name];
  if (env !== undefined && env !== null && String(env).trim() !== "") return String(env);

  try {
    const cfg = functions.config();
    const appCfg = cfg && cfg.app ? cfg.app : {};
    const key = name.toLowerCase();
    if (appCfg[key] !== undefined && appCfg[key] !== null && String(appCfg[key]).trim() !== "") {
      return String(appCfg[key]);
    }
  } catch (_) {
    // ignore config read errors and use fallback
  }

  return fallback;
}

function parseDateMaybe(v) {
  const raw = asText(v);
  if (!raw) return null;

  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 8) {
    const y = Number(digits.slice(0, 4));
    const m = Number(digits.slice(4, 6));
    const d = Number(digits.slice(6, 8));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt;
  return null;
}

function inferType(name, rawType) {
  const merged = `${asText(name)} ${asText(rawType)}`;
  if (/지하철|역사|전철|철도|tram|metro|rail/i.test(merged)) return "subway";
  if (/도로|교량|터널|고속|인터체인지|ic|jc|램프|road|bridge|tunnel/i.test(merged)) return "road";
  return "building";
}

function isActiveStatusText(statusText) {
  const s = asText(statusText).toLowerCase();
  if (!s) return null;

  if (INACTIVE_STATUS_KEYWORDS.some((k) => s.includes(k.toLowerCase()))) return false;
  if (ACTIVE_STATUS_KEYWORDS.some((k) => s.includes(k.toLowerCase()))) return true;
  return null;
}

function deriveStatus(statusText, startDateText, endDateText) {
  const byText = isActiveStatusText(statusText);
  if (byText === true) return "construction";
  if (byText === false) return "inactive";

  const start = parseDateMaybe(startDateText);
  const end = parseDateMaybe(endDateText);
  const now = new Date();

  if (start && end) {
    if (start <= now && now <= end) return "construction";
    return now > end ? "inactive" : "planned";
  }

  if (start && !end) {
    return start <= now ? "construction" : "planned";
  }

  if (!start && end) {
    return now <= end ? "construction" : "inactive";
  }

  return "unknown";
}

function makeProjectId(name, address, lat, lng) {
  const base = `${name}|${address}|${lat}|${lng}`;
  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 24);
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 20)}`;
}

function normalizeAddress(addr) {
  return normalizeAddressText(addr)
    .replace(/(특별시|광역시|특별자치시|특별자치도)/g, "")
    .trim();
}

function buildDedupKey(item) {
  const pnu = asText(item.pnu);
  const addr = normalizeAddress(item.address);
  const use = asText(item.use).slice(0, 20);
  const areaBucket = item.areaM2 ? Math.round(Number(item.areaM2) / 100) : 0;
  return `${pnu || addr}|${use}|${areaBucket}`;
}

function projectIdFromDedupKey(dedupKey) {
  return hashId("p", dedupKey);
}

function incomingStageFromSource(sourceName, statusText) {
  const s = asText(sourceName).toLowerCase();
  const st = asText(statusText).toLowerCase();

  if (st.includes("완료") || st.includes("준공") || st.includes("completed")) return "COMPLETED";
  if (st.includes("공사") || st.includes("착공") || st.includes("진행")) return "IN_PROGRESS";

  if (s.includes("dev") || s.includes("개발행위")) return "RECEIVED";
  if (s.includes("build") || s.includes("건축")) return "APPROVED";
  return "RECEIVED";
}

function upgradeStage(current, incoming) {
  const order = {
    RECEIVED: 1,
    APPROVED: 2,
    STARTED: 3,
    IN_PROGRESS: 4,
    COMPLETED: 5,
  };
  const cur = order[current] || 0;
  const inc = order[incoming] || 0;
  return inc > cur ? incoming : current || incoming;
}

function guessCategory(use, title, type) {
  const t = `${asText(use)} ${asText(title)} ${asText(type)}`.toLowerCase();
  if (/(아파트|주택|오피스텔|residential)/i.test(t)) return "주거";
  if (/(물류|창고|logistics|warehouse)/i.test(t)) return "물류";
  if (/(공장|산업|industrial)/i.test(t)) return "산업";
  if (/(학교|도서관|체육|전시장|공공|공원|역사|철도|도로|public)/i.test(t)) return "공공";
  return "기타";
}

function cellSizeDeg(zoom) {
  return zoom === 12 ? 0.02 : 0.005;
}

function gridIdFor(lat, lng, zoom) {
  const cell = cellSizeDeg(zoom);
  const x = Math.floor((lng + 180) / cell);
  const y = Math.floor((lat + 90) / cell);
  return `${zoom}_${x}_${y}`;
}

function gridIdsForBounds(south, west, north, east, zoom) {
  const cell = cellSizeDeg(zoom);
  const x1 = Math.floor((west + 180) / cell);
  const x2 = Math.floor((east + 180) / cell);
  const y1 = Math.floor((south + 90) / cell);
  const y2 = Math.floor((north + 90) / cell);
  const ids = [];
  for (let x = x1; x <= x2; x += 1) {
    for (let y = y1; y <= y2; y += 1) {
      ids.push(`${zoom}_${x}_${y}`);
    }
  }
  return ids;
}

function chooseZoomByLevel(level) {
  if (Number.isFinite(level) && Number(level) <= 5) return 14;
  return 12;
}

function isAuthorizedSync(req) {
  const expected = readSetting("SYNC_TOKEN");
  if (!expected) return false;
  const token = String(req.query.token || req.get("x-sync-token") || "");
  return token === expected;
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

function buildSourceConfigs() {
  const sources = [];

  const seoulApiKey = readSetting("SEOUL_OPEN_API_KEY");
  const seoulDatasetNames = readSetting("SEOUL_DATASET_NAMES", readSetting("SEOUL_DATASET_NAME", ""))
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const seoulMaxRows = Math.max(100, Math.min(5000, Number(readSetting("SEOUL_DATASET_MAX_ROWS", "1000"))));

  if (seoulApiKey && seoulDatasetNames.length) {
    for (const dataset of seoulDatasetNames) {
      sources.push({
        kind: "seoul-openapi",
        name: `seoul-openapi:${dataset}`,
        apiKey: seoulApiKey,
        dataset,
        maxRows: seoulMaxRows,
      });
    }
  }

  const extraJson = readSetting("PUBLIC_DATA_SOURCES_JSON", "");
  if (extraJson) {
    try {
      const parsed = JSON.parse(extraJson);
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (!s || typeof s !== "object") continue;
          if (!s.url || !s.name) continue;
          sources.push({
            kind: "json-url",
            name: String(s.name),
            url: String(s.url),
            rowPaths: Array.isArray(s.rowPaths) && s.rowPaths.length
              ? s.rowPaths.map((p) => String(p))
              : ["response.body.items.item", "response.body.items", "items", "data", "results", "row"],
            linkTemplate: s.linkTemplate ? String(s.linkTemplate) : "",
          });
        }
      }
    } catch (e) {
      console.error("PUBLIC_DATA_SOURCES_JSON parse error", e.message || e);
    }
  }

  return sources;
}

async function fetchRowsFromSource(source) {
  if (source.kind === "seoul-openapi") {
    const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(source.apiKey)}/json/${encodeURIComponent(source.dataset)}/1/${source.maxRows}/`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Seoul API request failed: ${resp.status}`);
    }

    const json = await resp.json();
    const root =
      json[source.dataset] ||
      Object.values(json).find((v) => v && typeof v === "object" && Array.isArray(v.row));

    if (!root || !Array.isArray(root.row)) {
      throw new Error("Seoul API response has no row array");
    }

    return { rows: root.row, sourceUrl: url };
  }

  if (source.kind === "json-url") {
    const resp = await fetch(source.url);
    if (!resp.ok) {
      throw new Error(`JSON source request failed: ${resp.status}`);
    }

    const json = await resp.json();
    let rows = null;
    for (const path of source.rowPaths) {
      const candidate = getByPath(json, path);
      if (Array.isArray(candidate)) {
        rows = candidate;
        break;
      }
    }

    if (!rows) {
      throw new Error("JSON source row path not found");
    }

    return { rows, sourceUrl: source.url };
  }

  throw new Error(`Unknown source kind: ${source.kind}`);
}

function applyLinkTemplate(linkTemplate, row) {
  if (!linkTemplate) return "";
  return linkTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => asText(row[key]));
}

async function geocodeWithVworld(address) {
  const key = readSetting("VWORLD_API_KEY");
  if (!key) return null;

  async function requestByType(type) {
    const url = new URL("https://api.vworld.kr/req/address");
    url.searchParams.set("service", "address");
    url.searchParams.set("request", "getcoord");
    url.searchParams.set("version", "2.0");
    url.searchParams.set("crs", "epsg:4326");
    url.searchParams.set("address", address);
    url.searchParams.set("refine", "true");
    url.searchParams.set("simple", "false");
    url.searchParams.set("format", "json");
    url.searchParams.set("type", type);
    url.searchParams.set("key", key);

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const json = await resp.json();
    const point = json?.response?.result?.point;
    const lng = asNumber(point?.x);
    const lat = asNumber(point?.y);
    if (lat === null || lng === null) return null;
    return { lat, lng, provider: "vworld" };
  }

  return (await requestByType("ROAD")) || (await requestByType("PARCEL"));
}

async function geocodeWithKakao(address) {
  const key = readSetting("KAKAO_REST_API_KEY");
  if (!key) return null;

  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);
  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `KakaoAK ${key}`,
    },
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const first = Array.isArray(json?.documents) ? json.documents[0] : null;
  const lng = asNumber(first?.x);
  const lat = asNumber(first?.y);
  if (lat === null || lng === null) return null;
  return { lat, lng, provider: "kakao" };
}

async function geocodeAddressCached(address, { persistCache = true } = {}) {
  const normalized = normalizeAddressText(address);
  if (!normalized) return null;

  const cacheId = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 24);
  const ref = db.collection("geocache").doc(cacheId);
  const cached = await ref.get();
  if (cached.exists) {
    const d = cached.data() || {};
    if (typeof d.lat === "number" && typeof d.lng === "number") {
      return { lat: d.lat, lng: d.lng, provider: d.provider || "cache" };
    }
  }

  const providerOrder = readSetting("GEOCODER_PROVIDER_ORDER", "vworld,kakao")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  let result = null;
  for (const provider of providerOrder) {
    if (provider === "vworld") result = await geocodeWithVworld(normalized);
    if (!result && provider === "kakao") result = await geocodeWithKakao(normalized);
    if (result) break;
  }

  if (!result) return null;

  if (persistCache) {
    await ref.set(
      {
        address: normalized,
        lat: result.lat,
        lng: result.lng,
        provider: result.provider,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return result;
}

function getCuratedConstructionProjects() {
  return CURATED_CONSTRUCTION_PROJECTS.map((p) => ({
    ...p,
    status: "construction",
    endDateEstText: p.endDateEst,
    sourceFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));
}

function getCuratedConstructionProjectsForNearby() {
  return CURATED_CONSTRUCTION_PROJECTS.map((p) => ({
    id: `curated-${makeProjectId(p.name, p.address, p.lat, p.lng)}`,
    name: p.name,
    type: p.type || "building",
    status: "construction",
    statusText: p.statusText || "",
    address: p.address || "",
    lat: p.lat,
    lng: p.lng,
    startDate: p.startDate || "",
    endDateEst: p.endDateEst || "",
    endDateEstText: p.endDateEst || "",
    source: p.source || "curated-public",
    sourceLinks: Array.isArray(p.sourceLinks) ? p.sourceLinks : [],
    sourceFetchedAt: null,
    updatedAt: null,
  }));
}

function normalizeRow(row, sourceName, sourceUrl, linkTemplate = "") {
  const name = asText(
    pick(row, [
      "BIZ_NM", "CNSTRCT_NM", "PRJ_NM", "SITETITLE", "TITLE", "NAME", "사업명", "공사명", "현장명", "공사현장명",
    ])
  );
  const address = asText(
    pick(row, [
      "ADDR", "ADDRESS", "SITE_ADDR", "RD_ADDR", "ROAD_ADDR", "LOCPLC", "지번주소", "도로명주소", "주소", "위치",
    ])
  );

  const lat = asNumber(
    pick(row, [
      "YDNTS", "LAT", "WGS84_LAT", "Y", "위도", "Y_COORD", "YCOORD", "REFINE_WGS84_LAT", "mapY",
    ])
  );
  const lng = asNumber(
    pick(row, [
      "XDNTS", "LNG", "LON", "WGS84_LON", "WGS84_LNG", "X", "경도", "X_COORD", "XCOORD", "REFINE_WGS84_LOGT", "mapX",
    ])
  );

  if (!name) return null;

  const statusText = asText(
    pick(row, [
      "STATUS", "STAT_NM", "PRGS_STAT", "CONS_STAT", "CSTRN_STTUS", "공정상태", "상태", "진행상태", "착공여부",
    ])
  );

  const rawType = asText(
    pick(row, ["TYPE", "BIZ_SE", "FACILITY_TYPE", "공종", "시설구분", "사업구분", "시설종류", "공사종류"])
  );
  const pnu = asText(
    pick(row, ["PNU", "MNNM_SGG_CD", "법정동코드", "지번코드", "필지코드"])
  );
  const use = asText(
    pick(row, ["MAIN_PURPS_CD_NM", "PURPS_NM", "USE", "용도", "주용도"])
  );
  const areaM2 = asNumber(
    pick(row, ["TOTAREA", "TOT_AREA", "AREA", "ARCH_AREA", "대지면적", "건축면적", "연면적"])
  );
  const floors = asNumber(
    pick(row, ["GRND_FLR_CNT", "FLR_CNT", "층수", "지상층수"])
  );
  const units = asNumber(
    pick(row, ["HHLD_CNT", "UNIT_CNT", "세대수"])
  );

  const startDate = asText(
    pick(row, ["START_DATE", "BEGIN_DE", "CONS_STRT_DE", "착공일", "공사시작일", "공사기간_시작", "STRTDAY"])
  );
  const endDateEst = asText(
    pick(row, ["END_DATE", "END_DE", "CONS_COMP_DE", "준공예정일", "완료예정일", "공사기간_종료", "ENDDAY"])
  );

  const status = deriveStatus(statusText, startDate, endDateEst);
  if (status !== "construction") return null;
  if (lat === null || lng === null) {
    if (!address) return null;
  }

  const sourceTitle = asText(
    pick(row, ["HOMEPAGE", "DETAIL_URL", "LINK", "URL", "자료링크", "상세URL", "DTL_URL"])
  );

  const templateLink = applyLinkTemplate(linkTemplate, row);
  const finalLink = sourceTitle || templateLink || sourceUrl;

  return {
    name,
    type: inferType(name, rawType),
    status: "construction",
    statusText,
    address,
    pnu,
    use,
    areaM2,
    floors,
    units,
    lat,
    lng,
    startDate,
    endDateEst,
    endDateEstText: endDateEst,
    source: sourceName,
    sourceLinks: [{ title: "공공데이터 원문", url: finalLink }],
    sourceFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function queueWriteForProjectRecordEvent(batch, item) {
  const dedupKey = buildDedupKey(item);
  const projectId = projectIdFromDedupKey(dedupKey);
  const sourceRecordId = asText(item.sourceRecordId) || `${item.name}|${item.address}|${item.startDate}|${item.endDateEst}`;
  const recordId = hashId("rec", `${item.source}|${projectId}|${sourceRecordId}`);
  const eventId = `ev_${recordId}`;
  const stage = incomingStageFromSource(item.source, item.statusText);

  const center = { lat: item.lat, lng: item.lng };
  const gridKeys = [gridIdFor(center.lat, center.lng, 12), gridIdFor(center.lat, center.lng, 14)];

  batch.set(
    db.collection("records").doc(recordId),
    {
      projectId,
      source: item.source,
      sourceRecordId,
      title: item.name,
      address_raw: item.address || "",
      address_norm: normalizeAddress(item.address),
      pnu: item.pnu || null,
      issued_at: item.issuedAt || item.startDate || null,
      applied_at: item.appliedAt || null,
      use: item.use || null,
      area_m2: item.areaM2 || null,
      floors: item.floors || null,
      units: item.units || null,
      evidence_urls: Array.isArray(item.sourceLinks) ? item.sourceLinks.map((v) => v.url).filter(Boolean) : [],
      lat: item.lat,
      lng: item.lng,
      geocode_accuracy: item.geocodeAccuracy || null,
      dedup_key: dedupKey,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    db.collection("projects").doc(projectId),
    {
      title: item.name,
      center,
      lat: item.lat,
      lng: item.lng,
      gridKeys,
      address_display: item.address || "",
      address_norm: normalizeAddress(item.address),
      pnu: item.pnu || null,
      status: item.status || "construction",
      projectStage: stage,
      category: guessCategory(item.use, item.name, item.type),
      confidence: item.geocodeAccuracy || 0.7,
      last_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      sourceLinks: Array.isArray(item.sourceLinks) ? item.sourceLinks : [],
      sources: admin.firestore.FieldValue.arrayUnion(item.source),
      sources_summary: {
        devPermit: /dev|개발행위/i.test(item.source),
        buildPermit: /build|건축/i.test(item.source),
        urbanPlan: /urban|도시계획/i.test(item.source),
        news: false,
      },
      type: item.type || "building",
      startDate: item.startDate || "",
      endDateEst: item.endDateEst || "",
      endDateEstText: item.endDateEstText || "",
    },
    { merge: true }
  );

  batch.set(
    db.doc(`projects/${projectId}/events/${eventId}`),
    {
      type: stage,
      at: item.startDate || item.issuedAt || null,
      text: item.name,
      evidence_url: Array.isArray(item.sourceLinks) && item.sourceLinks[0] ? item.sourceLinks[0].url : null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      source: item.source,
    },
    { merge: true }
  );

  return projectId;
}

async function rebuildTilesCache({ limit = 5000 } = {}) {
  const snap = await db
    .collection("projects")
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  const gridToProjectIds = new Map();
  snap.forEach((doc) => {
    const d = doc.data();
    const gridKeys = Array.isArray(d.gridKeys) ? d.gridKeys : [];
    for (const gridId of gridKeys) {
      if (!gridToProjectIds.has(gridId)) gridToProjectIds.set(gridId, new Set());
      gridToProjectIds.get(gridId).add(doc.id);
    }
  });

  let batch = db.batch();
  let opCount = 0;
  for (const [gridId, idSet] of gridToProjectIds.entries()) {
    const zoom = Number(String(gridId).split("_")[0]) || 12;
    batch.set(
      db.collection("tiles_cache").doc(gridId),
      {
        zoom,
        gridId,
        projectIds: Array.from(idSet),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    opCount += 1;

    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();

  return { grids: gridToProjectIds.size, projectsScanned: snap.size };
}

async function runPublicDataSync({ sourceFilter = "", persist = true } = {}) {
  const allSources = buildSourceConfigs();
  const sources = sourceFilter
    ? allSources.filter((s) => s.name === sourceFilter)
    : allSources;

  if (!sources.length) {
    throw new Error("No public data source configured. Set SEOUL_* or PUBLIC_DATA_SOURCES_JSON");
  }

  let totalRows = 0;
  let saved = 0;
  let skipped = 0;
  const reports = [];

  let batch = db.batch();
  let opCount = 0;
  const touchedProjectIds = new Set();

  for (const source of sources) {
    let sourceTotal = 0;
    let sourceSaved = 0;
    let sourceSkipped = 0;

    try {
      const { rows, sourceUrl } = await fetchRowsFromSource(source);

      for (const row of rows) {
        totalRows += 1;
        sourceTotal += 1;

        const normalized = normalizeRow(row, source.name, sourceUrl, source.linkTemplate || "");
        if (!normalized) {
          skipped += 1;
          sourceSkipped += 1;
          continue;
        }

        let item = normalized;
        if (item.lat === null || item.lng === null) {
          const geo = await geocodeAddressCached(item.address, { persistCache: persist });
          if (!geo) {
            skipped += 1;
            sourceSkipped += 1;
            continue;
          }
          item = { ...item, lat: geo.lat, lng: geo.lng, geocodeAccuracy: 0.8 };
        }

        if (persist) {
          const projectId = queueWriteForProjectRecordEvent(batch, item);
          touchedProjectIds.add(projectId);
          opCount += 3;
        }

        saved += 1;
        sourceSaved += 1;

        if (persist && opCount >= 390) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }

      reports.push({
        source: source.name,
        total: sourceTotal,
        saved: sourceSaved,
        skipped: sourceSkipped,
      });
    } catch (e) {
      reports.push({
        source: source.name,
        total: sourceTotal,
        saved: sourceSaved,
        skipped: sourceSkipped,
        error: String(e.message || e),
      });
    }
  }

  const curatedItems = getCuratedConstructionProjects();
  let curatedSaved = 0;
  for (const item of curatedItems) {
    totalRows += 1;
    if (persist) {
      const projectId = queueWriteForProjectRecordEvent(batch, item);
      touchedProjectIds.add(projectId);
      opCount += 3;
    }
    saved += 1;
    curatedSaved += 1;

    if (persist && opCount >= 390) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  reports.push({
    source: "curated-public:manual",
    total: curatedItems.length,
    saved: curatedSaved,
    skipped: 0,
  });

  if (persist && opCount > 0) await batch.commit();

  const rebuildOnSync = readSetting("REBUILD_TILES_ON_SYNC", "false") === "true";
  let tiles = null;
  if (persist && rebuildOnSync) {
    tiles = await rebuildTilesCache({ limit: 6000 });
  }

  return {
    totalRows,
    saved,
    skipped,
    sources: reports,
    touchedProjects: touchedProjectIds.size,
    tiles,
    syncedAt: new Date().toISOString(),
  };
}

exports.nearby = functions.https.onRequest(async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).send("");
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm || 2);
    const status = String(req.query.status || "construction");
    const type = String(req.query.type || "all");

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm)) {
      return res.status(400).json({ error: "Invalid lat/lng/radiusKm" });
    }

    const box = boundingBox(lat, lng, radiusKm);

    const snap = await db
      .collection("projects")
      .where("status", "==", status)
      .where("lat", ">=", box.minLat)
      .where("lat", "<=", box.maxLat)
      .limit(500)
      .get();

    const items = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (typeof d.lat !== "number" || typeof d.lng !== "number") return;
      if (d.lng < box.minLng || d.lng > box.maxLng) return;
      if (type !== "all" && d.type !== type) return;

      const dist = haversineKm(lat, lng, d.lat, d.lng);
      if (dist <= radiusKm) {
        items.push({
          id: doc.id,
          name: d.name || "",
          type: d.type || "building",
          status: d.status || "",
          statusText: d.statusText || "",
          address: d.address || "",
          lat: d.lat,
          lng: d.lng,
          startDate: d.startDate || "",
          endDateEst: d.endDateEst || "",
          endDateEstText: d.endDateEstText || "",
          source: d.source || "",
          sourceLinks: Array.isArray(d.sourceLinks) ? d.sourceLinks : [],
          sourceFetchedAt: d.sourceFetchedAt || null,
          updatedAt: d.updatedAt || null,
          distanceKm: Math.round(dist * 100) / 100,
        });
      }
    });

    const keySet = new Set(items.map((it) => `${it.name}|${it.lat}|${it.lng}`));
    const curatedItems = getCuratedConstructionProjectsForNearby();
    for (const c of curatedItems) {
      if (type !== "all" && c.type !== type) continue;
      const key = `${c.name}|${c.lat}|${c.lng}`;
      if (keySet.has(key)) continue;

      const dist = haversineKm(lat, lng, c.lat, c.lng);
      if (dist <= radiusKm) {
        items.push({
          ...c,
          distanceKm: Math.round(dist * 100) / 100,
        });
        keySet.add(key);
      }
    }

    items.sort((a, b) => a.distanceKm - b.distanceKm);
    return res.json({ count: items.length, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

exports.syncPublicData = functions.https.onRequest(async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type,x-sync-token");
      return res.status(204).send("");
    }

    if (!isAuthorizedSync(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const source = asText(req.query.source);
    const dryRun = String(req.query.dryRun || "") === "1";

    const result = await runPublicDataSync({ sourceFilter: source, persist: !dryRun });

    return res.json({ ok: true, dryRun, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

exports.syncPublicDataDaily = functions.pubsub
  .schedule("every day 03:30")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const result = await runPublicDataSync();
    console.log("syncPublicDataDaily", result);
    return null;
  });

exports.tilesCacheDaily = functions.pubsub
  .schedule("every day 06:10")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const result = await rebuildTilesCache({ limit: 6000 });
    console.log("tilesCacheDaily", result);
    return null;
  });

exports.rebuildTilesCache = functions.https.onRequest(async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type,x-sync-token");
      return res.status(204).send("");
    }

    if (!isAuthorizedSync(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = Number(req.query.limit || 6000);
    const result = await rebuildTilesCache({ limit: Number.isFinite(limit) ? limit : 6000 });
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

exports.projects = functions.https.onRequest(async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).send("");
    }

    const south = Number(req.query.south);
    const west = Number(req.query.west);
    const north = Number(req.query.north);
    const east = Number(req.query.east);
    const level = Number(req.query.level);
    const status = asText(req.query.status);
    const category = asText(req.query.category);

    if (![south, west, north, east].every(Number.isFinite)) {
      return res.status(400).json({ error: "bounds required" });
    }

    const zoom = chooseZoomByLevel(level);
    const gridIds = gridIdsForBounds(south, west, north, east, zoom).slice(0, 120);
    const tileSnaps = await Promise.all(gridIds.map((gid) => db.collection("tiles_cache").doc(gid).get()));

    const idSet = new Set();
    tileSnaps.forEach((snap) => {
      if (!snap.exists) return;
      const ids = Array.isArray(snap.get("projectIds")) ? snap.get("projectIds") : [];
      ids.forEach((id) => idSet.add(id));
    });

    const ids = Array.from(idSet).slice(0, 600);
    const projectDocs = ids.length
      ? await Promise.all(ids.map((id) => db.collection("projects").doc(id).get()))
      : [];

    let items = projectDocs
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => {
        if (!p.center || typeof p.center.lat !== "number" || typeof p.center.lng !== "number") return false;
        return p.center.lat >= south && p.center.lat <= north && p.center.lng >= west && p.center.lng <= east;
      });

    if (status) items = items.filter((p) => asText(p.projectStage) === status || asText(p.status) === status);
    if (category) items = items.filter((p) => asText(p.category) === category);

    const tsSeconds = (v) => {
      if (!v) return 0;
      if (typeof v.seconds === "number") return v.seconds;
      if (typeof v._seconds === "number") return v._seconds;
      return 0;
    };

    items.sort((a, b) => {
      const ta = tsSeconds(a.last_updated_at || a.updatedAt);
      const tb = tsSeconds(b.last_updated_at || b.updatedAt);
      return tb - ta;
    });

    return res.json({ zoom, gridCount: gridIds.length, count: items.length, items: items.slice(0, 300) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

exports.projectDetail = functions.https.onRequest(async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).send("");
    }

    const projectId = asText(req.query.id);
    if (!projectId) return res.status(400).json({ error: "id required" });

    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ error: "not_found" });

    const eventsSnap = await db
      .collection("projects")
      .doc(projectId)
      .collection("events")
      .orderBy("created_at", "desc")
      .limit(30)
      .get();

    const recordsSnap = await db
      .collection("records")
      .where("projectId", "==", projectId)
      .orderBy("issued_at", "desc")
      .limit(20)
      .get();

    const project = { id: projectSnap.id, ...projectSnap.data() };
    const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const records = recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.json({ project, events, records });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});
