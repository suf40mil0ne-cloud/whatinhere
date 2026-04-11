import http from "node:http";

const PORT = Number(process.env.PORT ?? 8788);
const CHILDCARE_HOST = process.env.CHILDCARE_HOST ?? "api.childcare.go.kr";
const CHILDCARE_PORT = Number(process.env.CHILDCARE_PORT ?? 80);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20000);
const UPSTREAM_RETRIES = Number(process.env.UPSTREAM_RETRIES ?? 2);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 60000);

const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  timeout: UPSTREAM_TIMEOUT_MS,
});

const responseCache = new Map();

function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function buildUpstreamHeaders(req) {
  return {
    host: CHILDCARE_HOST,
    "user-agent": "Mozilla/5.0",
    accept: "*/*",
    connection: "keep-alive",
    referer: "http://api.childcare.go.kr",
    "accept-encoding": "identity",
    "x-forwarded-host": req.headers.host ?? "",
    "x-forwarded-proto": req.socket.encrypted ? "https" : "http",
  };
}

function isCacheable(method) {
  return method === "GET" || method === "HEAD";
}

function cacheKey(method, targetPath) {
  return `${method}:${targetPath}`;
}

function getCachedResponse(method, targetPath, skipCache = false) {
  if (!isCacheable(method) || skipCache) return null;
  const key = cacheKey(method, targetPath);
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  console.log(`[childcare-proxy] cache hit key=${key} ttlMs=${entry.expiresAt - Date.now()}`);
  return entry;
}

function setCachedResponse(method, targetPath, status, headers, bodyBuffer) {
  if (!isCacheable(method)) return;
  const key = cacheKey(method, targetPath);
  const expiresAt = Date.now() + CACHE_TTL_MS;
  responseCache.set(key, { status, headers, bodyBuffer, expiresAt });
  setTimeout(() => {
    const current = responseCache.get(key);
    if (current && current.expiresAt === expiresAt) {
      responseCache.delete(key);
    }
  }, CACHE_TTL_MS).unref?.();
  console.log(`[childcare-proxy] cache store key=${key} ttlMs=${CACHE_TTL_MS} bytes=${bodyBuffer.length}`);
}

function sendCachedResponse(res, entry, method) {
  res.writeHead(entry.status, entry.headers);
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(entry.bodyBuffer);
}

function fetchUpstreamOnce(method, targetPath, req) {
  return new Promise((resolve, reject) => {
    const upstream = http.request(
      {
        agent: keepAliveAgent,
        host: CHILDCARE_HOST,
        port: CHILDCARE_PORT,
        method,
        path: targetPath,
        headers: buildUpstreamHeaders(req),
      },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamRes.on("end", () => {
          resolve({
            status: upstreamRes.statusCode ?? 502,
            headers: {
              "content-type": upstreamRes.headers["content-type"] ?? "application/octet-stream",
              "cache-control": "no-store",
              "x-childcare-proxy": "node-http",
              "x-childcare-upstream-host": CHILDCARE_HOST,
              "x-childcare-upstream-path": targetPath,
            },
            bodyBuffer: Buffer.concat(chunks),
          });
        });
        upstreamRes.on("error", reject);
      }
    );

    upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      upstream.destroy(new Error(`Upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`));
    });
    upstream.on("error", reject);

    if (method === "GET" || method === "HEAD") {
      upstream.end();
      return;
    }

    req.pipe(upstream);
  });
}

async function fetchWithRetry(method, targetPath, req, retries = UPSTREAM_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      console.log(`[childcare-proxy] upstream attempt=${attempt + 1} target=${targetPath}`);
      return await fetchUpstreamOnce(method, targetPath, req);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[childcare-proxy] upstream attempt failed attempt=${attempt + 1} target=${targetPath} error=${message}`);
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function proxyChildcare(req, res, targetPath, skipCache = false) {
  const method = req.method ?? "GET";
  const started = Date.now();
  console.log(`[childcare-proxy] upstream start method=${method} target=${targetPath} skipCache=${skipCache}`);

  const cached = getCachedResponse(method, targetPath, skipCache);
  if (cached) {
    sendCachedResponse(res, cached, method);
    return;
  }

  try {
    const result = await fetchWithRetry(method, targetPath, req, UPSTREAM_RETRIES);
    const durationMs = Date.now() - started;
    console.log(
      `[childcare-proxy] upstream done status=${result.status} durationMs=${durationMs} contentType=${result.headers["content-type"] ?? ""}`
    );
    setCachedResponse(method, targetPath, result.status, result.headers, result.bodyBuffer);
    res.writeHead(result.status, result.headers);
    if (method === "HEAD") {
      res.end();
      return;
    }
    res.end(result.bodyBuffer);
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[childcare-proxy] upstream error durationMs=${durationMs} target=${targetPath} error=${message}`);
    console.error("[CHILDCARE_PROXY_FAIL]", {
      url: targetPath,
      retries: UPSTREAM_RETRIES,
      time: new Date().toISOString(),
    });
    writeJson(res, 502, {
      error: message,
      targetPath,
      upstreamHost: CHILDCARE_HOST,
      durationMs,
      retries: UPSTREAM_RETRIES,
    });
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    writeJson(res, 400, { error: "Missing URL" });
    return;
  }

  const incoming = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (incoming.pathname !== "/childcare") {
    writeJson(res, 404, { error: "Not found" });
    return;
  }

  const upstreamPath = incoming.searchParams.get("path");
  if (!upstreamPath || !upstreamPath.startsWith("/")) {
    writeJson(res, 400, { error: "Query param 'path' must start with /" });
    return;
  }

  const forward = new URL(`http://${CHILDCARE_HOST}${upstreamPath}`);
  const skipCache = incoming.searchParams.has("cacheBust");
  for (const [key, value] of incoming.searchParams.entries()) {
    if (key === "path" || key === "cacheBust") continue;
    forward.searchParams.append(key, value);
  }

  console.log(`[childcare-proxy] inbound method=${req.method} clientPath=${incoming.pathname} target=${forward.pathname}${forward.search} skipCache=${skipCache}`);
  void proxyChildcare(req, res, `${forward.pathname}${forward.search}`, skipCache);
});

server.keepAliveTimeout = 61_000;
server.headersTimeout = 65_000;

server.listen(PORT, () => {
  console.log(`childcare proxy listening on http://127.0.0.1:${PORT}/childcare retries=${UPSTREAM_RETRIES} cacheTtlMs=${CACHE_TTL_MS}`);
});
