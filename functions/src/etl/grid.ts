export type GridZoom = 12 | 14;

function cellSizeDeg(zoom: GridZoom) {
  return zoom === 12 ? 0.02 : 0.005;
}

export function gridIdFor(lat: number, lng: number, zoom: GridZoom) {
  const cell = cellSizeDeg(zoom);
  const x = Math.floor((lng + 180) / cell);
  const y = Math.floor((lat + 90) / cell);
  return `${zoom}_${x}_${y}`;
}

export function gridIdsForBounds(south: number, west: number, north: number, east: number, zoom: GridZoom) {
  const cell = cellSizeDeg(zoom);
  const x1 = Math.floor((west + 180) / cell);
  const x2 = Math.floor((east + 180) / cell);
  const y1 = Math.floor((south + 90) / cell);
  const y2 = Math.floor((north + 90) / cell);

  const ids: string[] = [];
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      ids.push(`${zoom}_${x}_${y}`);
    }
  }
  return ids;
}

export function chooseZoomByMapLevel(kakaoLevel?: number): GridZoom {
  if (typeof kakaoLevel === "number" && kakaoLevel <= 5) return 14;
  return 12;
}
