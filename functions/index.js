const functions = require("firebase-functions");
const admin = require("firebase-admin");

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

      const dist = haversineKm(lat, lng, d.lat, d.lng);
      if (dist <= radiusKm) {
        items.push({
          id: doc.id,
          name: d.name || "",
          type: d.type || "",
          status: d.status || "",
          address: d.address || "",
          lat: d.lat,
          lng: d.lng,
          startDate: d.startDate || "",
          endDateEst: d.endDateEst || "",
          endDateEstText: d.endDateEstText || "",
          sourceLinks: Array.isArray(d.sourceLinks) ? d.sourceLinks : [],
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
