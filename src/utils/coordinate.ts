import type { MapPoint } from "../types/project";

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 900;

export function clampPoint(point: MapPoint): MapPoint {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

export function relativeToCanvas(point: MapPoint) {
  return {
    x: point.x * MAP_WIDTH,
    y: point.y * MAP_HEIGHT,
  };
}

export function canvasToRelative(point: MapPoint) {
  return clampPoint({
    x: point.x / MAP_WIDTH,
    y: point.y / MAP_HEIGHT,
  });
}

export function pointsToCanvas(points: MapPoint[]) {
  return points.flatMap((point) => [point.x * MAP_WIDTH, point.y * MAP_HEIGHT]);
}
