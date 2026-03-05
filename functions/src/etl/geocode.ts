export interface GeocodeResult {
  lat?: number;
  lng?: number;
  accuracy?: number;
}

export async function geocodeKakao(address: string, kakaoRestKey: string): Promise<GeocodeResult> {
  const q = encodeURIComponent(address);
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${q}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoRestKey}` } });
  if (!res.ok) return {};
  const json: any = await res.json();
  const doc = json?.documents?.[0];
  const lat = doc?.y ? Number(doc.y) : undefined;
  const lng = doc?.x ? Number(doc.x) : undefined;
  const accuracy = lat && lng ? (doc?.road_address ? 0.9 : 0.7) : undefined;
  return { lat, lng, accuracy };
}
