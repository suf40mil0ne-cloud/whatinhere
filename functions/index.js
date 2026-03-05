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

  if (!name || lat === null || lng === null) return null;

  const statusText = asText(
    pick(row, [
      "STATUS", "STAT_NM", "PRGS_STAT", "CONS_STAT", "CSTRN_STTUS", "공정상태", "상태", "진행상태", "착공여부",
    ])
  );

  const rawType = asText(
    pick(row, ["TYPE", "BIZ_SE", "FACILITY_TYPE", "공종", "시설구분", "사업구분", "시설종류", "공사종류"])
  );

  const startDate = asText(
    pick(row, ["START_DATE", "BEGIN_DE", "CONS_STRT_DE", "착공일", "공사시작일", "공사기간_시작", "STRTDAY"])
  );
  const endDateEst = asText(
    pick(row, ["END_DATE", "END_DE", "CONS_COMP_DE", "준공예정일", "완료예정일", "공사기간_종료", "ENDDAY"])
  );

  const status = deriveStatus(statusText, startDate, endDateEst);
  if (status !== "construction") return null;

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

        if (persist) {
          const docId = makeProjectId(normalized.name, normalized.address, normalized.lat, normalized.lng);
          const ref = db.collection("projects").doc(docId);
          batch.set(ref, normalized, { merge: true });
          opCount += 1;
        }
        saved += 1;
        sourceSaved += 1;

        if (persist && opCount >= 400) {
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

  if (persist && opCount > 0) {
    await batch.commit();
  }

  return {
    totalRows,
    saved,
    skipped,
    sources: reports,
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
