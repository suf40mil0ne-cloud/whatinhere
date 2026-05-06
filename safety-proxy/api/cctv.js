import https from "node:https";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location, body: Buffer.concat(chunks).toString() }));
      res.on("error", reject);
    });
    req.setTimeout(25000, () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const qs = new URLSearchParams(req.query).toString();
      let url = `https://www.safetydata.go.kr/V2/api/DSSP-IF-20011?${qs}`;
      let r = await get(url);
      if ((r.status === 301 || r.status === 302) && r.location) {
        r = await get(r.location);
      }
      res.setHeader("x-safety-proxy", "vercel");
      return res.status(200).send(r.body);
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  console.error("[SAFETY_PROXY_CCTV_FAIL]", String(lastErr));
  res.status(500).json({ error: String(lastErr) });
}
