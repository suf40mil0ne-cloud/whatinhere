const GEO_CACHE: Record<string, { lat: number; lng: number }> = {
  "경기 고양시 일산서구 킨텍스로 217-60": { lat: 37.6679, lng: 126.7454 },
  "경기 고양시 일산동구 장항동 1234": { lat: 37.6618, lng: 126.7672 },
  "경기 고양시 일산서구 대화동 2200 일원": { lat: 37.6762, lng: 126.7475 },
  "경기 고양시 일산서구 대화동 환승구역": { lat: 37.6661, lng: 126.7483 },
  "경기 고양시 일산서구 대화동~덕이동 구간": { lat: 37.6852, lng: 126.7441 },
  "경기 고양시 일산서구 주엽동 999": { lat: 37.6701, lng: 126.7602 },
  "경기 김포시 마산동 역세권 예정지": { lat: 37.6425, lng: 126.6318 },
  "경기 김포시 고촌읍 향산리 산업부지": { lat: 37.6008, lng: 126.7651 },
  "경기 김포시 풍무동 805": { lat: 37.6131, lng: 126.7232 },
  "서울 중구 세종대로 110 일원": { lat: 37.5673, lng: 126.9779 },
  "서울 마포구 상암동 1605": { lat: 37.5796, lng: 126.8895 },
  "서울 영등포구 여의도동 23-1": { lat: 37.5241, lng: 126.9241 },
};

export function geocodeAddress(address: string | null | undefined): { lat: number; lng: number } | null {
  if (!address) return null;
  return GEO_CACHE[address] ?? null;
}
