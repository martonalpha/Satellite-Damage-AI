import type { BBox, GeoJsonGeometry } from "@/lib/satellite/types";

export function createBBoxAroundCoordinate(
  lon: number,
  lat: number,
  sizeMeters = 300,
): BBox {
  const halfSize = sizeMeters / 2;
  const latDelta = halfSize / 111_320;
  const lonDelta = halfSize / (111_320 * Math.cos((lat * Math.PI) / 180));

  return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
}

export function getGeometryCentroid(geometry: GeoJsonGeometry | null | undefined) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    return { lon, lat };
  }

  if (geometry.type === "Polygon") {
    return centroidFromRing(geometry.coordinates[0]);
  }

  if (geometry.type === "MultiPolygon") {
    const rings = geometry.coordinates
      .map((polygon) => polygon[0])
      .filter((ring) => ring.length > 0);
    const points = rings.flat();

    return averageCoordinate(points);
  }

  return null;
}

function centroidFromRing(ring: Array<[number, number]>) {
  if (ring.length === 0) {
    return null;
  }

  let twiceArea = 0;
  let lon = 0;
  let lat = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    lon += (x1 + x2) * cross;
    lat += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    return averageCoordinate(ring);
  }

  return {
    lon: lon / (3 * twiceArea),
    lat: lat / (3 * twiceArea),
  };
}

function averageCoordinate(points: Array<[number, number]>) {
  if (points.length === 0) {
    return null;
  }

  const sum = points.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 },
  );

  return {
    lon: sum.lon / points.length,
    lat: sum.lat / points.length,
  };
}
