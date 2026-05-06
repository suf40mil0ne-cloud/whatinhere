import https from "node:https";

const API_KEY = "93ab10ebd79f48772e33be1df27532bbfba053564aa834082eacb75da688c46b";

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
      const { page = 1, numOfRows = 1000 } = req.query;
      const url = `https://apis.data.go.kr/1741000/cctv_info?serviceKey=${API_KEY}&numOfRows=${numOfRows}&pageNo=${page}&type=json`;
      let r = await get(url);
      if ((r.status === 301 || r.status === 302) && r.location) r = await get(r.location);
      res.setHeader("x-safety-proxy", "vercel");
      return res.status(200).send(r.body);
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  console.error("[SAFETY_PROXY_CCTV_INFO_FAIL]", String(lastErr));
  res.status(500).json({ error: String(lastErr) });
}
