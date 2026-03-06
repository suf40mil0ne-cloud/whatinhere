import type { Env } from "../types";

interface GeocodeResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(env: Env, address: string): Promise<GeocodeResult | null> {
  if (!env.KAKAO_REST_API_KEY || !address) return null;

  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}`,
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    documents?: Array<{ x: string; y: string }>;
  };

  const first = payload.documents?.[0];
  if (!first) return null;

  const lng = Number(first.x);
  const lat = Number(first.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}
