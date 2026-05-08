import { badRequest, json } from "./http";

export async function richgoSearch(request: Request): Promise<Response> {
  const url = new URL(request.url, "http://localhost");
  const name = url.searchParams.get("name");
  if (!name) return badRequest("name is required");

  try {
    const apiUrl = `https://api-m.richgo.ai/api/data/map/danji?keyword=${encodeURIComponent(name)}`;
    const res = await fetch(apiUrl, { headers: { accept: "application/json" } });
    if (!res.ok) return json({ danjiId: null });

    const data = await res.json() as { danjiInfos?: Array<{ id: string | number }> };
    const danjiId = data.danjiInfos?.[0]?.id ?? null;
    return json({ danjiId: danjiId !== null ? String(danjiId) : null });
  } catch {
    return json({ danjiId: null });
  }
}
