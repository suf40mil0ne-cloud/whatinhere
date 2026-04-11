export default async function handler(req, res) {
    try {
      const { path, cacheBust, ...query } = req.query;
  
      if (!path) {
        return res.status(400).send("Missing path");
      }
  
      const qs = new URLSearchParams(query).toString();
      const url = `http://api.childcare.go.kr${path}?${qs}`;
  
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
          "Connection": "keep-alive",
          "Referer": "http://api.childcare.go.kr"
        }
      });
  
      const text = await response.text();
  
      res.setHeader("x-childcare-proxy", "vercel");
      res.status(200).send(text);
  
    } catch (e) {
      console.error("[CHILDCARE_PROXY_FAIL]", e);
      res.status(500).send("Proxy error");
    }
  }