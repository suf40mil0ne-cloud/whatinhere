export type GridZoom = 12 | 14;

function cellSizeDeg(zoom: GridZoom): number {
  return zoom === 12 ? 0.02 : 0.005;
}

export function gridIdFor(lat: number, lng: number, zoom: GridZoom): string {
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  const cell = cellSizeDeg(zoom);
  const x = Math.floor((safeLng + 180) / cell);
  const y = Math.floor((safeLat + 90) / cell);
  return `${zoom}_${x}_${y}`;
}

export function gridIdsForBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  zoom: GridZoom
): string[] {
  if (![south, west, north, east].every(Number.isFinite)) return [];

  const cell = cellSizeDeg(zoom);
  const x1 = Math.floor((west + 180) / cell);
  const x2 = Math.floor((east + 180) / cell);
  const y1 = Math.floor((south + 90) / cell);
  const y2 = Math.floor((north + 90) / cell);

  const ids: string[] = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
      ids.push(`${zoom}_${x}_${y}`);
    }
  }
  return ids;
}

export function chooseZoomByMapLevel(kakaoLevel?: number): GridZoom {
  if (typeof kakaoLevel === "number" && Number.isFinite(kakaoLevel) && kakaoLevel <= 5) {
    return 14;
  }
  return 12;
}
