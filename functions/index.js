const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

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
  const n = Number(v);
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

function inferType(name, rawType) {
  const merged = `${asText(name)} ${asText(rawType)}`;
  if (/지하철|역사|전철|철도|tram|metro/i.test(merged)) return "subway";
  if (/도로|교량|터널|고속|인터체인지|ic|jc|램프/i.test(merged)) return "road";
  return "building";
}

function makeProjectId(sourceName, name, address, lat, lng) {
  const base = `${sourceName}|${name}|${address}|${lat}|${lng}`;
  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 24);
}

function isAuthorizedSync(req) {
  const expected = process.env.SYNC_TOKEN || "";
  if (!expected) return false;
  const token = String(req.query.token || req.get("x-sync-token") || "");
  return token === expected;
}

async function fetchSeoulDatasetRows() {
  const apiKey = process.env.SEOUL_OPEN_API_KEY || "";
  const dataset = process.env.SEOUL_DATASET_NAME || "tbLnOpendataW";
  const maxRows = Math.max(100, Math.min(5000, Number(process.env.SEOUL_DATASET_MAX_ROWS || 1000)));

  if (!apiKey) {
    throw new Error("SEOUL_OPEN_API_KEY is missing");
  }

  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${encodeURIComponent(dataset)}/1/${maxRows}/`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Public data request failed: ${resp.status}`);
  }

  const json = await resp.json();
  const root = json[dataset] || Object.values(json).find((v) => v && typeof v === "object" && Array.isArray(v.row));
  if (!root || !Array.isArray(root.row)) {
    throw new Error("Unexpected public data response format");
  }

  return {
    sourceName: `seoul-openapi:${dataset}`,
    sourceUrl: url,
    rows: root.row,
  };
}

function normalizeRow(row, sourceName, sourceUrl) {
  const name = asText(
    pick(row, ["BIZ_NM", "CNSTRCT_NM", "PRJ_NM", "SITETITLE", "TITLE", "NAME", "사업명", "공사명"])
  );
  const address = asText(
    pick(row, ["ADDR", "ADDRESS", "SITE_ADDR", "RD_ADDR", "ROAD_ADDR", "지번주소", "도로명주소", "주소"])
  );

  const lat = asNumber(
    pick(row, ["YDNTS", "LAT", "WGS84_LAT", "Y", "위도", "Y_COORD", "YCOORD"])
  );
  const lng = asNumber(
    pick(row, ["XDNTS", "LNG", "WGS84_LON", "WGS84_LNG", "X", "경도", "X_COORD", "XCOORD"])
  );

  if (!name || lat === null || lng === null) return null;

  const status = asText(
    pick(row, ["STATUS", "STAT_NM", "PRGS_STAT", "CONS_STAT", "공정상태", "상태"])
  ) || "construction";

  const rawType = asText(
    pick(row, ["TYPE", "BIZ_SE", "FACILITY_TYPE", "공종", "시설구분", "사업구분"])
  );

  const startDate = asText(
    pick(row, ["START_DATE", "BEGIN_DE", "CONS_STRT_DE", "착공일", "공사시작일", "공사기간_시작"])
  );
  const endDateEst = asText(
    pick(row, ["END_DATE", "END_DE", "CONS_COMP_DE", "준공예정일", "완료예정일", "공사기간_종료"])
  );

  const sourceTitle = asText(
    pick(row, ["HOMEPAGE", "DETAIL_URL", "LINK", "URL", "자료링크"])
  );

  return {
    name,
    type: inferType(name, rawType),
    status,
    address,
    lat,
    lng,
    startDate,
    endDateEst,
    endDateEstText: endDateEst,
    source: sourceName,
    sourceLinks: sourceTitle
      ? [{ title: "공공데이터 원문", url: sourceTitle }]
      : [{ title: "공공데이터 조회", url: sourceUrl }],
    sourceFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    const { sourceName, sourceUrl, rows } = await fetchSeoulDatasetRows();

    let total = 0;
    let saved = 0;
    let skipped = 0;

    let batch = db.batch();
    let opCount = 0;

    for (const row of rows) {
      total += 1;
      const n = normalizeRow(row, sourceName, sourceUrl);
      if (!n) {
        skipped += 1;
        continue;
      }

      const docId = makeProjectId(sourceName, n.name, n.address, n.lat, n.lng);
      const ref = db.collection("projects").doc(docId);
      batch.set(ref, n, { merge: true });
      opCount += 1;
      saved += 1;

      if (opCount >= 400) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    return res.json({
      ok: true,
      source: sourceName,
      total,
      saved,
      skipped,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});
