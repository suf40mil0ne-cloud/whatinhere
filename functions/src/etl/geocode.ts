import fetch from "node-fetch";

export interface GeocodeResult {
  lat?: number;
  lng?: number;
  accuracy?: number;
}

export async function geocodeKakao(address: string, restKey: string): Promise<GeocodeResult> {
  try {
    if (!address || !restKey) return {};

    const q = encodeURIComponent(address);
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${q}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
    });

    if (!res.ok) return {};

    const json = (await res.json()) as {
      documents?: Array<{ x?: string; y?: string; road_address?: unknown }>;
    };

    const doc = Array.isArray(json.documents) ? json.documents[0] : undefined;
    const lat = doc?.y ? Number(doc.y) : undefined;
    const lng = doc?.x ? Number(doc.x) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};

    const accuracy = doc?.road_address ? 0.9 : 0.7;
    return { lat, lng, accuracy };
  } catch {
    return {};
  }
}
