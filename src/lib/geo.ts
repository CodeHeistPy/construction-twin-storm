const M_PER_DEG_LAT = 111_320;

/** Offset a WGS84 point by east/north metres (small-distance approximation). */
export function offsetMeters(
  lon: number,
  lat: number,
  east: number,
  north: number,
): { longitude: number; latitude: number } {
  return {
    longitude: lon + east / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)),
    latitude: lat + north / M_PER_DEG_LAT,
  };
}

/** Ring of [lon, lat] approximating an ellipse, for polygon graphics. */
export function ellipseRing(
  lon: number,
  lat: number,
  radiusEast: number,
  radiusNorth: number,
  rotationDeg = 0,
  steps = 64,
): number[][] {
  const r = (rotationDeg * Math.PI) / 180;
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.cos(a) * radiusEast;
    const y = Math.sin(a) * radiusNorth;
    const p = offsetMeters(lon, lat, x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r));
    ring.push([p.longitude, p.latitude]);
  }
  return ring;
}
